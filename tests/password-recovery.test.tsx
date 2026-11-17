// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const auth=vi.hoisted(()=>({listener:null as any,getUser:vi.fn(),updateUser:vi.fn(),signOut:vi.fn(),resetPasswordForEmail:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{...auth,onAuthStateChange:(listener:any)=>{auth.listener=listener;return {data:{subscription:{unsubscribe:vi.fn()}}};}}}}));
import ResetPassword from '../src/pages/ResetPassword';
import {recovery} from '../src/lib/password-recovery';
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
