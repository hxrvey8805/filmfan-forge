import {supabase} from '@/integrations/supabase/client';

// Subscribe at module load: Auth can consume the URL before AppSession mounts.
// The URL signals intent only. Only Auth's recovery event unlocks the form.
const params=new URLSearchParams(window.location.hash.slice(1));
const query=new URLSearchParams(window.location.search);
type RecoveryState={intent:boolean;ready:boolean;owner:string|null};
let state:RecoveryState={intent:params.get('type')==='recovery' || query.get('type')==='recovery' ||
 window.location.pathname==='/reset-password',ready:false,owner:null};
const listeners=new Set<()=>void>();
function set(next:RecoveryState){state=next;listeners.forEach(listener=>listener());}
export const recovery={
 subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
 snapshot:()=>state,
 finish(){set({intent:false,ready:true,owner:null});},
};
supabase.auth.onAuthStateChange((event,session)=>{
 if(event==='PASSWORD_RECOVERY')set({intent:true,ready:true,owner:session?.user.id??null});
 else if(event==='INITIAL_SESSION' && !state.ready)set({...state,ready:true});
 else if(event==='SIGNED_OUT' || (state.owner && session?.user.id!==state.owner))set({...state,ready:true,owner:null});
});
export const passwordResetOrigin=()=>import.meta.env.MODE==='native'?'https://cinegeek.lovable.app':window.location.origin;
export const passwordResetURL=()=>`${passwordResetOrigin()}/reset-password`;
