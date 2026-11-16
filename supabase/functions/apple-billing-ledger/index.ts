import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import {billingLedgerHandler} from '../_shared/apple-billing-ledger.ts';

const enabled = Deno.env.get('APPLE_BILLING_LEDGER_ENABLED') === 'true';
const projectUrl = Deno.env.get('SUPABASE_URL') ?? '';
// This credential stays inside CineGeek's existing Supabase environment.
const db = enabled ? createClient(projectUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: {persistSession: false, autoRefreshToken: false},
}) : null;
Deno.serve(billingLedgerHandler({enabled, projectUrl, secret: Deno.env.get('APPLE_BILLING_LEDGER_SECRET') ?? ''}, async (name, args) => {
  if (!db) throw Error('Billing disabled');
  const {data, error} = await db.rpc(name, args);
  if (error) throw Error('Billing unavailable');
  return data;
}));
