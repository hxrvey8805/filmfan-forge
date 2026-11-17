import {useRef,useState} from 'react';
import {Link,Navigate,useNavigate} from 'react-router-dom';
import {useQueryClient} from '@tanstack/react-query';
import {useViewerSession} from '@/hooks/use-viewer-session';
import {useAIPrivacy} from '@/components/AIPrivacy';
import {AI_DISCLOSURES,type AIFeature} from '@/lib/privacy';
import {supabase} from '@/integrations/supabase/client';
import {iosWatchFocus} from '@/lib/watch-focus';
import {eraseLocalAccount} from '@/lib/erase-local-account';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import './account.css';

export default function AccountPrivacy(){
 const viewer=useViewerSession(),privacy=useAIPrivacy(),navigate=useNavigate(),cache=useQueryClient();
 const current=useRef(viewer?.id);current.current=viewer?.id;
 const [deleting,setDeleting]=useState(false),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [erased,setErased]=useState(false);const deletionCompleted=useRef(false);
 if(!viewer)return <Navigate to="/auth" replace/>;
 async function toggle(feature:AIFeature){setError('');setBusy(true);try{
  if(privacy.choices[feature])await privacy.withdraw(feature);else await privacy.ensure(feature);
 }catch(e){setError(e instanceof Error?e.message:'Couldn’t save your choice.');}finally{setBusy(false);}}
 async function remove(event:React.FormEvent){
  event.preventDefault();if(busy||!viewer?.email)return;setBusy(true);setError('');const owner=viewer.id;
  try{
   if(!deletionCompleted.current){
    const {data,error:failure}=await supabase.auth.signInWithPassword({email:viewer.email,password});setPassword('');
    if(failure)throw Error('That password didn’t match. Try again or reset your password first.');
    if(data.user?.id!==owner||current.current!==owner)throw Error('Account changed. Reopen Privacy before continuing.');
    // Erase only this viewer’s opaque app choices; release any active shields.
    if(iosWatchFocus)await iosWatchFocus.forgetViewer({viewer:owner});
    const result=await supabase.functions.invoke('delete-account',{body:{confirmation:'DELETE'}});
    if(result.error||result.data?.deleted!==true)throw Error('Your account could not be deleted. Please try again.');
    deletionCompleted.current=true;setErased(true);
   }
   eraseLocalAccount(owner);
   await supabase.auth.signOut({scope:'local'});cache.clear();
   navigate('/auth?deleted=1',{replace:true});
  }catch(e){setError(deletionCompleted.current?'Your account was deleted. Device cleanup needs another try. Tap Finish cleanup.':e instanceof Error?e.message:'Couldn’t delete your account. Please try again.');}
  finally{setBusy(false);}
 }
 return <main className="account-page"><Link className="account-back" to="/dashboard?tab=profile">← Profile</Link>
  <header><p className="eyebrow">You’re in control</p><h1>Account & privacy</h1><p className="account-email">{viewer.email}</p></header>
  <section className="account-card"><h2>AI permissions</h2><p>Choose what Geek can share with AI services. Turning a feature off stops new requests; an answer already processing may finish.</p>
   {!privacy.ready?<><p role="status">{privacy.error||'Loading your choices…'}</p><Button variant="outline" onClick={privacy.reload}>Retry</Button></>:Object.entries(AI_DISCLOSURES).map(([feature,info])=><div className="privacy-choice" key={feature}>
    <div><h3>{info.title}</h3><p>{info.recipient}</p><small>{privacy.choices[feature as AIFeature]?'Allowed':'Not allowed'}</small></div>
    <Button variant="outline" disabled={busy} onClick={()=>void toggle(feature as AIFeature)}>{privacy.choices[feature as AIFeature]?'Turn off':'Review & allow'}</Button>
   </div>)}
   <Link to="/privacy">Read the full privacy notice →</Link>
  </section>
  <section className="account-card"><h2>Password & support</h2><p>Use a secure email link to change a forgotten password.</p><div className="account-actions"><Button variant="outline" asChild><Link to="/reset-password">Reset password</Link></Button><Button variant="outline" asChild><Link to="/support">Get help</Link></Button></div></section>
  <section className="account-card account-danger"><h2>Delete account</h2><p>Permanently delete your account, saved titles, chats, XP, collectibles and settings. This cannot be undone.</p>
   <p><strong>Deleting CineGeek does not cancel an Apple subscription.</strong> Cancel renewal in Apple’s subscription settings if you have one. You can still delete your account immediately.</p>
   <a href="https://apps.apple.com/account/subscriptions/" target="_blank" rel="noreferrer">Manage Apple subscriptions ↗</a>
   {!deleting?<Button variant="destructive" disabled={busy} onClick={()=>setDeleting(true)}>Delete my account…</Button>:<form className="account-form" onSubmit={remove}>
    <p>Your data will be removed now. A minimal purchase reference is kept to prevent a previously redeemed purchase being transferred to another account.</p>
    {!erased&&<><Label htmlFor="delete-password">Confirm with your CineGeek password</Label><Input id="delete-password" type="password" required autoComplete="current-password" disabled={busy} value={password} onChange={e=>setPassword(e.target.value)}/></>}
    <div className="account-actions"><Button type="button" variant="outline" disabled={busy||erased} onClick={()=>{setDeleting(false);setPassword('');}}>Keep my account</Button><Button variant="destructive" disabled={busy}>{busy?'Please wait…':erased?'Finish cleanup':'Permanently delete account'}</Button></div>
   </form>}
  </section>{error&&<p className="account-error" role="alert">{error}</p>}
 </main>;
}
