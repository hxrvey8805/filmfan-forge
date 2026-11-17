BEGIN;

-- Permission is per account and purpose. No existing account is opted in.
CREATE TABLE public.cinegeek_ai_permissions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature text NOT NULL CHECK (feature IN ('companion','smart_lists')),
  notice_version text NOT NULL CHECK (notice_version='2026-11-17'),
  allowed boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,feature)
);
ALTER TABLE public.cinegeek_ai_permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cinegeek_ai_permissions FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_ai_privacy_choices() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_object_agg(feature,allowed),'{}'::jsonb)
 FROM cinegeek_ai_permissions WHERE user_id=auth.uid() AND notice_version='2026-11-17';
$$;
CREATE FUNCTION public.set_ai_privacy_choice(p_feature text,p_allowed boolean,p_version text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid()) THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF p_feature IS NULL OR p_feature NOT IN ('companion','smart_lists') OR p_allowed IS NULL
   OR p_version IS DISTINCT FROM '2026-11-17' THEN RAISE EXCEPTION 'Invalid privacy choice'; END IF;
 INSERT INTO cinegeek_ai_permissions(user_id,feature,notice_version,allowed) VALUES(auth.uid(),p_feature,p_version,p_allowed)
 ON CONFLICT(user_id,feature) DO UPDATE SET allowed=excluded.allowed,notice_version=excluded.notice_version,updated_at=now();
 RETURN public.get_ai_privacy_choices();
END;
$$;
CREATE FUNCTION public.cinegeek_ai_allowed(p_user uuid,p_feature text,p_version text) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM cinegeek_ai_permissions p JOIN auth.users u ON u.id=p.user_id
  WHERE p.user_id=p_user AND p.feature=p_feature AND p.notice_version=p_version AND p.allowed);
$$;
REVOKE ALL ON FUNCTION public.get_ai_privacy_choices(), public.set_ai_privacy_choice(text,boolean,text),
 public.cinegeek_ai_allowed(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_ai_privacy_choices(), public.set_ai_privacy_choice(text,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cinegeek_ai_allowed(uuid,text,text) TO service_role;

-- These older tables had no auth-user foreign key. NOT VALID avoids deleting
-- historical orphan records in this release, but enforces all new writes and
-- cascades deletion of every existing row belonging to the deleted account.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['user_packs','user_collection','user_stats','user_ai_usage','ai_conversations',
  'companion_pro_entitlements','companion_usage_accounts','companion_question_packs','companion_sol_calls'] LOOP
  EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY(user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID',t,t||'_privacy_owner_fk');
 END LOOP;
END $$;
ALTER TABLE public.companion_question_requests DROP CONSTRAINT companion_question_requests_user_id_fkey,
 ADD CONSTRAINT companion_question_requests_user_id_fkey FOREIGN KEY(user_id) REFERENCES public.companion_usage_accounts(user_id) ON DELETE CASCADE;
ALTER TABLE public.companion_question_calls DROP CONSTRAINT companion_question_calls_call_id_fkey,
 DROP CONSTRAINT companion_question_calls_request_id_fkey,
 ADD CONSTRAINT companion_question_calls_call_id_fkey FOREIGN KEY(call_id) REFERENCES public.companion_sol_calls(id) ON DELETE CASCADE,
 ADD CONSTRAINT companion_question_calls_request_id_fkey FOREIGN KEY(request_id) REFERENCES public.companion_question_requests(id) ON DELETE CASCADE;

-- Retain only an unlinked Apple original-purchase tombstone to stop a purchase
-- being reassigned after deletion. Erase account token, detailed transactions
-- and notification IDs. Aggregate AI spending is deliberately NOT refunded.
CREATE FUNCTION public.cinegeek_erase_purchase_details() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prefix text; BEGIN
 FOREACH prefix IN ARRAY ARRAY['apple_production','apple_review'] LOOP
  IF to_regclass('public.'||prefix||'_owners') IS NOT NULL THEN
   EXECUTE format('DELETE FROM public.%I WHERE original_id IN (SELECT original_id FROM public.%I WHERE user_id=$1)',prefix||'_notifications',prefix||'_owners') USING OLD.id;
   EXECUTE format('DELETE FROM public.%I WHERE original_id IN (SELECT original_id FROM public.%I WHERE user_id=$1)',prefix||'_transactions',prefix||'_owners') USING OLD.id;
   EXECUTE format('UPDATE public.%I SET user_id=NULL,account_token=gen_random_uuid() WHERE user_id=$1',prefix||'_owners') USING OLD.id;
  END IF;
 END LOOP;
 RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.cinegeek_erase_purchase_details() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cinegeek_erase_purchase_details BEFORE DELETE ON auth.users
 FOR EACH ROW EXECUTE FUNCTION public.cinegeek_erase_purchase_details();
-- The endpoint must refuse deletion until the whole transactional migration exists.
CREATE FUNCTION public.cinegeek_account_privacy_ready() RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT '2026-11-17'::text $$;
REVOKE ALL ON FUNCTION public.cinegeek_account_privacy_ready() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cinegeek_account_privacy_ready() TO service_role;
COMMIT;
