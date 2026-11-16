import {it, expect, vi} from 'vitest';
import {billingLedgerHandler} from '../supabase/functions/_shared/apple-billing-ledger';
const config = {enabled: true, projectUrl: 'https://pginaazhujdtcjonxjrh.supabase.co', secret: 'a'.repeat(64)};
const account = '00000000-0000-4000-8000-000000000001';
function request(body: unknown = {name: 'apple_production_can_deliver', args: {p_user: account}}, extra: Record<string, string> = {}) {
  return new Request('https://example.invalid', {method: 'POST', headers: {'Content-Type': 'application/json',
    Authorization: `Bearer ${config.secret}`, ...extra}, body: JSON.stringify(body)});
}
it('stays disabled before credentials or SQL are consulted', async () => {
  const call = vi.fn();
  const result = await billingLedgerHandler({...config, enabled: false, secret: ''}, call)(request());
  expect(result.status).toBe(503); expect(call).not.toHaveBeenCalled();
});
it('requires the live project and a dedicated strong secret', () => {
  expect(() => billingLedgerHandler({...config, projectUrl: 'https://other.invalid'}, vi.fn())).toThrow();
  expect(() => billingLedgerHandler({...config, secret: 'test'}, vi.fn())).toThrow();
});
it.each(['', 'Bearer ordinary-user-session', `Bearer ${'b'.repeat(64)}`])('rejects an invalid server credential', async Authorization => {
  const call = vi.fn(); const result = await billingLedgerHandler(config, call)(request(undefined, {Authorization}));
  expect(result.status).toBe(401); expect(call).not.toHaveBeenCalled();
});
it('rejects browser requests even if they supply the secret', async () => {
  const call = vi.fn(); const result = await billingLedgerHandler(config, call)(request(undefined, {Origin: 'capacitor://localhost'}));
  expect(result.status).toBe(403); expect(call).not.toHaveBeenCalled();
});
it.each(['get_cinegeek_access', 'grant_companion_question_pack', 'constructor', '__proto__'])('cannot invoke unrelated RPC %s', async name => {
  const call = vi.fn(); const result = await billingLedgerHandler(config, call)(request({name, args: {}}));
  expect(result.status).toBe(400); expect(call).not.toHaveBeenCalled();
});
it('rejects extra arguments, root fields, and oversized recovery batches', async () => {
  const call = vi.fn(); const handle = billingLedgerHandler(config, call);
  for (const body of [
    {name: 'apple_production_can_deliver', args: {p_user: account, sales_enabled: true}},
    {name: 'apple_production_can_deliver', args: {p_user: account}, sql: 'bad'},
    {name: 'apple_production_reconcile_batch', args: {p_after: '', p_limit: 100}},
  ]) expect((await handle(request(body))).status).toBe(400);
  expect(call).not.toHaveBeenCalled();
});
it('only forwards the permitted operation and exact arguments', async () => {
  const call = vi.fn(async () => true); const response = await billingLedgerHandler(config, call)(request());
  expect(response.status).toBe(200); expect(await response.json()).toEqual({data: true});
  expect(call).toHaveBeenCalledWith('apple_production_can_deliver', {p_user: account});
});
it('does not acknowledge failed SQL or disclose its details', async () => {
  const response = await billingLedgerHandler(config, vi.fn(async () => {throw Error('private database detail');}))(request());
  expect(response.status).toBe(503); expect(await response.json()).toEqual({error: 'billing_unavailable'});
});
it('bounds the streamed body even without a content-length header', async () => {
  const call = vi.fn(); const response = await billingLedgerHandler(config, call)(request('x'.repeat(16001)));
  expect(response.status).toBe(413); expect(call).not.toHaveBeenCalled();
});
