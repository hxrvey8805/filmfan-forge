export type Plan = 'free' | 'monthly' | 'annual';
export type ProAccess = { userId:string; plan:Plan; purchasesEnabled:false; smartLists:boolean; focusGeek:boolean;
  allSkins:boolean; unlockedSkins:string[]; badges:string[]; gamesRemaining:number|null;
  xp:number; lifetimeXp:number; xpToday:number; xpDailyCap:225; spinAvailable:boolean; expiresAt:string|null };
export function readProAccess(value:unknown):ProAccess|null {
  if(!value || typeof value!=='object')return null;
  const v=value as Record<string,unknown>;
  if(typeof v.userId!=='string' || !['free','monthly','annual'].includes(String(v.plan)) || v.purchasesEnabled!==false ||
    !['xp','lifetimeXp','xpToday'].every(k=>Number.isSafeInteger(v[k]) && Number(v[k])>=0) || v.xpDailyCap!==225 ||
    Number(v.xpToday)>225 || Number(v.lifetimeXp)<Number(v.xp) ||
    !['unlockedSkins','badges'].every(k=>Array.isArray(v[k]) && (v[k] as unknown[]).every(x=>typeof x==='string')) ||
    typeof v.spinAvailable!=='boolean' || !(v.expiresAt===null || typeof v.expiresAt==='string' && Number.isFinite(Date.parse(v.expiresAt))) ||
    !(v.plan==='free' ? Number.isInteger(v.gamesRemaining) && Number(v.gamesRemaining)>=0 && Number(v.gamesRemaining)<=1 : v.gamesRemaining===null) ||
    v.smartLists!==(v.plan!=='free') || v.focusGeek!==true || v.allSkins!==(v.plan==='annual'))return null;
  return v as ProAccess;
}
export const canWear = (access:ProAccess|null, skin:string) => skin==='classic' || !!access &&
  (access.plan==='annual' || access.plan==='monthly' && access.unlockedSkins.includes(skin));
export const accountChanged=()=>window.dispatchEvent(new Event('cinegeek:account-changed'));
