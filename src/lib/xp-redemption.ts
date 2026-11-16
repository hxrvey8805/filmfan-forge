import {tierRpc} from './tier-rpc';
import {accountChanged} from './pro-access';
// Keep the request identity through navigation or a lost response. A retry can
// retrieve the original result but cannot spend XP twice for that request.
const pending=new Map<string,string>();
export async function redeemXp(userId:string,item:string){
  const key=`cinegeek.xp.pending.${userId}.${item}`;
  let id=pending.get(key);
  try{id=id??localStorage.getItem(key)??undefined;}catch{/* memory fallback */}
  id=id??crypto.randomUUID();pending.set(key,id);
  try{localStorage.setItem(key,id);}catch{/* memory fallback */}
  const {data,error}=await tierRpc('redeem_cinegeek_xp',{p_request:id,p_item:item});
  if(error)throw new Error(error.message);
  pending.delete(key);try{localStorage.removeItem(key);}catch{/* optional persistence */}
  accountChanged();return data;
}
