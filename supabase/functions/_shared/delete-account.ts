type Identity = {id:string; recentlyAuthenticated:boolean};
type Dependencies = { authenticate:(token:string)=>Promise<Identity|null>; remove:(id:string)=>Promise<boolean> };
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
 'Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store'};
const reply=(status:number,body:unknown)=>Response.json(body,{status,headers});

/** Call only AFTER getUser has verified this exact bearer token with Auth. */
export function recentPasswordAuthentication(verifiedToken:string,userId:string,now=Date.now()):boolean {
 try {
  const encoded=verifiedToken.split('.')[1];
  const claims=JSON.parse(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')));
  return claims.sub===userId && claims.exp>now/1000 && Array.isArray(claims.amr) && claims.amr.some((a:{method?:unknown;timestamp?:unknown})=>
   a.method==='password' && typeof a.timestamp==='number' && a.timestamp<=now/1000+30 && a.timestamp>=now/1000-300);
 } catch {return false;}
}
export function deleteAccountHandler(deps:Dependencies) {
 return async(req:Request):Promise<Response>=>{
  if(req.method==='OPTIONS')return new Response(null,{headers});
  if(req.method!=='POST')return reply(405,{error:'Method not allowed'});
  try {
   const token=/^Bearer (\S+)$/i.exec(req.headers.get('Authorization')??'')?.[1];
   const user=token?await deps.authenticate(token):null;
   if(!user)return reply(401,{error:'Sign in again to delete your account.',code:'sign_in'});
   if(!user.recentlyAuthenticated)return reply(403,{error:'Confirm your password again before deleting your account.',code:'reauthenticate'});
   // The account ID can never come from the request body.
   const reader=req.body?.getReader(); if(!reader)return reply(400,{error:'Confirm account deletion.'});
   let value='',bytes=0;
   for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;
    if(bytes>256){await reader.cancel();return reply(413,{error:'Invalid request'});}value+=new TextDecoder().decode(part.value);}
   let body;try{body=JSON.parse(value);}catch{return reply(400,{error:'Invalid request'});}
   if(!body || Object.keys(body).length!==1 || body.confirmation!=='DELETE')return reply(400,{error:'Confirm account deletion.'});
   if(!await deps.remove(user.id))return reply(503,{error:'Your account could not be deleted. Please try again.',code:'unavailable'});
   return reply(200,{deleted:true});
  } catch {return reply(503,{error:'Your account could not be deleted. Please try again.',code:'unavailable'});}
 };
}
