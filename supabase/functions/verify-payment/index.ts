import {serve} from 'https://deno.land/std@0.168.0/http/server.ts';
import {cors,reply} from '../_shared/economy-http.ts';
// Retired. Historical transactions must be reconciled before rollout.
serve(req=>req.method==='OPTIONS'?new Response(null,{headers:cors}):reply(410,{error:'Purchases and card selling are disabled. XP is earned through games.'}));
