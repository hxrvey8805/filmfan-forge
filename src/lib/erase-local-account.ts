import {forgetViewerPreferences} from '@/hooks/use-viewer-preference';
import {forgetBookmarks} from './viewing-bookmark';
import {forgetPendingXp} from './xp-redemption';

export function accountStorageKey(key:string,owner:string){
 return !!owner && key.startsWith('cinegeek.') && (key.endsWith(`.${owner}`)||key.includes(`.${owner}.`));
}
export function eraseLocalAccount(owner:string){
 if(!owner)throw Error('Missing account');
 for(const storage of [localStorage,sessionStorage]){
  for(let i=storage.length-1;i>=0;i--){const key=storage.key(i);if(key&&accountStorageKey(key,owner))storage.removeItem(key);}
 }
 forgetViewerPreferences(owner);forgetBookmarks(owner);forgetPendingXp(owner);
}
