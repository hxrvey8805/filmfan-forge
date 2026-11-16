import type {Plan,ProAccess} from '../src/lib/pro-access';
export const planFixture=(plan:Plan='annual',userId='viewer-a'):ProAccess=>({userId,plan,purchasesEnabled:false,
 smartLists:plan!=='free',focusGeek:true,allSkins:plan==='annual',unlockedSkins:[],badges:[],gamesRemaining:plan==='free'?1:null,
 xp:2000,lifetimeXp:3000,xpToday:75,xpDailyCap:225,spinAvailable:plan!=='free',expiresAt:plan==='free'?null:'2027-01-01T00:00:00Z'});
