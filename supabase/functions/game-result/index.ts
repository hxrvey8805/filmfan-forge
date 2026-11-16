import {serve} from 'https://deno.land/std@0.168.0/http/server.ts';
import {cors,reply,economyUser,tmdb} from '../_shared/economy-http.ts';
import {gamePath,verifyGamePath} from '../_shared/game-verification.ts';
serve(async req=>{
  if(req.method==='OPTIONS')return new Response(null,{headers:cors});
  if(req.method!=='POST')return reply(405,{error:'Method not allowed'});
  try{
    const {db,user}=await economyUser(req);
    const text=await req.text();if(text.length>4096)return reply(400,{error:'Invalid path'});
    const {gameId,path}=JSON.parse(text),token=crypto.randomUUID();
    const claim=await db.rpc('claim_cinegeek_win',{p_user:user.id,p_game:gameId,p_proof:path,p_token:token});
    if(claim.error)return reply(409,{error:claim.error.message});
    const game=claim.data;
    if(game.status==='won'||game.status==='lost')return reply(200,{won:game.status==='won',xp:game.awarded});
    const checked=gamePath(game.proof,game.start_actor,game.target_actor);
    const valid=!!checked && await verifyGamePath(checked,async(type,id)=>{
      const data=await tmdb(`${type}/${id}/${type==='tv'?'aggregate_credits':'credits'}`);
      if(!Array.isArray(data.cast))throw new Error('Catalogue unavailable');
      return data.cast.map((c:{id:number})=>c.id);
    });
    const finished=await db.rpc('finish_cinegeek_win',{p_user:user.id,p_game:gameId,p_token:token,p_valid:valid});
    if(finished.error)return reply(409,{error:finished.error.message});
    return reply(200,finished.data);
  }catch(e){return reply(e instanceof Error&&e.message==='Sign in required'?401:503,{error:'Could not verify this game yet. Retry this result in a moment.'});}
});
