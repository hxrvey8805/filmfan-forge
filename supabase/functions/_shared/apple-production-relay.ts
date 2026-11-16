// Default-off native-app relay. The dedicated Node service verifies the session,
// Apple signature, environment and current subscription state before delivery.
export function productionPurchaseRelay(config: {enabled: boolean; supabaseUrl: string; nodeUrl: string}, send: typeof fetch = fetch) {
  const origin = 'capacitor://localhost';
  const headers = {'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff'};
  const reply = (status: number, error: string) => Response.json({error}, {status, headers});
  if (!config.enabled) return async () => reply(503, 'purchases_disabled');
  if (config.supabaseUrl !== 'https://pginaazhujdtcjonxjrh.supabase.co') throw Error('Production project required');
  const target = new URL(config.nodeUrl);
  if (target.origin !== 'https://cinegeek-apple-production.onrender.com' || target.pathname !== '/'
    || target.username || target.password || target.search || target.hash) throw Error('Billing host is not approved');
  return async (req: Request) => {
    if (req.headers.get('origin') && req.headers.get('origin') !== origin) return reply(403, 'origin_not_allowed');
    if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: {...headers,
      'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info'}});
    if (req.method !== 'POST') return reply(405, 'post_required');
    if (!/^Bearer [^\s]{1,8192}$/.test(req.headers.get('authorization') ?? '')) return reply(401, 'sign_in_required');
    if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply(415, 'json_required');
    if (Number(req.headers.get('content-length')) > 30000) return reply(413, 'receipt_too_large');
    const reader = req.body?.getReader(); if (!reader) return reply(400, 'receipt_required');
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(25000)]);
    const cancel = () => {void reader.cancel().catch(() => {});}; signal.addEventListener('abort', cancel, {once: true});
    try {
      let size = 0; const chunks: Uint8Array[] = [];
      while (true) {
        signal.throwIfAborted(); const {done, value} = await reader.read(); signal.throwIfAborted();
        if (done) break;
        size += value.byteLength; if (size > 30000) {await reader.cancel(); return reply(413, 'receipt_too_large');}
        chunks.push(value);
      }
      const body = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) {body.set(chunk, offset); offset += chunk.byteLength;}
      const response = await send(new URL('/apple-purchases/purchase', target), {method: 'POST', redirect: 'error', signal,
        headers: {'Content-Type': 'application/json', Authorization: req.headers.get('authorization')!, Origin: origin}, body});
      if (!response.ok || !response.headers.get('content-type')?.startsWith('application/json')) {
        await response.body?.cancel(); return reply(response.ok ? 503 : response.status, 'purchase_verification_pending');
      }
      return new Response(response.body, {status: 200, headers});
    } catch {return reply(503, 'purchase_verification_pending');}
    finally {signal.removeEventListener('abort', cancel); reader.releaseLock();}
  };
}
