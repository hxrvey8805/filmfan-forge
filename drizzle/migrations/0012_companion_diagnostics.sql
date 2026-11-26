-- Fixed categories/counts attached to the existing private request record.
-- No raw prompts, captions or answers. Existing request access and account
-- deletion rules apply; finished work checkpoints are still purged normally.
ALTER TABLE public.companion_question_requests ADD COLUMN check_diagnostics jsonb NOT NULL DEFAULT '[]'
  CHECK(jsonb_typeof(check_diagnostics)='array' AND jsonb_array_length(check_diagnostics)<=4
    AND octet_length(check_diagnostics::text)<=524288);

CREATE FUNCTION public.save_companion_diagnostics(p_user_id uuid,p_request_id uuid,p_attempt uuid,
  p_revision text,p_events jsonb,p_dropped integer DEFAULT 0)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.companion_question_requests; e jsonb; k text; v jsonb; kept jsonb;
BEGIN
  IF p_revision IS NULL OR p_revision !~ '^watch-checks-[a-z0-9-]{1,80}$'
    OR p_events IS NULL OR jsonb_typeof(p_events)<>'array' OR jsonb_array_length(p_events)>256
    OR octet_length(p_events::text)>65536 OR p_dropped IS NULL OR p_dropped<0 THEN
    RAISE EXCEPTION 'Invalid companion diagnostics';
  END IF;
  -- Defense in depth: even a server bug cannot persist free text through this
  -- RPC. Reject unknown fields and values, rather than relying only on TS.
  FOR e IN SELECT value FROM jsonb_array_elements(p_events) LOOP
    IF jsonb_typeof(e)<>'object' OR NOT(e ? 'stage') THEN RAISE EXCEPTION 'Invalid diagnostic event'; END IF;
    FOR k,v IN SELECT * FROM jsonb_each(e) LOOP
      IF k IN ('attempt','paragraph','paragraphs','sources','episodes','call','elapsedMs') THEN
        IF jsonb_typeof(v)<>'number' OR v::text !~ '^[0-9]{1,8}$' OR (v::text)::numeric>43200000 THEN RAISE EXCEPTION 'Invalid diagnostic number'; END IF;
      ELSIF k='partial' THEN
        IF jsonb_typeof(v)<>'boolean' THEN RAISE EXCEPTION 'Invalid diagnostic flag'; END IF;
      ELSIF k='issues' THEN
        IF jsonb_typeof(v)<>'array' OR jsonb_array_length(v)>8 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v) x
          WHERE jsonb_typeof(x)<>'string' OR x#>>'{}' NOT IN ('identity','speaker','action','cause','timing','spoiler','relevance','citation')) THEN
          RAISE EXCEPTION 'Invalid diagnostic issues'; END IF;
      ELSE
        IF jsonb_typeof(v)<>'string' THEN RAISE EXCEPTION 'Invalid diagnostic category'; END IF;
        IF NOT (CASE k
          WHEN 'stage' THEN v#>>'{}' IN ('context_rejected','writer_invalid','writer_rejected','review_invalid','review_rejected',
            'review_check_rejected','answer_accepted','answer_exhausted','sources_ready','selection_invalid','answer_gap','model_call')
          WHEN 'reason' THEN v#>>'{}' IN ('invalid_context','source_boundary','duplicate_source','shape','no_points','paragraph','check_shape',
            'receipt_count','receipt_source','receipt_range','receipt_mixed_format','receipt_missing_quote','receipt_length','receipt_mismatch',
            'search_terms','source_size','batch_selection','combined_size','budget_selection','budget_exceeded',
            'no_sources','no_selection','no_scene','selection_rejected','explanation_rejected')
          WHEN 'issue' THEN v#>>'{}' IN ('identity','speaker','action','cause','timing','spoiler','relevance','citation')
          WHEN 'origin' THEN v#>>'{}' IN ('reviewer','receipt','local')
          WHEN 'phase' THEN v#>>'{}' IN ('writer','verifier','analyst','unspecified')
          WHEN 'state' THEN v#>>'{}' IN ('started','returned','failed')
          WHEN 'inputHash' THEN v#>>'{}' ~ '^[a-f0-9]{64}$'
          ELSE false END) THEN RAISE EXCEPTION 'Invalid diagnostic category'; END IF;
      END IF;
    END LOOP;
  END LOOP;
  SELECT * INTO r FROM public.companion_question_requests
    WHERE id=p_request_id AND user_id=p_user_id AND attempt=p_attempt FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Idempotent for one worker; stale workers cannot overwrite a resumed run.
  SELECT coalesce(jsonb_agg(value ORDER BY ordinal),'[]') INTO kept FROM (
    SELECT value,ordinal FROM jsonb_array_elements(r.check_diagnostics) WITH ORDINALITY t(value,ordinal)
    WHERE value->>'attempt'<>p_attempt::text ORDER BY ordinal DESC LIMIT 3
  ) previous;
  UPDATE public.companion_question_requests SET check_diagnostics=kept||jsonb_build_array(jsonb_build_object(
    'attempt',p_attempt,'revision',p_revision,'recorded_at',now(),'dropped',p_dropped,'events',p_events)) WHERE id=r.id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.save_companion_diagnostics(uuid,uuid,uuid,text,jsonb,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_companion_diagnostics(uuid,uuid,uuid,text,jsonb,integer) TO service_role;