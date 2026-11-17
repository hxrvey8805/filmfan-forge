import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {supabase} from '@/integrations/supabase/client';
import {useViewerSession} from '@/hooks/use-viewer-session';
import {AI_DISCLOSURES,AI_NOTICE_VERSION,parseAIChoices,type AIChoices,type AIFeature} from '@/lib/privacy';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from './ui/dialog';
import {Button} from './ui/button';
// New RPCs are runtime-validated until generated database types are refreshed.
type PrivacyRpc=(name:string,args?:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
const rpc:PrivacyRpc=(name,args)=>(supabase.rpc as unknown as PrivacyRpc)(name,args);
type PrivacyContext={choices:AIChoices;ready:boolean;error:string;ensure:(feature:AIFeature)=>Promise<boolean>;withdraw:(feature:AIFeature)=>Promise<void>;reload:()=>void};
const Context=createContext<PrivacyContext|null>(null);
export function useAIPrivacy(){const value=useContext(Context);if(!value)throw Error('Privacy controls are unavailable. Reopen CineGeek.');return value;}

export function AIPrivacyProvider({children}:{children:ReactNode}){
 const viewer=useViewerSession(),owner=viewer?.id??null;
 const [state,setState]=useState<{owner:string|null;choices:AIChoices;ready:boolean}>({owner:null,choices:{},ready:false});
 const [error,setError]=useState(''),[revision,setRevision]=useState(0),[feature,setFeature]=useState<AIFeature|null>(null),[busy,setBusy]=useState(false);
 const current=useRef(owner);current.current=owner;
 const pending=useRef<{owner:string;feature:AIFeature;resolve:(ok:boolean)=>void}|null>(null);
 const ready=state.owner===owner && state.ready,choices=state.owner===owner?state.choices:{};
 useEffect(()=>{
  let alive=true;pending.current?.resolve(false);pending.current=null;setFeature(null);setBusy(false);setError('');
  if(!owner){setState({owner:null,choices:{},ready:true});return;}
  void rpc('get_ai_privacy_choices').then(({data,error:failure})=>{
   if(!alive)return;if(failure)throw Error('Privacy settings unavailable. Try again.');
   setState({owner,choices:parseAIChoices(data),ready:true});
  }).catch(()=>{if(alive){setState({owner,choices:{},ready:false});setError('Privacy settings unavailable. Try again.');}});
  return()=>{alive=false;pending.current?.resolve(false);pending.current=null;};
 },[owner,revision]);
 function close(){if(busy)return;pending.current?.resolve(false);pending.current=null;setFeature(null);setError('');}
 async function save(target:AIFeature,allowed:boolean){
  if(!owner)throw Error('Please sign in.');
  const {data,error:failure}=await rpc('set_ai_privacy_choice',{p_feature:target,p_allowed:allowed,p_version:AI_NOTICE_VERSION});
  if(current.current!==owner)throw Error('Account changed.');
  if(failure)throw Error('Couldn’t save your privacy choice. Try again.');
  const next=parseAIChoices(data);if(next[target]!==allowed)throw Error('Couldn’t confirm your privacy choice. Try again.');
  setState({owner,choices:next,ready:true});
 }
 async function allow(){if(!feature || busy)return;setBusy(true);setError('');const request=pending.current;
  try{await save(feature,true);if(pending.current===request){request?.resolve(true);pending.current=null;setFeature(null);}}
  catch(e){setError(e instanceof Error?e.message:'Couldn’t save permission.');}finally{setBusy(false);}
 }
 function ensure(target:AIFeature):Promise<boolean>{
  if(!owner)return Promise.reject(Error('Please sign in.'));
  if(!ready)return Promise.reject(Error('Privacy settings are still unavailable. Open Profile → Account & privacy to retry.'));
  if(choices[target]===true)return Promise.resolve(true);
  if(pending.current)return Promise.reject(Error('Finish the privacy choice already open.'));
  setError('');setFeature(target);return new Promise(resolve=>{pending.current={owner,feature:target,resolve};});
 }
 const disclosure=feature?AI_DISCLOSURES[feature]:null;
 return <Context.Provider value={{choices,ready,error,ensure,withdraw:f=>save(f,false),reload:()=>setRevision(v=>v+1)}}>
  {children}
  <Dialog open={!!feature} onOpenChange={open=>{if(!open)close();}}><DialogContent className="privacy-consent" onEscapeKeyDown={e=>{if(busy)e.preventDefault();}} onPointerDownOutside={e=>{if(busy)e.preventDefault();}}>
   <DialogTitle>A quick privacy check</DialogTitle><DialogDescription>Choose whether to use {disclosure?.title}. You can change this in Profile → Account & privacy.</DialogDescription>
   {disclosure&&<><p><strong>Shared with {disclosure.recipient}</strong></p><p>{disclosure.data}</p><p>{disclosure.purpose}</p>
    <p className="text-sm text-muted-foreground">We don’t add your email, password or Apple payment details to AI prompts. Anything personal you type is part of your message. Providers may retain requests under their policies.</p>
    <Link className="text-primary underline" to="/privacy" onClick={close}>Read the privacy notice</Link>
    {error&&<p role="alert">{error}</p>}
    <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy} onClick={close}>Not now</Button><Button disabled={busy} onClick={()=>void allow()}>{busy?'Saving…':'Allow and continue'}</Button></div>
   </>}
  </DialogContent></Dialog>
 </Context.Provider>;
}
