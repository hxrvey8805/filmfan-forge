import {useEffect,useState,useSyncExternalStore} from 'react';
import {Link} from 'react-router-dom';
import {supabase} from '@/integrations/supabase/client';
import {recovery,passwordResetURL} from '@/lib/password-recovery';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import './account.css';

export default function ResetPassword(){
 const status=useSyncExternalStore(recovery.subscribe,recovery.snapshot);
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[done,setDone]=useState(false);
 useEffect(()=>{setDone(false);setError('');setMessage('');setPassword('');setConfirm('');},[status.linkId]);
 async function submit(event:React.FormEvent){
  event.preventDefault();if(busy)return;setError('');setMessage('');
  if(status.owner && (password.length<8 || password!==confirm)){setError(password.length<8?'Use at least 8 characters.':'The passwords don’t match.');return;}
  setBusy(true);
  try{
   if(status.owner){
    const {data,error:sessionError}=await supabase.auth.getUser();
    if(sessionError || data.user?.id!==status.owner)throw Error('This reset link is no longer valid. Request a new one.');
    const {error:failure}=await supabase.auth.updateUser({password});
    if(failure)throw Error(failure.code==='weak_password'?'Choose a stronger password.':failure.code==='same_password'?'Choose a password you haven’t used before.':'Couldn’t update your password. Request a fresh reset link and try again.');
    setPassword('');setConfirm('');setDone(true);recovery.finish();
    // End the temporary recovery session before normal app sign-in.
    await supabase.auth.signOut({scope:'local'});
   }else{
    const {error:failure}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:passwordResetURL()});
    if(failure)throw Error(failure.status===429?'Please wait before requesting another email.':'Couldn’t send the reset email. Check your connection and try again.');
    setMessage(import.meta.env.MODE==='native'?'If an account uses that email, a reset link is on its way. Open the newest email to return to CineGeek.':'If an account uses that email, a reset link is on its way. Open the newest email to continue.');
   }
  }catch(e){setError(e instanceof Error?e.message:'Couldn’t finish. Please try again.');}finally{setBusy(false);}
 }
 return <main className="account-page"><Link className="account-back" to="/auth" onClick={()=>recovery.finish()}>← Sign in</Link><section className="account-card">
  <p className="eyebrow">Back to the good stuff</p><h1>{done?'Password updated':status.owner?'Choose a new password':'Reset your password'}</h1>
  {done?<><p>{import.meta.env.MODE==='native'?'Your new password is ready. Sign in to get back to CineGeek.':'Your new password is ready. Return to CineGeek on your phone and sign in, or continue here.'}</p><Button asChild><Link to="/auth">Continue to sign in</Link></Button></>:!status.ready?<p role="status">Checking your reset link…</p>:status.pending?<>
   <p>You’re in the right place. Continue to choose a new password for your CineGeek account.</p>
   <Button onClick={()=>void recovery.confirmLink()}>Continue to reset</Button>
  </>:<>
   <p>{status.owner?'Keep it unique to your CineGeek account.':'Enter your account email. If you arrived from an expired or already-used link, request a fresh one below.'}</p>
   <form onSubmit={submit} className="account-form">
    {status.owner?<><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" required minLength={8} autoComplete="new-password" value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/>
     <Label htmlFor="confirm-password">Confirm new password</Label><Input id="confirm-password" type="password" required minLength={8} autoComplete="new-password" value={confirm} disabled={busy} onChange={e=>setConfirm(e.target.value)}/></>:<>
     <Label htmlFor="reset-email">Email</Label><Input id="reset-email" type="email" required autoComplete="email" value={email} disabled={busy} onChange={e=>setEmail(e.target.value)}/></>}
    {(error||status.error)&&<p className="account-error" role="alert">{error||status.error}</p>}{message&&<p role="status">{message}</p>}
    {status.owner&&<button type="button" className="text-sm text-primary underline" disabled={busy} onClick={()=>{recovery.finish();setError('');setPassword('');setConfirm('');}}>Request another reset link</button>}
    <Button disabled={busy}>{busy?'Please wait…':status.owner?'Save new password':'Send reset link'}</Button>
   </form></>}
 </section><p className="account-footer"><Link to="/privacy">Privacy</Link> · <Link to="/support">Support</Link></p></main>;
}
