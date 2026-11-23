// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const auth=vi.hoisted(()=>({listener:null as any,getUser:vi.fn(),updateUser:vi.fn(),signOut:vi.fn(),resetPasswordForEmail:vi.fn(),verifyOtp:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{...auth,onAuthStateChange:(listener:any)=>{auth.listener=listener;return {data:{subscription:{unsubscribe:vi.fn()}}};}}}}));
import ResetPassword from '../src/pages/ResetPassword';
import {recovery} from '../src/lib/password-recovery';
import {RecoveryBoundary} from '../src/components/RecoveryBoundary';
beforeEach(()=>{recovery.finish();vi.clearAllMocks();auth.getUser.mockResolvedValue({data:{user:{id:'owner'}},error:null});auth.updateUser.mockResolvedValue({error:null});auth.signOut.mockResolvedValue({error:null});auth.resetPasswordForEmail.mockResolvedValue({error:null});});
afterEach(cleanup);
const show=()=>render(<MemoryRouter><ResetPassword/></MemoryRouter>);
const set=(label:string,value:string)=>fireEvent.change(screen.getByLabelText(label),{target:{value}});
it('captures a recovery event before the React screen mounts',()=>{
 auth.listener('PASSWORD_RECOVERY',{user:{id:'owner'}});show();expect(screen.getByLabelText('New password')).toBeTruthy();
});
it('never treats a normal session or an expired link as password recovery',()=>{
 auth.listener('INITIAL_SESSION',{user:{id:'owner'}});show();expect(screen.queryByLabelText('New password')).toBeNull();expect(screen.getByLabelText('Email')).toBeTruthy();
});
it('requires matching passwords and a verified same-account recovery session',async()=>{
 auth.listener('PASSWORD_RECOVERY',{user:{id:'owner'}});show();set('New password','test-strong-password');set('Confirm new password','different');
 fireEvent.click(screen.getByText('Save new password'));expect(screen.getByRole('alert').textContent).toContain('don’t match');expect(auth.updateUser).not.toHaveBeenCalled();
 set('Confirm new password','test-strong-password');auth.getUser.mockResolvedValue({data:{user:{id:'other'}}});fireEvent.click(screen.getByText('Save new password'));
 await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('no longer valid'));expect(auth.updateUser).not.toHaveBeenCalled();
});
it('updates the password once and clears the temporary recovery session',async()=>{
 auth.listener('PASSWORD_RECOVERY',{user:{id:'owner'}});show();set('New password','test-strong-password');set('Confirm new password','test-strong-password');fireEvent.click(screen.getByText('Save new password'));
 await screen.findByText('Password updated');expect(auth.updateUser).toHaveBeenCalledExactlyOnceWith({password:'test-strong-password'});expect(auth.signOut).toHaveBeenCalledWith({scope:'local'});expect(recovery.snapshot().owner).toBeNull();
});
it('requests a public recovery route without revealing whether an email is registered',async()=>{
 show();set('Email','person@example.com');fireEvent.click(screen.getByText('Send reset link'));
 await screen.findByText(/If an account uses that email/);expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('person@example.com',{redirectTo:expect.stringMatching(/\/reset-password$/)});
});
it('locks the recovery form again when the account changes',async()=>{
 auth.listener('PASSWORD_RECOVERY',{user:{id:'owner'}});show();await act(async()=>auth.listener('SIGNED_IN',{user:{id:'other'}}));expect(screen.queryByLabelText('New password')).toBeNull();
});
const freshLink='https://cinegeek.lovable.app/reset-password#token_hash='+ 'a'.repeat(56)+'&type=recovery';
it('does not consume an email preview; Continue verifies recovery before showing passwords',async()=>{
 recovery.receiveLink(freshLink);show();
 expect(screen.queryByLabelText('New password')).toBeNull();expect(auth.verifyOtp).not.toHaveBeenCalled();
 auth.verifyOtp.mockResolvedValue({data:{session:{user:{id:'owner'}}},error:null});
 fireEvent.click(screen.getByText('Continue to reset'));
 await screen.findByLabelText('New password');
 expect(auth.verifyOtp).toHaveBeenCalledExactlyOnceWith({type:'recovery',token_hash:'a'.repeat(56)});
});
it('shows a clear expired-link error and never unlocks an ordinary session',async()=>{
 recovery.receiveLink(freshLink);auth.listener('INITIAL_SESSION',{user:{id:'owner'}});show();
 auth.verifyOtp.mockResolvedValue({data:{session:null},error:{code:'otp_expired',status:403}});
 fireEvent.click(screen.getByText('Continue to reset'));
 await screen.findByText(/expired or was already used/);
 expect(screen.queryByLabelText('New password')).toBeNull();expect(auth.updateUser).not.toHaveBeenCalled();
});
it('cancels a late verified result when the viewer leaves recovery',async()=>{
 let resolve:any;auth.verifyOtp.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 recovery.receiveLink(freshLink);const pending=recovery.confirmLink();recovery.finish();
 auth.listener('PASSWORD_RECOVERY',{user:{id:'owner'}});
 resolve({data:{session:{user:{id:'owner'}}},error:null});await pending;
 expect(recovery.snapshot().owner).toBeNull();expect(recovery.snapshot().intent).toBe(false);
});
it('keeps a newer email link locked when an earlier verification completes',async()=>{
 let resolve:any;auth.verifyOtp.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 recovery.receiveLink(freshLink);const pending=recovery.confirmLink();
 recovery.receiveLink(freshLink.replace('a'.repeat(56),'b'.repeat(56)));
 auth.listener('PASSWORD_RECOVERY',{user:{id:'old-owner'}});
 resolve({data:{session:{user:{id:'old-owner'}}},error:null});await pending;
 expect(recovery.snapshot()).toMatchObject({owner:null,pending:true});
});
it('invalidates verification if the account signs out while it is pending',async()=>{
 let resolve:any;auth.verifyOtp.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 recovery.receiveLink(freshLink);const pending=recovery.confirmLink();auth.listener('SIGNED_OUT',null);
 resolve({data:{session:{user:{id:'owner'}}},error:null});await pending;
 expect(recovery.snapshot().owner).toBeNull();
});
it.each(['/account','/companion','/onboarding','/dashboard','/auth'])('opens recovery before other screen redirects at %s',async(path)=>{
 recovery.receiveLink(freshLink);
 const ordinary=vi.fn(()=> <div>Ordinary app screen</div>);
 const Ordinary=ordinary;
 render(<MemoryRouter initialEntries={[path]}><RecoveryBoundary><Routes>
  <Route path="/reset-password" element={<ResetPassword/>}/><Route path="*" element={<Ordinary/>}/>
 </Routes></RecoveryBoundary></MemoryRouter>);
 expect(await screen.findByText('Continue to reset')).toBeTruthy();expect(ordinary).not.toHaveBeenCalled();
});
it('replaces a completed reset screen when another email link arrives while the app stays open',async()=>{
 auth.listener('PASSWORD_RECOVERY',{user:{id:'owner'}});show();
 set('New password','test-strong-password');set('Confirm new password','test-strong-password');
 fireEvent.click(screen.getByText('Save new password'));await screen.findByText('Password updated');
 await act(async()=>{recovery.receiveLink(freshLink);});
 expect(screen.queryByText('Password updated')).toBeNull();expect(screen.getByText('Continue to reset')).toBeTruthy();
});
