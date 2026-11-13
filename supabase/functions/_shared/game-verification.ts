export type GameStep={type:'actor'|'movie'|'tv';id:number};
export function gamePath(value:unknown,start:number,target:number):GameStep[]|null {
  if(!Array.isArray(value)||value.length<3||value.length>21||value.length%2!==1)return null;
  const seen=new Set<string>();
  for(let i=0;i<value.length;i++){
    const s=value[i];
    if(!s || typeof s!=='object' || Object.keys(s).some(k=>k!=='type'&&k!=='id') || !Number.isSafeInteger(s.id)||s.id<=0 ||
      (i%2===0 ? s.type!=='actor' : !['movie','tv'].includes(s.type)))return null;
    const key=`${s.type}:${s.id}`;if(seen.has(key))return null;seen.add(key);
  }
  return value[0].id===start && value[value.length-1].id===target?value:null;
}
export async function verifyGamePath(path:GameStep[],cast:(type:'movie'|'tv',id:number)=>Promise<number[]>):Promise<boolean>{
  // Each connecting title must credit BOTH surrounding actors. Service errors
  // propagate so a network failure never becomes a lost game or a free reward.
  for(let i=1;i<path.length;i+=2){
    const ids=await cast(path[i].type as 'movie'|'tv',path[i].id);
    if(!ids.includes(path[i-1].id)||!ids.includes(path[i+1].id))return false;
  }
  return true;
}
