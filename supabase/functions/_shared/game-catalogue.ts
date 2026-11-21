import { titleCast, type GameCastMember } from './actor-cast.ts';

// Use the same catalogue fallback for the picker and the result verifier.
export async function gameCatalogueCast(type:'movie'|'tv',id:number,read:(path:string)=>Promise<{cast?:unknown}>):Promise<GameCastMember[]>{
  const paths=type==='movie'?[`movie/${id}/credits`]:[`tv/${id}/aggregate_credits`,`tv/${id}/credits`];
  let received=false;
  for(const path of paths){
    try{
      const data=await read(path);
      if(!Array.isArray(data.cast))continue;
      received=true;
      const members=titleCast(data.cast);
      if(members.length)return members;
    }catch{/* Try the same alternate credits source offered in the game. */}
  }
  if(!received)throw new Error('Catalogue unavailable');
  return [];
}
