// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const auth=vi.hoisted(()=>({listener:null as any,getUser:vi.fn(),updateUser:vi.fn(),signOut:vi.fn(),resetPasswordForEmail:vi.fn(),verifyOtp:vi.fn()}));
const device=vi.hoisted(()=>({platform:'web',request:vi.fn(),confirm:vi.fn(),auth:{getUser:vi.fn(),updateUser:vi.fn(),signOut:vi.fn()}}));
vi.mock('@capacitor/core',()=>({Capacitor:{getPlatform:()=>device.platform}}));
vi.mock('../src/lib/device-password-recovery',()=>({devicePasswordRecovery:()=>device}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{...auth,onAuthStateChange:(listener:any)=>{auth.listener=listener;return {data:{subscription:{unsubscribe:vi.fn()}}};}}}}));
import ResetPassword from '../src/pages/ResetPassword';
import {recovery} from '../src/lib/password-recovery';
import {RecoveryBoundary} from '../src/components/RecoveryBoundary';
beforeEach(()=>{recovery.finish();vi.clearAllMocks();device.platform='web';auth.getUser.mockResolvedValue({data:{user:{id:'owner'}},error:null});auth.updateUser.mockResolvedValue({error:null});auth.signOut.mockResolvedValue({error:null});auth.resetPasswordForEmail.mockResolvedValue({error:null});device.request.mockResolvedValue({error:null});device.auth.getUser.mockResolvedValue({data:{user:{id:'device-owner'}},error:null});device.auth.updateUser.mockResolvedValue({error:null});device.auth.signOut.mockResolvedValue({error:null});});
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
const deviceLink='https://cinegeek.lovable.app/reset-password?app=1&state='+ 'a'.repeat(32)+'&code='+ 'c'.repeat(36);
it('hands browser callbacks to CineGeek without redeeming a code or showing password fields',()=>{
 recovery.receiveLink(deviceLink);show();
 expect(screen.getByRole('link',{name:'Open CineGeek'}).getAttribute('href')).toContain('app.cinegeek.mobile://reset-password?app=1');
 expect(screen.queryByLabelText('New password')).toBeNull();expect(screen.queryByLabelText('Email')).toBeNull();
 expect(device.confirm).not.toHaveBeenCalled();expect(auth.verifyOtp).not.toHaveBeenCalled();
 auth.listener('PASSWORD_RECOVERY',{user:{id:'unexpected-browser-owner'}});
 expect(recovery.snapshot().owner).toBeNull();
});
it('requests device-bound recovery on iPhone instead of changing the everyday auth flow',async()=>{
 device.platform='ios';show();set('Email','person@example.com');fireEvent.click(screen.getByText('Send reset link'));
 await screen.findByText(/If an account uses that email/);expect(device.request).toHaveBeenCalledExactlyOnceWith('person@example.com');
 expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
});
it('verifies the code on iPhone and changes the password only through its isolated recovery session',async()=>{
 device.platform='ios';device.confirm.mockResolvedValue({data:{session:{user:{id:'device-owner'}}},error:null});
 recovery.receiveLink(deviceLink);show();fireEvent.click(screen.getByText('Continue to reset'));
 await screen.findByLabelText('New password');
 set('New password','test-strong-password');set('Confirm new password','test-strong-password');fireEvent.click(screen.getByText('Save new password'));
 await screen.findByText('Password updated');expect(device.auth.getUser).toHaveBeenCalled();
 expect(device.auth.updateUser).toHaveBeenCalledExactlyOnceWith({password:'test-strong-password'});
 expect(auth.updateUser).not.toHaveBeenCalled();expect(device.auth.signOut).toHaveBeenCalledWith({scope:'local'});
});
it('shows the wrong-device explanation without unlocking a password form',async()=>{
 device.platform='ios';device.confirm.mockResolvedValue({data:null,error:{name:'CineGeekRecoveryError',message:'Open the newest email on the iPhone where you requested it.'}});
 recovery.receiveLink(deviceLink);show();fireEvent.click(screen.getByText('Continue to reset'));
 await screen.findByText(/iPhone where you requested/);expect(screen.queryByLabelText('New password')).toBeNull();
});
it('marks a device exchange as cancelled when a newer link arrives',async()=>{
 device.platform='ios';let resolve:any,current:any;
 device.confirm.mockImplementation((code,nonce,check)=>{current=check;return new Promise(r=>{resolve=r;});});
 recovery.receiveLink(deviceLink);const pending=recovery.confirmLink();
 recovery.receiveLink(deviceLink.replace('a'.repeat(32),'b'.repeat(32)));expect(current()).toBe(false);
 resolve({data:{session:{user:{id:'old-owner'}}},error:null});await pending;
 expect(recovery.snapshot()).toMatchObject({owner:null,pending:true});
});
it('does not submit a password from an older form after a newer email is opened',async()=>{
 auth.listener('PASSWORD_RECOVERY',{user:{id:'owner'}});show();
 let resolve:any;auth.getUser.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 set('New password','test-strong-password');set('Confirm new password','test-strong-password');
 fireEvent.click(screen.getByText('Save new password'));
 await act(async()=>{recovery.receiveLink(freshLink);resolve({data:{user:{id:'owner'}},error:null});});
 expect(auth.updateUser).not.toHaveBeenCalled();expect(screen.getByText('Continue to reset')).toBeTruthy();
});
