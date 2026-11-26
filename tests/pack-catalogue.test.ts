import {createHash} from 'node:crypto';
import {PACK_CATALOGUES} from '../supabase/functions/_shared/pack-catalogues';
import {describe,it,expect,vi} from 'vitest';
import {drawPack,uniformIndex,PACK_ODDS,PACK_ROSTER,PACK_CATALOGUE_VERSION,readPackPick,personNameKey,type PackPick} from '../supabase/functions/_shared/pack-catalogue';
import {resolvePackPerson,openCollectiblePack} from '../supabase/functions/_shared/pack-service';
import {PACK_PERSON_IDS} from '../supabase/functions/_shared/pack-identities';
const next=(...values:number[])=>()=>values.shift()!;
const pick:PackPick={name:'Emma Stone',packType:'actor',rarity:'star',version:PACK_CATALOGUE_VERSION};
const id='00000000-0000-4000-8000-000000000001';
describe('approved pack odds',()=>{
 it.each([[0,'discovery'],[59,'discovery'],[60,'featured'],[89,'featured'],[90,'star'],[97,'star'],[98,'icon'],[99,'icon']] as const)('roll %s gives %s',(roll,tier)=>{
   for(const type of ['actor','director'] as const)expect(drawPack(type,next(roll,0)).rarity).toBe(tier);
 });
 it('assigns exactly 60/30/8/2 probability with equal odds per name and no repeated roster entries',()=>{
  expect(PACK_ODDS.reduce((a,t)=>a+t.weight,0)).toBe(100);
  for(const type of ['actor','director'] as const){
   const names=Object.values(PACK_ROSTER[type]).flat();expect(new Set(names.map(personNameKey)).size).toBe(names.length);
   expect(names.length).toBe(type==='actor'?97:75);
   let start=0;
   for(const tier of PACK_ODDS){
    const pool=PACK_ROSTER[type][tier.id];
    for(let index=0;index<pool.length;index++){
      expect(drawPack(type,next(start,index))).toEqual({name:pool[index],rarity:tier.id,packType:type,version:PACK_CATALOGUE_VERSION});
    }
    start+=tier.weight;
   }
   // Each icon is 2% / 12 = 1 in 600 packs, independent of popularity.
   expect(PACK_ROSTER[type].icon.length).toBe(12);
  }
 });
 it('rejects biased high uint values, malformed entropy and unavailable catalogue versions',()=>{
  expect(uniformIndex(100,next(0xffffffff,99))).toBe(99);
  expect(()=>uniformIndex(100,next(-1))).toThrow();expect(()=>uniformIndex(0,next(0))).toThrow();
  expect(()=>uniformIndex(100,()=>0xffffffff)).toThrow('unavailable');
  expect(readPackPick(pick)).toEqual(pick);expect(readPackPick({...pick,version:'unknown'})).toBeNull();
  expect(readPackPick({...pick,rarity:'icon'})).toBeNull();expect(readPackPick({...pick,name:'Not in the roster'})).toBeNull();
 });
 it('a repeatable large draw follows the approved distribution for both kinds of pack',()=>{
  let seed=912341;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
  for(const type of ['actor','director'] as const){
   const counts={discovery:0,featured:0,star:0,icon:0};const names=new Map<string,number>();
   for(let i=0;i<100000;i++){const p=drawPack(type,random);counts[p.rarity as keyof typeof counts]++;names.set(p.name,(names.get(p.name)??0)+1);}
   for(const t of PACK_ODDS)expect(Math.abs(counts[t.id]/1000-t.weight)).toBeLessThan(.6);
   for(const t of PACK_ODDS)for(const name of PACK_ROSTER[type][t.id]){
    const expected=100000*t.weight/100/PACK_ROSTER[type][t.id].length;
    expect(Math.abs(names.get(name)!-expected)).toBeLessThan(6*Math.sqrt(expected));
   }
  }
 });
});
describe('profile verification and persistent draws',()=>{
 it('covers the exact frozen roster with unique reviewed identities',()=>{
  const names=[...new Set(Object.values(PACK_CATALOGUES).flatMap(c=>Object.values(c.roster).flatMap(t=>Object.values(t).flat())))];
  expect(Object.keys(PACK_PERSON_IDS).sort()).toEqual([...names].sort());
  expect(new Set(Object.values(PACK_PERSON_IDS)).size).toBe(names.length);
  for(const id of Object.values(PACK_PERSON_IDS))expect(Number.isSafeInteger(id)&&id>0).toBe(true);
 });
 it('loads the reviewed identity directly instead of rejecting same-name search collisions',async()=>{
  const read=vi.fn().mockResolvedValueOnce({id:54693,name:'Emma Stone',profile_path:'/face.jpg',adult:false}).mockResolvedValueOnce({cast:[{character:'Mia'}]});
  expect(await resolvePackPerson(pick,read)).toEqual({id:54693,name:'Emma Stone',profile_path:'/face.jpg',rarity:'star',catalogue_version:PACK_CATALOGUE_VERSION});
  expect(read.mock.calls).toEqual([['person/54693?language=en-US'],['person/54693/combined_credits']]);
 });
 it('normalizes accents, accepts documented aliases and verifies directing credits',async()=>{
  expect(personNameKey('Lupita Nyong’o')).toBe(personNameKey("Lupita Nyong'o"));
  const director:PackPick={...pick,name:'Céline Sciamma',packType:'director',rarity:'established',version:'cinegeek-cast-1'};
  const read=vi.fn().mockResolvedValueOnce({id:68813,name:'Celine Sciamma',profile_path:'https://other.test/image.jpg'}).mockResolvedValueOnce({crew:[{job:'Director'}]});
  expect(await resolvePackPerson(director,read)).toMatchObject({id:68813,profile_path:null,name:'Céline Sciamma'});
  const alias=vi.fn().mockResolvedValueOnce({id:54693,name:'Emily Jean Stone',also_known_as:['Emma Stone']}).mockResolvedValueOnce({cast:[{character:'Mia'}]});
  expect(await resolvePackPerson(pick,alias)).toMatchObject({id:54693,name:'Emma Stone'});
 });
 it.each([
  {id:54693,name:'Someone else'},
  {id:2080867,name:'Emma Stone'},
  {id:54693,name:'Emma Stone',adult:true},
  {name:'Emma Stone'},
 ])('refuses wrong, same-name but different, missing-ID or adult profiles without rerolling',async response=>{
  const read=vi.fn().mockResolvedValue(response);await expect(resolvePackPerson(pick,read)).rejects.toThrow('verified');expect(read).toHaveBeenCalledOnce();
 });
 it('rejects a pick outside its frozen catalogue before a provider request',async()=>{
  const read=vi.fn();await expect(resolvePackPerson({...pick,name:'Not in roster'},read)).rejects.toThrow('unavailable');expect(read).not.toHaveBeenCalled();
 });
 it('refuses self-only actors and directors with no directing credits',async()=>{
  for(const p of [pick,{...pick,name:'Christopher Nolan',packType:'director' as const,rarity:'icon' as const}]){
   const read=vi.fn().mockResolvedValueOnce({id:PACK_PERSON_IDS[p.name],name:p.name}).mockResolvedValueOnce({cast:[{character:'Self'}],crew:[{job:'Writer'}]});
   await expect(resolvePackPerson(p,read)).rejects.toThrow('credit');
  }
 });
 it('returns an existing legacy reveal without drawing or fetching again',async()=>{
  const saved={person:{id:1,name:'Legacy'},packType:'actor'},rpc=vi.fn().mockResolvedValue({data:saved,error:null}),read=vi.fn(),random=vi.fn();
  expect(await openCollectiblePack(rpc,read,'u',id,'token',random)).toEqual(saved);expect(read).not.toHaveBeenCalled();expect(random).not.toHaveBeenCalled();expect(rpc).toHaveBeenCalledOnce();
 });
 it('saves the name before profile loading and reuses it after a network error',async()=>{
  let saved:PackPick|null=null;const order:string[]=[];
  const rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>{
   order.push(name);
   if(name==='claim_cinegeek_pack')return {data:{packType:'actor',pick:saved},error:null};
   if(name==='store_cinegeek_pack_pick'){saved=args.p_pick as PackPick;return {data:saved,error:null};}
   return {data:{person:args.p_person,packType:'actor'},error:null};
  });
  const read=vi.fn(async()=>{order.push('profile');throw Error('offline');});
  await expect(openCollectiblePack(rpc,read,'u',id,'first',next(90,4))).rejects.toThrow('offline');
  expect(saved).toEqual(pick);expect(order).toEqual(['claim_cinegeek_pack','store_cinegeek_pack_pick','profile']);
  const retryRead=vi.fn().mockResolvedValueOnce({id:54693,name:'Emma Stone'}).mockResolvedValueOnce({cast:[{character:'Mia'}]});
  const random=vi.fn();const result=await openCollectiblePack(rpc,retryRead,'u',id,'second',random);
  expect(result.person).toMatchObject({name:'Emma Stone',rarity:'star'});expect(random).not.toHaveBeenCalled();
  expect(rpc.mock.calls.filter(c=>c[0]==='store_cinegeek_pack_pick')).toHaveLength(1);
 });
});

