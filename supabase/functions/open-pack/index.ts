import {serve} from 'https://deno.land/std@0.168.0/http/server.ts';
import {cors,reply,economyUser,tmdb} from '../_shared/economy-http.ts';
type Person={id:number;name:string;profile_path:string|null;job?:string;known_for_department?:string};
serve(async req=>{
  if(req.method==='OPTIONS')return new Response(null,{headers:cors});
  if(req.method!=='POST')return reply(405,{error:'Method not allowed'});
  try{
    const {db,user}=await economyUser(req);
    const {packId}=await req.json();const token=crypto.randomUUID();
    const claim=await db.rpc('claim_cinegeek_pack',{p_user:user.id,p_pack:packId,p_token:token});
    if(claim.error)return reply(409,{error:claim.error.message});
    if(claim.data.person)return reply(200,claim.data);
    const type=claim.data.packType;
    const random=new Uint32Array(1);crypto.getRandomValues(random);
    const page=1+random[0]%10;
    let pool:Person[]=[];
    if(type==='actor'){
      const data=await tmdb(`person/popular?page=${page}`);
      pool=(data.results??[]).filter((p:Person)=>p.known_for_department==='Acting');
    }else{
      const data=await tmdb(`movie/popular?page=${page}`);
      // A bounded catalogue pool, not a rarity or monetary valuation system.
      for(const movie of (data.results??[]).slice(0,5)){
        const credits=await tmdb(`movie/${movie.id}/credits`);
        pool.push(...(credits.crew??[]).filter((p:Person)=>p.job==='Director'));
      }
    }
    pool=[...new Map(pool.filter(p=>Number.isSafeInteger(p.id)&&p.id>0&&typeof p.name==='string').map(p=>[p.id,p])).values()];
    if(!pool.length)throw new Error('Catalogue unavailable');
    crypto.getRandomValues(random);const person=pool[random[0]%pool.length];
    const saved=await db.rpc('store_cinegeek_reveal',{p_user:user.id,p_pack:packId,p_token:token,p_person:person});
    if(saved.error)return reply(409,{error:saved.error.message});
    return reply(200,saved.data);
  }catch(e){return reply(e instanceof Error&&e.message==='Sign in required'?401:503,{error:'Your pack is safe. Please try revealing it again shortly.'});}
});
