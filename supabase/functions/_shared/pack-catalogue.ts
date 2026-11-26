import {PACK_CATALOGUES} from './pack-catalogues.ts';

// Draws use the current edition; resolving a saved draw uses its original edition.
export const PACK_CATALOGUE_VERSION = 'cinegeek-cast-2';
export const COLLECTION_LIMIT = 6;
export type PackType = 'actor'|'director';
export type CardRarity = 'discovery'|'featured'|'established'|'star'|'icon';
export type PackCatalogue = {
  readonly odds: readonly {readonly id:CardRarity;readonly label:string;readonly weight:number}[];
  readonly roster: Readonly<Record<PackType,Readonly<Partial<Record<CardRarity,readonly string[]>>>>>;
};
export const PACK_ODDS = PACK_CATALOGUES[PACK_CATALOGUE_VERSION].odds;
export const PACK_ROSTER = PACK_CATALOGUES[PACK_CATALOGUE_VERSION].roster;
export function getPackCatalogue(version:unknown):PackCatalogue|undefined {
  return typeof version==='string'&&Object.prototype.hasOwnProperty.call(PACK_CATALOGUES,version)
    ? PACK_CATALOGUES[version as keyof typeof PACK_CATALOGUES] : undefined;
}
export type PackPick={name:string;rarity:CardRarity;packType:PackType;version:string};
export const personNameKey=(name:string)=>name.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function isRarity(value:unknown):value is CardRarity {
  return Object.values(PACK_CATALOGUES).some(c=>c.odds.some(t=>t.id===value));
}
export function readPackPick(value:unknown):PackPick|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const p=value as PackPick,catalogue=getPackCatalogue(p.version);
  if(!catalogue||!['actor','director'].includes(p.packType)||!isRarity(p.rarity)
    ||!catalogue.roster[p.packType][p.rarity]?.includes(p.name))return null;
  return {name:p.name,rarity:p.rarity,packType:p.packType,version:p.version};
}
// Rejection sampling avoids the slight modulo bias of randomUint % length.
export function uniformIndex(size:number,next:()=>number):number{
  if(!Number.isSafeInteger(size)||size<1||size>0x100000000)throw Error('Invalid draw size');
  const ceiling=Math.floor(0x100000000/size)*size;
  for(let attempt=0;attempt<100;attempt++){
    const value=next();if(!Number.isInteger(value)||value<0||value>=0x100000000)throw Error('Invalid random value');
    if(value<ceiling)return value%size;
  }
  throw Error('Random source unavailable');
}
export function drawPack(type:PackType,next:()=>number):PackPick{
  if(type!=='actor'&&type!=='director')throw Error('Invalid pack');
  const roll=uniformIndex(100,next);let boundary=0;
  const tier=PACK_ODDS.find(t=>{boundary+=t.weight;return roll<boundary;})!;
  const pool=PACK_ROSTER[type][tier.id];
  return {name:pool[uniformIndex(pool.length,next)],rarity:tier.id,packType:type,version:PACK_CATALOGUE_VERSION};
}