describe('catalogue editions',()=>{
 it('keeps the complete released v1 roster and odds unchanged',()=>{
  expect(createHash('sha256').update(JSON.stringify(PACK_CATALOGUES['cinegeek-cast-1'])).digest('hex')).toBe('106d0de00b5478162679741fa7a498c95fd7a20275db4053ca3fc875cf990495');
  for(const type of ['actor','director'] as const)for(const tier of PACK_CATALOGUES['cinegeek-cast-1'].odds){
   for(const name of PACK_CATALOGUES['cinegeek-cast-1'].roster[type][tier.id]){
    const saved={name,packType:type,rarity:tier.id,version:'cinegeek-cast-1'};
    expect(readPackPick(saved)).toEqual(saved);
   }
  }
 });
 it('resolves a v1 draw after its person changed tier without using new randomness',async()=>{
  const saved={name:'Florence Pugh',packType:'actor',rarity:'established',version:'cinegeek-cast-1'};
  const rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>({data:name==='claim_cinegeek_pack'?{packType:'actor',pick:saved}:{person:args.p_person,packType:'actor'},error:null}));
  const read=vi.fn().mockResolvedValueOnce({id:1373737,name:'Florence Pugh'}).mockResolvedValueOnce({cast:[{character:'Yelena'}]});
  const random=vi.fn();
  const result=await openCollectiblePack(rpc,read,'u',id,'retry',random);
  expect(result.person).toMatchObject({name:'Florence Pugh',rarity:'established',catalogue_version:'cinegeek-cast-1'});
  expect(random).not.toHaveBeenCalled();
  expect(rpc.mock.calls.map(c=>c[0])).toEqual(['claim_cinegeek_pack','store_cinegeek_reveal']);
  expect(readPackPick({...saved,version:PACK_CATALOGUE_VERSION})).toBeNull();
 });
 it('keeps Joseph Zada out of easy pools and retains the hardest tier for the named icons',()=>{
  expect(PACK_ROSTER.actor.star).toContain('Joseph Zada');
  expect(PACK_ROSTER.actor.discovery).not.toContain('Joseph Zada');
  expect(PACK_ROSTER.actor.icon).toContain('Leonardo DiCaprio');
  expect(PACK_ROSTER.director.icon).toContain('Christopher Nolan');
 });
 it('refuses an unknown saved edition rather than silently redrawing',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:{packType:'actor',pick:{...pick,version:'future'}},error:null});
  const read=vi.fn(),random=vi.fn();
  await expect(openCollectiblePack(rpc,read,'u',id,'token',random)).rejects.toThrow('version unavailable');
  expect(read).not.toHaveBeenCalled();expect(random).not.toHaveBeenCalled();
 });
});
