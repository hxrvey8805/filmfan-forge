// A server-to-server boundary: the external Apple verifier receives this
// dedicated secret, never the live database's service-role credential.
const contracts: Record<string, string[]> = {
  apple_production_can_deliver: ['p_user'],
  apple_production_deliver: ['p_user', 'p_verified', 'p_notification'],
  apple_production_reconcile_batch: ['p_after', 'p_limit'],
  apple_production_claim_recovery: [],
  apple_production_finish_recovery: ['p_lease', 'p_previous', 'p_cursor', 'p_complete', 'p_successful'],
  apple_review_can_deliver: ['p_user'],
  apple_review_deliver: ['p_user', 'p_verified', 'p_notification'],
  apple_review_reconcile_batch: ['p_after', 'p_limit'],
  apple_review_claim_recovery: [],
  apple_review_finish_recovery: ['p_lease', 'p_previous', 'p_cursor', 'p_complete', 'p_successful'],
};
type LedgerCall = (name: string, args: Record<string, unknown>) => Promise<unknown>;
export function billingLedgerHandler(config: {enabled: boolean; projectUrl: string; secret: string}, call: LedgerCall) {
  const reply = (status: number, data: unknown) => Response.json(data, {status,
    headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
  if (!config.enabled) return async () => reply(503, {error: 'billing_disabled'});
  if (config.projectUrl !== 'https://pginaazhujdtcjonxjrh.supabase.co' || !/^[a-f0-9]{64}$/.test(config.secret)) {
    throw Error('Invalid billing ledger configuration');
  }
  return async (request: Request) => {
    if (request.method !== 'POST' || request.headers.has('origin')) return reply(403, {error: 'server_only'});
    const token = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!token) return reply(401, {error: 'unauthorized'});
    // Compare fixed-length digests without a character-by-character early exit.
    const digest = (value: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    const [received, expected] = await Promise.all([digest(token), digest(config.secret)]);
    let different = 0;
    const a = new Uint8Array(received), b = new Uint8Array(expected);
    for (let i = 0; i < a.length; i++) different |= a[i] ^ b[i];
    if (different) return reply(401, {error: 'unauthorized'});
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415, {error: 'json_required'});
    if (Number(request.headers.get('content-length')) > 16000) return reply(413, {error: 'body_too_large'});
    const reader = request.body?.getReader();
    if (!reader) return reply(400, {error: 'invalid_operation'});
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10000)]);
    const cancel = () => {void reader.cancel().catch(() => {});};
    signal.addEventListener('abort', cancel, {once: true});
    try {
      let size = 0; const chunks: Uint8Array[] = [];
      while (true) {
        signal.throwIfAborted(); const {value, done} = await reader.read(); signal.throwIfAborted();
        if (done) break;
        size += value.byteLength;
        if (size > 16000) {await reader.cancel(); return reply(413, {error: 'body_too_large'});}
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
      let body: {name?: unknown; args?: unknown};
      try {body = JSON.parse(new TextDecoder().decode(bytes));} catch {return reply(400, {error: 'invalid_operation'});}
      if (!body || Array.isArray(body) || Object.keys(body).sort().join(',') !== 'args,name'
        || typeof body.name !== 'string' || !Object.hasOwn(contracts, body.name)
        || !body.args || Array.isArray(body.args) || typeof body.args !== 'object'
        || Object.keys(body.args).sort().join(',') !== [...contracts[body.name]].sort().join(',')) {
        return reply(400, {error: 'invalid_operation'});
      }
      const args = body.args as Record<string, unknown>;
      if (['apple_production_reconcile_batch', 'apple_review_reconcile_batch'].includes(body.name) &&
        (!Number.isInteger(args.p_limit) || Number(args.p_limit) < 1 || Number(args.p_limit) > 5)) {
        return reply(400, {error: 'invalid_operation'});
      }
      // SQL validates identities, dates, environment, ownership and state.
      // No arbitrary RPC, table query, sales switch or budget mutation is exposed.
      return reply(200, {data: await call(body.name, args)});
    } catch {return reply(503, {error: 'billing_unavailable'});}
    finally {signal.removeEventListener('abort', cancel); reader.releaseLock();}
  };
}
