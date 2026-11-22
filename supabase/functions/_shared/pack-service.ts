import {drawPack,personNameKey,readPackPick,type PackPick,type PackType} from './pack-catalogue.ts';
type Rpc=(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
type Read=(path:string)=>Promise<unknown>;
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const objects=(value:unknown):Record<string,unknown>[]=>Array.isArray(value)?value.map(object):[];
export async function resolvePackPerson(pick:PackPick,read:Read){
  const result=object(await read(`search/person?query=${encodeURIComponent(pick.name)}&include_adult=false&language=en-US`));
  const matches=new Map<number,{id:number;name:string;profile_path?:string}>();
  for(const p of objects(result.results)){
    if(typeof p.id==='number'&&Number.isSafeInteger(p.id)&&p.id>0&&p.adult!==true&&typeof p.name==='string'&&personNameKey(p.name)===personNameKey(pick.name))matches.set(p.id,{id:p.id,name:p.name,profile_path:typeof p.profile_path==='string'?p.profile_path:undefined});
  }
  // No substitute person, cross-category fallback or popularity-based reroll.
  if(matches.size!==1)throw Error('Person could not be verified');
  const person=[...matches.values()][0];
  const credits=object(await read(`person/${person.id}/combined_credits`));
  const valid=pick.packType==='director'
    ? objects(credits.crew).some(c=>c.job==='Director')
    : objects(credits.cast).some(c=>typeof c.character==='string'&&c.character.trim()&&!/\b(self|himself|herself)\b/i.test(c.character));
  if(!valid)throw Error('Person credit could not be verified');
  return {id:person.id,name:pick.name,profile_path:typeof person.profile_path==='string'&&/^\/[A-Za-z0-9_-]+\.(jpg|png)$/.test(person.profile_path)?person.profile_path:null,
    rarity:pick.rarity,catalogue_version:pick.version};
}
export async function openCollectiblePack(rpc:Rpc,read:Read,user:string,packId:string,token:string,next:()=>number){
  if(typeof packId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(packId))throw Error('Invalid pack');
  const claim=await rpc('claim_cinegeek_pack',{p_user:user,p_pack:packId,p_token:token});
  if(claim.error)throw claim.error;
  const claimed=object(claim.data);
  if(claimed.person)return claimed;
  const type=claimed.packType as PackType;
  if(type!=='actor'&&type!=='director')throw Error('Invalid pack');
  let pick=readPackPick(claimed.pick);
  if(claimed.pick&&!pick)throw Error('Pack version unavailable');
  if(!pick){
    const selected=await rpc('store_cinegeek_pack_pick',{p_user:user,p_pack:packId,p_token:token,p_pick:drawPack(type,next)});
    if(selected.error)throw selected.error;
    pick=readPackPick(selected.data);
  }
  if(!pick||pick.packType!==type)throw Error('Pack draw unavailable');
  const person=await resolvePackPerson(pick,read);
  const saved=await rpc('store_cinegeek_reveal',{p_user:user,p_pack:packId,p_token:token,p_person:person});
  if(saved.error)throw saved.error;
  return object(saved.data);
}
