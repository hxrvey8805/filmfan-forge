import {tierRpc} from './tier-rpc';
import {accountChanged} from './pro-access';
// Keep the request identity through navigation or a lost response. A retry can
// retrieve the original result but cannot spend XP twice for that request.
const pending=new Map<string,string>();
const requestKey=(owner:string,item:string)=>`cinegeek.xp.pending.${owner}.${item}`;
function savedRequest(key:string){
  let id=pending.get(key);
  try{id=id??localStorage.getItem(key)??undefined;}catch{/* memory fallback */}
  return id;
}
function clearRequest(key:string){
  pending.delete(key);try{localStorage.removeItem(key);}catch{/* optional persistence */}
}
export const hasPendingXp=(owner:string,item:string)=>!!savedRequest(requestKey(owner,item));
export async function redeemXp<T=unknown>(userId:string,item:string,validate?:(data:unknown)=>T):Promise<T>{
  const key=requestKey(userId,item);
  const id=savedRequest(key)??crypto.randomUUID();pending.set(key,id);
  try{localStorage.setItem(key,id);}catch{/* memory fallback */}
  const {data,error}=await tierRpc('redeem_cinegeek_xp',{p_request:id,p_item:item});
  if(error){
    // These database errors confirm a rolled-back transaction, not an uncertain
    // transport result. Do not leave a permanently failed redemption pending.
    if(error.code==='P0001'||error.code==='42501')clearRequest(key);
    throw new Error(error.message);
  }
  // Validate before clearing: an incomplete success response must be recoverable
  // under the same request ID, especially for a random skin already granted.
  const result=validate?validate(data):data as T;
  clearRequest(key);accountChanged();return result;
}

export function forgetPendingXp(owner:string){for(const key of pending.keys())if(key.startsWith(`cinegeek.xp.pending.${owner}.`))pending.delete(key);}
