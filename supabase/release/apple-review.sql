-- PREPARED, NOT APPLIED. Release-compatible Apple Sandbox for explicitly enrolled
-- review/test accounts only. No production receipt, paid entitlement, enrolment,
-- policy activation, AI budget change or free trial is created by this script.
-- Uses separate Sandbox ledger/entitlements; normal app RPCs see verified test
-- access only while the operator's account enrolment remains valid.
BEGIN;
CREATE TABLE public.apple_review_testers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK(expires_at>starts_at AND expires_at<=starts_at+interval '30 days')
);
CREATE TABLE public.apple_review_entitlements (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK(plan IN ('monthly','annual')),
  anchor timestamptz NOT NULL,
  valid_until timestamptz NOT NULL CHECK(valid_until>anchor),
  revoked boolean NOT NULL DEFAULT false,
  verified_transaction_id text NOT NULL UNIQUE
);
ALTER TABLE public.apple_review_testers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apple_review_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.apple_review_testers,public.apple_review_entitlements FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.apple_review_policy (
  id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT false,
  sales_enabled boolean NOT NULL DEFAULT false, CHECK(NOT sales_enabled OR enabled)
);
INSERT INTO public.apple_review_policy(id) VALUES(true);
-- Preserve a tombstone when an account is deleted. Its Apple purchase cannot
-- be claimed by a new account. No receipt JWS or customer payment data stored.
CREATE TABLE public.apple_review_owners (
  original_id text PRIMARY KEY CHECK(original_id ~ '^[0-9]{1,30}$'),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  account_token uuid NOT NULL,
  kind text NOT NULL CHECK(kind='subscription')
);
CREATE TABLE public.apple_review_transactions (
  transaction_id text PRIMARY KEY CHECK(transaction_id ~ '^[0-9]{1,30}$'),
  original_id text NOT NULL REFERENCES public.apple_review_owners(original_id),
  product_id text NOT NULL CHECK(product_id IN ('app.cinegeek.mobile.pro.monthly',
    'app.cinegeek.mobile.pro.annual')),
  purchased_at timestamptz NOT NULL, original_purchased_at timestamptz NOT NULL,
  signed_at timestamptz NOT NULL, reconciled_at timestamptz NOT NULL,
  expires_at timestamptz, revoked_at timestamptz, upgraded boolean NOT NULL,
  subscription_status integer CHECK(subscription_status BETWEEN 1 AND 5),
  CHECK(original_purchased_at<=purchased_at AND signed_at>=purchased_at),
  CHECK(expires_at IS NULL OR expires_at>purchased_at)
);
CREATE INDEX apple_review_lineage ON public.apple_review_transactions(original_id,purchased_at DESC);
CREATE TABLE public.apple_review_notifications (
  notification_id uuid PRIMARY KEY,
  original_id text NOT NULL REFERENCES public.apple_review_owners(original_id),
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.apple_review_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apple_review_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apple_review_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apple_review_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.apple_review_policy,public.apple_review_owners,
  public.apple_review_transactions,public.apple_review_notifications FROM PUBLIC,anon,authenticated,service_role;
-- All purchase writes must use the verified delivery
-- boundary. Neither browsers nor the server role can bypass its ledger.
REVOKE INSERT,UPDATE ON public.apple_review_entitlements FROM service_role;
REVOKE EXECUTE ON FUNCTION public.grant_companion_question_pack(uuid,text,integer) FROM service_role;

CREATE FUNCTION public.apple_review_can_deliver(p_user uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce((SELECT enabled FROM apple_review_policy WHERE id),false)
    AND EXISTS(SELECT 1 FROM apple_review_testers WHERE user_id=p_user AND starts_at<=now() AND expires_at>now())
    AND NOT EXISTS(SELECT 1 FROM companion_pro_entitlements WHERE user_id=p_user)
    AND NOT EXISTS(SELECT 1 FROM cinegeek_private_monthly_grants WHERE user_id=p_user);
$$;

CREATE FUNCTION public.apple_review_deliver(p_user uuid,p_verified jsonb,p_notification uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  t jsonb:=p_verified->'transaction'; tid text:=t->>'id'; oid text:=t->>'originalId'; product text:=t->>'productId';
  kind text; plan_name text; purchased timestamptz; anchor_time timestamptz; signed_time timestamptz;
  checked_time timestamptz; expiry timestamptz; revocation timestamptz; upgraded_value boolean;
  apple_status integer; owner_row public.apple_review_owners; old public.apple_review_transactions;
  latest public.apple_review_transactions; existing public.apple_review_entitlements;
  changed boolean:=true; active boolean;
BEGIN
  IF NOT public.apple_review_can_deliver(p_user) THEN RAISE EXCEPTION 'Review delivery disabled or account unavailable'; END IF;
  IF jsonb_typeof(t) IS DISTINCT FROM 'object' OR t->>'environment' IS DISTINCT FROM 'Sandbox'
    OR lower(t->>'accountToken') IS DISTINCT FROM p_user::text OR tid IS NULL OR oid IS NULL
    OR tid !~ '^[0-9]{1,30}$' OR oid !~ '^[0-9]{1,30}$'
    OR product IS NULL OR product NOT IN ('app.cinegeek.mobile.pro.monthly','app.cinegeek.mobile.pro.annual')
    OR jsonb_typeof(t->'upgraded') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(t->'purchasedAt') IS DISTINCT FROM 'number'
    OR jsonb_typeof(t->'originalPurchasedAt') IS DISTINCT FROM 'number'
    OR jsonb_typeof(t->'signedAt') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_verified->'verifiedAt') IS DISTINCT FROM 'number'
    THEN RAISE EXCEPTION 'Invalid verified Sandbox review transaction'; END IF;
  kind:='subscription';
  purchased:=to_timestamp((t->>'purchasedAt')::numeric/1000);
  anchor_time:=to_timestamp((t->>'originalPurchasedAt')::numeric/1000);
  signed_time:=to_timestamp((t->>'signedAt')::numeric/1000);
  checked_time:=to_timestamp((p_verified->>'verifiedAt')::numeric/1000);
  expiry:=to_timestamp((t->>'expiresAt')::numeric/1000);
  revocation:=to_timestamp((t->>'revokedAt')::numeric/1000);
  upgraded_value:=(t->>'upgraded')::boolean;
  apple_status:=(p_verified->>'status')::integer;
  IF anchor_time<'1970-01-01' OR anchor_time>purchased OR purchased>now()+interval '1 minute'
    OR signed_time<purchased OR signed_time>now()+interval '1 minute'
    OR checked_time>now()+interval '1 minute' OR checked_time<now()-interval '10 minutes'
    OR revocation<'1970-01-01' OR revocation>now()+interval '1 minute'
    OR (kind='subscription' AND (expiry IS NULL OR expiry<=purchased OR apple_status IS NULL OR apple_status NOT BETWEEN 1 AND 5))
    THEN RAISE EXCEPTION 'Invalid Sandbox review dates or status'; END IF;

  -- One lineage can never move to another account, including concurrent claims.
  PERFORM pg_advisory_xact_lock(hashtextextended('apple-review:'||oid,0));
  INSERT INTO apple_review_owners(original_id,user_id,account_token,kind) VALUES(oid,p_user,p_user,kind) ON CONFLICT DO NOTHING;
  SELECT * INTO owner_row FROM apple_review_owners WHERE original_id=oid;
  IF owner_row.user_id IS DISTINCT FROM p_user OR owner_row.account_token IS DISTINCT FROM p_user OR owner_row.kind<>kind
    THEN RAISE EXCEPTION 'Apple purchase belongs to another account'; END IF;
  INSERT INTO companion_usage_accounts(user_id) VALUES(p_user) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM companion_usage_accounts WHERE user_id=p_user FOR UPDATE;
  IF p_notification IS NOT NULL THEN
    INSERT INTO apple_review_notifications(notification_id,original_id) VALUES(p_notification,oid) ON CONFLICT DO NOTHING;
    IF EXISTS(SELECT 1 FROM apple_review_notifications WHERE notification_id=p_notification AND original_id<>oid)
      THEN RAISE EXCEPTION 'Notification identity changed'; END IF;
  END IF;
  SELECT * INTO old FROM apple_review_transactions WHERE transaction_id=tid;
  IF FOUND THEN
    IF old.original_id<>oid OR old.product_id<>product OR old.purchased_at<>purchased OR old.original_purchased_at<>anchor_time
      THEN RAISE EXCEPTION 'Immutable Apple transaction changed'; END IF;
    IF signed_time<old.signed_at OR checked_time<old.reconciled_at THEN changed:=false;
    ELSIF signed_time=old.signed_at AND (old.revoked_at IS DISTINCT FROM revocation OR old.expires_at IS DISTINCT FROM expiry OR old.upgraded<>upgraded_value)
      THEN RAISE EXCEPTION 'Conflicting Apple signed snapshot';
    ELSIF signed_time=old.signed_at AND checked_time=old.reconciled_at AND old.subscription_status IS DISTINCT FROM apple_status
      THEN RAISE EXCEPTION 'Conflicting Apple status snapshot';
    END IF;
  END IF;
  IF changed THEN
    INSERT INTO apple_review_transactions(transaction_id,original_id,product_id,purchased_at,original_purchased_at,
      signed_at,reconciled_at,expires_at,revoked_at,upgraded,subscription_status)
    VALUES(tid,oid,product,purchased,anchor_time,signed_time,checked_time,expiry,revocation,upgraded_value,apple_status)
    ON CONFLICT(transaction_id) DO UPDATE SET signed_at=excluded.signed_at,reconciled_at=excluded.reconciled_at,
      expires_at=excluded.expires_at,revoked_at=excluded.revoked_at,upgraded=excluded.upgraded,
      subscription_status=excluded.subscription_status;
  END IF;
  IF kind='subscription' THEN
    -- Select the latest period of each lineage including revoked periods, then
    -- the newest purchase. Never resurrect an older period after a refund.
    SELECT x.* INTO latest FROM apple_review_transactions x JOIN apple_review_owners o ON o.original_id=x.original_id
      WHERE o.user_id=p_user AND o.kind='subscription'
      ORDER BY x.purchased_at DESC,x.transaction_id::numeric DESC LIMIT 1;
    active:=latest.subscription_status=1 AND latest.revoked_at IS NULL AND NOT latest.upgraded AND latest.expires_at>now();
    plan_name:=CASE WHEN latest.product_id='app.cinegeek.mobile.pro.annual' THEN 'annual' ELSE 'monthly' END;
    SELECT * INTO existing FROM apple_review_entitlements WHERE user_id=p_user;
    -- Preserve the allowance anchor across restore, renewal and plan/lineage
    -- changes. A switch must never provide a second set of 15 in that month.
    anchor_time:=coalesce(existing.anchor,latest.original_purchased_at);
    INSERT INTO apple_review_entitlements(user_id,plan,anchor,valid_until,revoked,verified_transaction_id)
      VALUES(p_user,plan_name,anchor_time,latest.expires_at,NOT active,'apple-review:'||latest.transaction_id)
    ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan,valid_until=excluded.valid_until,revoked=excluded.revoked,
      verified_transaction_id=excluded.verified_transaction_id;
    IF NOT active THEN
      UPDATE companion_question_requests SET status='released' WHERE user_id=p_user AND source='monthly' AND status IN ('working','paused');
    END IF;
  END IF;
  RETURN jsonb_build_object('acknowledged',true,'environment','Sandbox','transactionId',tid,
    'plan',public.cinegeek_plan(p_user),'allowance',public.companion_allowance_for(p_user),'purchasesEnabled',false);
END;
$$;

-- A bounded worker re-fetches current Apple state after missed notifications.
CREATE FUNCTION public.apple_review_reconcile_batch(p_after text DEFAULT '',p_limit integer DEFAULT 50)
RETURNS TABLE(transaction_id text,user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT coalesce((SELECT enabled FROM apple_review_policy WHERE id),false) THEN RAISE EXCEPTION 'Review delivery disabled'; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_after IS NULL THEN RAISE EXCEPTION 'Invalid batch'; END IF;
  RETURN QUERY SELECT t.transaction_id,o.user_id FROM apple_review_transactions t
    JOIN apple_review_owners o ON o.original_id=t.original_id
    WHERE public.apple_review_can_deliver(o.user_id) AND t.transaction_id>p_after AND t.transaction_id=(SELECT x.transaction_id
      FROM apple_review_transactions x WHERE x.original_id=t.original_id ORDER BY x.purchased_at DESC,x.transaction_id::numeric DESC LIMIT 1)
    ORDER BY t.transaction_id LIMIT p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.apple_review_can_deliver(uuid),public.apple_review_deliver(uuid,jsonb,uuid),
  public.apple_review_reconcile_batch(text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.apple_review_can_deliver(uuid),public.apple_review_deliver(uuid,jsonb,uuid),
  public.apple_review_reconcile_batch(text,integer) TO service_role;
-- Read-only configuration uses the same authenticated app session.
CREATE FUNCTION public.get_apple_review_configuration()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  RETURN jsonb_build_object('environment','Sandbox','salesEnabled',
    public.apple_review_can_deliver(auth.uid()) AND coalesce((SELECT sales_enabled FROM apple_review_policy WHERE id),false),
    'restoreEnabled',public.apple_review_can_deliver(auth.uid()));
END;
$$;
REVOKE ALL ON FUNCTION public.get_apple_review_configuration() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_apple_review_configuration() TO authenticated;
-- Durable renewal recovery: the scheduler can claim/advance work, but cannot
-- edit the policy or grant an entitlement without the receipt ledger.
CREATE TABLE public.apple_review_recovery (
  id boolean PRIMARY KEY DEFAULT true CHECK(id), cursor text NOT NULL DEFAULT '',
  lease uuid, lease_until timestamptz, last_attempt timestamptz, last_success timestamptz
);
INSERT INTO public.apple_review_recovery(id) VALUES(true);
ALTER TABLE public.apple_review_recovery ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.apple_review_recovery FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.apple_review_claim_recovery()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE task public.apple_review_recovery; token uuid:=gen_random_uuid();
BEGIN
  IF NOT coalesce((SELECT enabled FROM apple_review_policy WHERE id),false) THEN RAISE EXCEPTION 'Recovery disabled'; END IF;
  SELECT * INTO task FROM apple_review_recovery WHERE id FOR UPDATE;
  IF task.lease_until>now() THEN RETURN NULL; END IF;
  UPDATE apple_review_recovery SET lease=token,lease_until=now()+interval '5 minutes',last_attempt=now() WHERE id;
  RETURN jsonb_build_object('lease',token,'cursor',task.cursor);
END;
$$;
CREATE FUNCTION public.apple_review_finish_recovery(p_lease uuid,p_previous text,p_cursor text,p_complete boolean,p_successful boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_previous IS NULL OR p_cursor IS NULL OR p_complete IS NULL OR p_successful IS NULL
    OR (p_cursor<>'' AND p_cursor !~ '^[0-9]{1,30}$') OR p_cursor<p_previous
    OR (p_complete AND NOT p_successful) THEN RAISE EXCEPTION 'Invalid recovery progress'; END IF;
  UPDATE apple_review_recovery SET cursor=CASE WHEN p_complete THEN '' ELSE p_cursor END,
    lease=NULL,lease_until=NULL,last_success=CASE WHEN p_successful THEN now() ELSE last_success END
    WHERE id AND lease=p_lease AND lease_until>now() AND cursor=p_previous;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.apple_review_claim_recovery(),public.apple_review_finish_recovery(uuid,text,text,boolean,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.apple_review_claim_recovery(),public.apple_review_finish_recovery(uuid,text,text,boolean,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.active_companion_entitlement(p_user_id uuid)
RETURNS TABLE(user_id uuid,plan text,anchor timestamptz,valid_until timestamptz,grant_source text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.user_id,e.plan,e.anchor,e.valid_until,'verified_purchase'::text
    FROM public.companion_pro_entitlements e
    WHERE e.user_id=p_user_id AND NOT e.revoked AND e.anchor<=now() AND e.valid_until>now()
  UNION ALL
  SELECT g.user_id,'monthly'::text,g.starts_at,g.expires_at,'private_test'::text
    FROM public.cinegeek_private_monthly_grants g
    WHERE g.user_id=p_user_id AND NOT g.revoked AND g.starts_at<=now() AND g.expires_at>now()
    -- An expired/refunded purchase must not resurrect an older test grant.
    AND NOT EXISTS(SELECT 1 FROM public.companion_pro_entitlements e WHERE e.user_id=p_user_id)
  UNION ALL
  SELECT r.user_id,r.plan,r.anchor,least(r.valid_until,t.expires_at),'verified_sandbox_review'::text
    FROM public.apple_review_entitlements r JOIN public.apple_review_testers t ON t.user_id=r.user_id
    WHERE r.user_id=p_user_id AND public.apple_review_can_deliver(p_user_id)
      AND NOT r.revoked AND r.anchor<=now() AND r.valid_until>now();
$$;
REVOKE ALL ON FUNCTION public.active_companion_entitlement(uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
