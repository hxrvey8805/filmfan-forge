// Editorial collection categories, not ratings of artistic merit or cash value.
// Keep a version's roster immutable: persisted draws must remain resolvable.
export const PACK_CATALOGUE_VERSION = 'cinegeek-cast-1';
export const COLLECTION_LIMIT = 6;
export type PackType = 'actor'|'director';
export type CardRarity = 'established'|'star'|'icon';
export const PACK_ODDS = [
  {id:'established',label:'Established',weight:60},
  {id:'star',label:'Star',weight:30},
  {id:'icon',label:'Icon',weight:10},
] as const;
export const PACK_ROSTER:Record<PackType,Record<CardRarity,readonly string[]>> = {
  actor:{
    established:['John Turturro','Paul Dano','Jessie Buckley','Riz Ahmed','Steven Yeun','LaKeith Stanfield',
      'Toni Collette','Kirsten Dunst','Lupita Nyong’o','Rebecca Ferguson','Dev Patel','Barry Keoghan',
      'Florence Pugh','Andrew Scott','Gugu Mbatha-Raw','Walton Goggins'],
    star:['Christian Bale','Jake Gyllenhaal','Scarlett Johansson','Brad Pitt','Emma Stone','Cillian Murphy',
      'Amy Adams','Viola Davis','Joaquin Phoenix','Ryan Gosling','Samuel L. Jackson','Michelle Yeoh',
      'Kate Winslet','Matt Damon','Oscar Isaac','Javier Bardem'],
    icon:['Daniel Day-Lewis','Robert De Niro','Al Pacino','Denzel Washington','Leonardo DiCaprio','Meryl Streep',
      'Tom Hanks','Cate Blanchett','Anthony Hopkins','Morgan Freeman','Tom Cruise','Nicole Kidman'],
  },
  director:{
    established:['Jordan Peele','Ari Aster','Robert Eggers','Céline Sciamma','Sean Baker','Chloé Zhao',
      'Charlotte Wells','Justine Triet','Alex Garland','Taika Waititi','Lulu Wang','Emerald Fennell'],
    star:['Denis Villeneuve','David Fincher','Paul Thomas Anderson','Wes Anderson','Bong Joon-ho','Guillermo del Toro',
      'Peter Jackson','Spike Lee','Alfonso Cuarón','Joel Coen','Ethan Coen','Greta Gerwig'],
    icon:['Steven Spielberg','Martin Scorsese','Stanley Kubrick','Alfred Hitchcock','Quentin Tarantino','Christopher Nolan',
      'Akira Kurosawa','Francis Ford Coppola','David Lynch','Ridley Scott','James Cameron','Hayao Miyazaki'],
  },
};
export type PackPick={name:string;rarity:CardRarity;packType:PackType;version:string};
export const personNameKey=(name:string)=>name.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function isRarity(value:unknown):value is CardRarity{return PACK_ODDS.some(t=>t.id===value);}
export function readPackPick(value:unknown):PackPick|null{
  if(!value||typeof value!=='object')return null;const p=value as PackPick;
  if(p.version!==PACK_CATALOGUE_VERSION||!['actor','director'].includes(p.packType)||!isRarity(p.rarity)
    ||!PACK_ROSTER[p.packType][p.rarity].includes(p.name))return null;
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
