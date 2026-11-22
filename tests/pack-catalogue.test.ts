import {describe,it,expect,vi} from 'vitest';
import {drawPack,uniformIndex,PACK_ODDS,PACK_ROSTER,PACK_CATALOGUE_VERSION,readPackPick,personNameKey,type PackPick} from '../supabase/functions/_shared/pack-catalogue';
import {resolvePackPerson,openCollectiblePack} from '../supabase/functions/_shared/pack-service';
const next=(...values:number[])=>()=>values.shift()!;
const pick:PackPick={name:'Emma Stone',packType:'actor',rarity:'star',version:PACK_CATALOGUE_VERSION};
const id='00000000-0000-4000-8000-000000000001';
describe('approved pack odds',()=>{
 it.each([[0,'established'],[59,'established'],[60,'star'],[89,'star'],[90,'icon'],[99,'icon']] as const)('roll %s gives %s',(roll,tier)=>{
   for(const type of ['actor','director'] as const)expect(drawPack(type,next(roll,0)).rarity).toBe(tier);
 });
 it('assigns exactly 60/30/10 probability with equal odds per name and no repeated roster entries',()=>{
  expect(PACK_ODDS.reduce((a,t)=>a+t.weight,0)).toBe(100);
  for(const type of ['actor','director'] as const){
   const names=Object.values(PACK_ROSTER[type]).flat();expect(new Set(names.map(personNameKey)).size).toBe(names.length);
   expect(names.length).toBe(type==='actor'?44:36);
   let start=0;
   for(const tier of PACK_ODDS){
    const pool=PACK_ROSTER[type][tier.id];
    for(let index=0;index<pool.length;index++){
      expect(drawPack(type,next(start,index))).toEqual({name:pool[index],rarity:tier.id,packType:type,version:PACK_CATALOGUE_VERSION});
    }
    start+=tier.weight;
   }
   // Each icon is 10% / 12 = 1 in 120 packs, independent of popularity.
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
   const counts={established:0,star:0,icon:0};const names=new Map<string,number>();
   for(let i=0;i<100000;i++){const p=drawPack(type,random);counts[p.rarity]++;names.set(p.name,(names.get(p.name)??0)+1);}
   for(const t of PACK_ODDS)expect(Math.abs(counts[t.id]/1000-t.weight)).toBeLessThan(.6);
   for(const t of PACK_ODDS)for(const name of PACK_ROSTER[type][t.id]){
    const expected=100000*t.weight/100/PACK_ROSTER[type][t.id].length;
    expect(Math.abs(names.get(name)!-expected)/expected).toBeLessThan(.15);
   }
  }
 });
});
describe('profile verification and persistent draws',()=>{
 it('resolves an exact normalized name and verifies its actual credit, without relying on popularity',async()=>{
  const read=vi.fn().mockResolvedValueOnce({results:[{id:1,name:'Emma Stone',profile_path:'/face.jpg',adult:false},{id:2,name:'Emily Stone'}]}).mockResolvedValueOnce({cast:[{character:'Mia'}]});
  expect(await resolvePackPerson(pick,read)).toEqual({id:1,name:'Emma Stone',profile_path:'/face.jpg',rarity:'star',catalogue_version:PACK_CATALOGUE_VERSION});
  expect(read.mock.calls).toEqual([['search/person?query=Emma%20Stone&include_adult=false&language=en-US'],['person/1/combined_credits']]);
 });
 it('normalizes accents and punctuation, verifies directors and uses initials for missing/unsafe photos',async()=>{
  expect(personNameKey('Lupita Nyong’o')).toBe(personNameKey("Lupita Nyong'o"));
  const director:PackPick={...pick,name:'Céline Sciamma',packType:'director',rarity:'established'};
  const read=vi.fn().mockResolvedValueOnce({results:[{id:3,name:'Celine Sciamma',profile_path:'https://other.test/image.jpg'}]}).mockResolvedValueOnce({crew:[{job:'Director'}]});
  expect(await resolvePackPerson(director,read)).toMatchObject({id:3,profile_path:null,name:'Céline Sciamma'});
 });
 it.each([
  {results:[{id:1,name:'Someone else'}]},
  {results:[{id:1,name:'Emma Stone'},{id:2,name:'Emma Stone'}]},
  {results:[{id:1,name:'Emma Stone',adult:true}]},
 ])('refuses ambiguous, wrong or adult profiles without rerolling',async response=>{
  const read=vi.fn().mockResolvedValue(response);await expect(resolvePackPerson(pick,read)).rejects.toThrow('verified');expect(read).toHaveBeenCalledOnce();
 });
 it('refuses a profile with only self-appearances or no directing credits',async()=>{
  for(const p of [pick,{...pick,packType:'director' as const}]){
   const read=vi.fn().mockResolvedValueOnce({results:[{id:1,name:p.name}]}).mockResolvedValueOnce({cast:[{character:'Self'}],crew:[{job:'Writer'}]});
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
  await expect(openCollectiblePack(rpc,read,'u',id,'first',next(60,4))).rejects.toThrow('offline');
  expect(saved).toEqual(pick);expect(order).toEqual(['claim_cinegeek_pack','store_cinegeek_pack_pick','profile']);
  const retryRead=vi.fn().mockResolvedValueOnce({results:[{id:1,name:'Emma Stone'}]}).mockResolvedValueOnce({cast:[{character:'Mia'}]});
  const random=vi.fn();const result=await openCollectiblePack(rpc,retryRead,'u',id,'second',random);
  expect(result.person).toMatchObject({name:'Emma Stone',rarity:'star'});expect(random).not.toHaveBeenCalled();
  expect(rpc.mock.calls.filter(c=>c[0]==='store_cinegeek_pack_pick')).toHaveLength(1);
 });
});
