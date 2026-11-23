import {supabase} from '@/integrations/supabase/client';
import {parseRecoveryLink,recoveryOrigin,recoveryPath} from './recovery-link';

// Subscribe at module load: Auth can consume the URL before AppSession mounts.
// The URL signals intent only. Only Auth's recovery event unlocks the form.
const params=new URLSearchParams(window.location.hash.slice(1));
const query=new URLSearchParams(window.location.search);
type RecoveryState={intent:boolean;ready:boolean;owner:string|null;pending:boolean;error:string|null;linkId:number};
let state:RecoveryState={intent:params.get('type')==='recovery' || query.get('type')==='recovery' ||
 window.location.pathname==='/reset-password',ready:false,owner:null,pending:false,error:null,linkId:0};
let candidate:string|null=null,revision=0,verifying=false;
const listeners=new Set<()=>void>();
function set(next:RecoveryState){state=next;listeners.forEach(listener=>listener());}
export const recovery={
 subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
 snapshot:()=>state,
 finish(){candidate=null;revision++;set({intent:false,ready:true,owner:null,pending:false,error:null,linkId:state.linkId});},
 receiveLink(raw:string){
  const link=parseRecoveryLink(raw);
  if(link.kind==='unrelated')return false;
  revision++;
  candidate=link.kind==='token'?link.token:null;
  set({intent:true,ready:true,owner:null,pending:!!candidate,linkId:state.linkId+1,error:link.kind==='invalid'?
   'This reset link isn’t valid. Request a fresh one below.':null});
  return true;
 },
 async confirmLink(){
  if(!candidate || verifying)return;
  const token=candidate,attempt=revision;candidate=null;verifying=true;
  set({...state,ready:false,pending:false,error:null,owner:null});
  try{
   const {data,error}=await supabase.auth.verifyOtp({token_hash:token,type:'recovery'});
   if(attempt!==revision)return;
   if(error || !data.session?.user.id){
    set({...state,ready:true,owner:null,error:error?.status===429?
     'Please wait before trying again.':error?.name==='AuthRetryableFetchError'?
     'Couldn’t reach CineGeek. Reopen your email link when you’re connected.':
     'This reset link has expired or was already used. Request a fresh one below.'});
    return;
   }
   set({...state,ready:true,owner:data.session.user.id,error:null});
  }catch{
   if(attempt===revision)set({...state,ready:true,owner:null,error:'Couldn’t check this link. Reopen your email link and try again.'});
  }finally{verifying=false;}
 },
};
supabase.auth.onAuthStateChange((event,session)=>{
 // verifyOtp emits this event too. Its awaited result is gated by the current
 // link revision, so a superseded request cannot unlock a different link's form.
 if(event==='PASSWORD_RECOVERY' && !verifying)set({intent:true,ready:true,owner:session?.user.id??null,pending:false,error:null,linkId:state.linkId+1});
 else if(event==='INITIAL_SESSION' && !state.ready && !verifying)set({...state,ready:true});
 else if(event==='SIGNED_OUT'){
  if(verifying)revision++;
  set({...state,ready:true,owner:null});
 }
 else if(state.owner && session?.user.id!==state.owner)set({...state,ready:true,owner:null});
});
// New direct email links need an explicit Continue tap on the browser fallback:
// previewing a link must not consume it. Existing implicit recovery links still work.
if(window.location.pathname===recoveryPath && params.has('token_hash')){
 recovery.receiveLink(`${recoveryOrigin}${window.location.pathname}${window.location.search}${window.location.hash}`);
 window.history.replaceState(window.history.state,'',recoveryPath);
}
export const passwordResetOrigin=()=>import.meta.env.MODE==='native'?recoveryOrigin:window.location.origin;
export const passwordResetURL=()=>`${passwordResetOrigin()}/reset-password`;
