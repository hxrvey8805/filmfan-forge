import {serve} from 'https://deno.land/std@0.168.0/http/server.ts';
import {cors,reply} from '../_shared/economy-http.ts';
// Superseded by the authenticated, Pro-gated interpret-smart-list route.
serve(req=>req.method==='OPTIONS'?new Response(null,{headers:cors}):reply(410,{error:'Use Smart Lists in the updated app.'}));
