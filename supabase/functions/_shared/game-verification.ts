export type GameStep={type:'actor'|'movie'|'tv';id:number};
export function gamePath(value:unknown,start:number,target:number):GameStep[]|null {
  if(!Array.isArray(value)||value.length<3||value.length>21||value.length%2!==1)return null;
  for(let i=0;i<value.length;i++){
    const s=value[i];
    if(!s || typeof s!=='object' || Object.keys(s).some(k=>k!=='type'&&k!=='id') || !Number.isSafeInteger(s.id)||s.id<=0 ||
      (i%2===0 ? s.type!=='actor' : !['movie','tv'].includes(s.type)))return null;
  }
  return value[0].id===start && value[value.length-1].id===target?value:null;
}
export async function verifyGamePath(path:GameStep[],cast:(type:'movie'|'tv',id:number)=>Promise<number[]>):Promise<boolean>{
  // Repeated titles are valid. Fetch each title once, in parallel, so a long
  // valid route does not exhaust the verification lease waiting on each fetch.
  const titles=new Map<string,Promise<number[]>>();
  const links:Promise<boolean>[]=[];
  for(let i=1;i<path.length;i+=2){
    const title=path[i],key=`${title.type}:${title.id}`;
    if(!titles.has(key))titles.set(key,cast(title.type as 'movie'|'tv',title.id));
    links.push(titles.get(key)!.then(ids=>ids.includes(path[i-1].id)&&ids.includes(path[i+1].id)));
  }
  // Service errors propagate. They must never settle a game as lost.
  return (await Promise.all(links)).every(Boolean);
}
