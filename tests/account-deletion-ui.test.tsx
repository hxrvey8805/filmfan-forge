// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({viewer:{id:'owner',email:'owner@example.com'},signIn:vi.fn(),signOut:vi.fn(),invoke:vi.fn(),forget:vi.fn(),erase:vi.fn(),clear:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{signInWithPassword:mock.signIn,signOut:mock.signOut},functions:{invoke:mock.invoke}}}));
vi.mock('@/hooks/use-viewer-session',()=>({useViewerSession:()=>mock.viewer}));
vi.mock('@/components/AIPrivacy',()=>({useAIPrivacy:()=>({choices:{},ready:true,ensure:vi.fn(),withdraw:vi.fn()})}));
vi.mock('@/lib/watch-focus',()=>({iosWatchFocus:{forgetViewer:mock.forget}}));
vi.mock('@/lib/erase-local-account',()=>({eraseLocalAccount:mock.erase}));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>({clear:mock.clear})}));
import AccountPrivacy from '../src/pages/AccountPrivacy';
beforeEach(()=>{vi.resetAllMocks();mock.signIn.mockResolvedValue({data:{user:mock.viewer},error:null});mock.invoke.mockResolvedValue({data:{deleted:true},error:null});mock.forget.mockResolvedValue(undefined);mock.signOut.mockResolvedValue({error:null});});
afterEach(cleanup);
function show(){return render(<MemoryRouter initialEntries={['/account']}><Routes><Route path="/account" element={<AccountPrivacy/>}/><Route path="/auth" element={<p>Signed out</p>}/></Routes></MemoryRouter>);}
function confirm(){fireEvent.click(screen.getByText('Delete my account…'));fireEvent.change(screen.getByLabelText('Confirm with your CineGeek password'),{target:{value:'fixture-only'}});fireEvent.click(screen.getByText('Permanently delete account'));}
it('requires a separate confirmation and password; Keep leaves all data alone',()=>{
 show();expect(screen.getByText(/Deleting CineGeek does not cancel/)).toBeTruthy();fireEvent.click(screen.getByText('Delete my account…'));
 fireEvent.click(screen.getByText('Keep my account'));expect(mock.signIn).not.toHaveBeenCalled();expect(mock.invoke).not.toHaveBeenCalled();
});
it('wrong passwords or a changed account never reach deletion',async()=>{
 show();mock.signIn.mockResolvedValueOnce({error:{code:'invalid_credentials'}});confirm();await screen.findByRole('alert');expect(mock.invoke).not.toHaveBeenCalled();
 mock.signIn.mockResolvedValueOnce({data:{user:{id:'other'}}});fireEvent.change(screen.getByLabelText('Confirm with your CineGeek password'),{target:{value:'fixture'}});fireEvent.click(screen.getByText('Permanently delete account'));
 await screen.findByText(/Account changed/);expect(mock.forget).not.toHaveBeenCalled();expect(mock.invoke).not.toHaveBeenCalled();
});
it('releases native Focus, deletes the signed-in account, erases its local data and signs out',async()=>{
 show();confirm();await screen.findByText('Signed out');expect(mock.forget).toHaveBeenCalledWith({viewer:'owner'});
 expect(mock.invoke).toHaveBeenCalledExactlyOnceWith('delete-account',{body:{confirmation:'DELETE'}});expect(mock.erase).toHaveBeenCalledWith('owner');expect(mock.signOut).toHaveBeenCalledWith({scope:'local'});expect(mock.clear).toHaveBeenCalledTimes(1);
 expect(mock.forget.mock.invocationCallOrder[0]).toBeLessThan(mock.invoke.mock.invocationCallOrder[0]);
 expect(mock.invoke.mock.invocationCallOrder[0]).toBeLessThan(mock.erase.mock.invocationCallOrder[0]);
});
it('retains local records and login when server deletion fails',async()=>{
 mock.invoke.mockResolvedValue({data:null,error:{}});show();confirm();await screen.findByRole('alert');expect(mock.erase).not.toHaveBeenCalled();expect(mock.signOut).not.toHaveBeenCalled();
});
it('a cleanup retry never repeats password authentication or deletion',async()=>{
 mock.erase.mockImplementationOnce(()=>{throw Error('storage blocked');});show();confirm();await screen.findByText('Finish cleanup');
 fireEvent.click(screen.getByText('Finish cleanup'));await screen.findByText('Signed out');expect(mock.signIn).toHaveBeenCalledTimes(1);expect(mock.invoke).toHaveBeenCalledTimes(1);expect(mock.erase).toHaveBeenCalledTimes(2);
});
