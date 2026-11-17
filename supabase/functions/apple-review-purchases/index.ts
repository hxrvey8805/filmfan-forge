import {reviewPurchaseRelay} from '../_shared/apple-production-relay.ts';
let handler: (request: Request) => Promise<Response>;
try {
  handler = reviewPurchaseRelay({enabled: Deno.env.get('APPLE_REVIEW_RELAY_ENABLED') === 'true',
    supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
    nodeUrl: Deno.env.get('APPLE_PRODUCTION_NODE_URL') ?? ''});
} catch {
  handler = async () => Response.json({error: 'purchases_disabled'}, {status: 503, headers: {'Cache-Control': 'no-store'}});
}
Deno.serve(handler);
