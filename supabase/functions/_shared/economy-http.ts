import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
export const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
export const reply=(status:number,data:unknown)=>Response.json(data,{status,headers:{...cors,'Cache-Control':'no-store'}});
export async function economyUser(req:Request){
  const token=/^Bearer (\S+)$/i.exec(req.headers.get('Authorization')??'')?.[1];
  if(!token)throw new Error('Sign in required');
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const {data:{user},error}=await db.auth.getUser(token);
  if(error||!user)throw new Error('Sign in required');
  return {db,user};
}
export async function tmdb(path:string){
  const key=Deno.env.get('TMDB_API_KEY');if(!key)throw new Error('Catalogue unavailable');
  const res=await fetch(`https://api.themoviedb.org/3/${path}${path.includes('?')?'&':'?'}api_key=${encodeURIComponent(key)}`,{signal:AbortSignal.timeout(8000)});
  if(!res.ok)throw new Error('Catalogue unavailable');return res.json();
}
