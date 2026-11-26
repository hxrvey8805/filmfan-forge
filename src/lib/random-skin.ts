import {DEFAULT_OUTFIT,outfits,type Outfit} from '@/hooks/use-geek-outfit';

export const RANDOM_SKIN_ITEM='skin:random';
export const RANDOM_SKIN_PRICE=1500;
export const unlockableSkins=(Object.keys(outfits) as Outfit[]).filter(key=>key!==DEFAULT_OUTFIT);
export type RandomSkinResult={item:typeof RANDOM_SKIN_ITEM;skin:Outfit;xpBalance:number};
export function requireRandomSkinResult(value:unknown):RandomSkinResult{
  const result=value as Partial<RandomSkinResult>|null;
  if(!result||result.item!==RANDOM_SKIN_ITEM||typeof result.skin!=='string'||!unlockableSkins.some(key=>key===result.skin)||
    !Number.isSafeInteger(result.xpBalance)||Number(result.xpBalance)<0){
    throw new Error('The unlock could not be confirmed. Retry to check the same purchase.');
  }
  return result as RandomSkinResult;
}
