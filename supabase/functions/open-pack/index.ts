import {serve} from 'https://deno.land/std@0.168.0/http/server.ts';
import {cors,reply,economyUser,tmdb} from '../_shared/economy-http.ts';
import {openCollectiblePack} from '../_shared/pack-service.ts';
serve(async req=>{
  if(req.method==='OPTIONS')return new Response(null,{headers:cors});
  if(req.method!=='POST')return reply(405,{error:'Method not allowed'});
  try{
    const {db,user}=await economyUser(req);
    const {packId}=await req.json();const random=new Uint32Array(1);
    const result=await openCollectiblePack(async(name,args)=>await db.rpc(name,args),tmdb,user.id,packId,crypto.randomUUID(),()=>{
      crypto.getRandomValues(random);return random[0];
    });
    return reply(200,result);
  }catch(e){return reply(e instanceof Error&&e.message==='Sign in required'?401:503,{error:'Your pack is safe. Please try revealing it again shortly.'});}
});
