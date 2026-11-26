// @vitest-environment jsdom
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {RandomSkinShop} from '../src/components/RandomSkinShop';
import Store from '../src/pages/Store';
import {ProAccessContext} from '../src/hooks/use-pro-access';
import {planFixture} from './pro-access-fixture';
import {supabase} from '@/integrations/supabase/client';
import {forgetPendingXp,hasPendingXp} from '../src/lib/xp-redemption';
import {unlockableSkins,RANDOM_SKIN_ITEM} from '../src/lib/random-skin';
import type {ProAccess} from '../src/lib/pro-access';
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:vi.fn()}}));
const account=()=>planFixture('monthly','random-skin-viewer');
const receipt={item:'skin:random',skin:'spider',packId:null,xpBalance:500};
function scene(access:ProAccess|null=account(),onBalance=vi.fn()){
 return <ProAccessContext.Provider value={access}><RandomSkinShop onBalance={onBalance}/></ProAccessContext.Provider>;
}
beforeEach(()=>{vi.mocked(supabase.rpc).mockResolvedValue({data:receipt,error:null} as never);});
afterEach(()=>{cleanup();vi.resetAllMocks();localStorage.clear();forgetPendingXp('random-skin-viewer');});
it.each(['free','annual','unconfirmed'])('does not offer an XP skin purchase for %s',plan=>{
 render(scene(plan==='unconfirmed'?null:planFixture(plan as 'free'|'annual')));
 expect(screen.queryByRole('button')).toBeNull();
});
it('requires confirmation, sends only skin:random and renders the confirmed reward',async()=>{
 const balance=vi.fn();render(scene(account(),balance));
 fireEvent.click(screen.getByRole('button',{name:'Unlock a random skin'}));
 expect(supabase.rpc).not.toHaveBeenCalled();
 expect(screen.queryByRole('button',{name:/Unlock Spider/})).toBeNull();
 const confirm=screen.getByRole('button',{name:'Unlock for 1,500 XP'});
 fireEvent.click(confirm);fireEvent.click(confirm);
 await screen.findByRole('heading',{name:'Spider-Geek unlocked'});
 expect(supabase.rpc).toHaveBeenCalledOnce();
 expect(supabase.rpc).toHaveBeenCalledWith('redeem_cinegeek_xp',{p_request:expect.any(String),p_item:'skin:random'});
 expect(balance).toHaveBeenCalledWith(500);
 expect(screen.getByText('Added to your wardrobe. Choose it whenever you like.')).toBeTruthy();
 expect(hasPendingXp(account().userId,RANDOM_SKIN_ITEM)).toBe(false);
 fireEvent.click(screen.getByRole('button',{name:'Done'}));
 expect(screen.queryByRole('dialog')).toBeNull();
});
it('does not charge when the confirmation is dismissed',()=>{
 render(scene());fireEvent.click(screen.getByRole('button',{name:'Unlock a random skin'}));
 fireEvent.click(screen.getByRole('button',{name:'Close'}));
 expect(supabase.rpc).not.toHaveBeenCalled();
});
it('disables the offer when funds are insufficient or every skin is owned',()=>{
 const view=render(scene({...account(),xp:1499}));
 expect((screen.getByRole('button',{name:'Unlock a random skin'}) as HTMLButtonElement).disabled).toBe(true);
 expect(screen.getByText('1 more XP needed')).toBeTruthy();
 view.rerender(scene({...account(),unlockedSkins:[...unlockableSkins]}));
 expect((screen.getByRole('button',{name:'All skins unlocked'}) as HTMLButtonElement).disabled).toBe(true);
 expect(supabase.rpc).not.toHaveBeenCalled();
});
it('can recover a lost last-skin response after remount even with no XP and all skins owned',async()=>{
 vi.mocked(supabase.rpc).mockResolvedValueOnce({data:null,error:{message:'Connection lost',code:''}} as never);
 const view=render(scene());fireEvent.click(screen.getByRole('button',{name:'Unlock a random skin'}));
 fireEvent.click(screen.getByRole('button',{name:'Unlock for 1,500 XP'}));await screen.findByRole('alert');
 const original=vi.mocked(supabase.rpc).mock.calls[0][1];
 view.unmount();
 render(scene({...account(),xp:0,unlockedSkins:[...unlockableSkins]}));
 fireEvent.click(screen.getByRole('button',{name:'Check pending unlock'}));
 fireEvent.click(screen.getByRole('button',{name:'Retry same unlock'}));
 await screen.findByRole('heading',{name:'Spider-Geek unlocked'});
 expect(vi.mocked(supabase.rpc).mock.calls[1][1]).toEqual(original);
});
it('keeps an incomplete response pending so a retry cannot buy another skin',async()=>{
 vi.mocked(supabase.rpc).mockResolvedValueOnce({data:{item:'skin:random'},error:null} as never);
 render(scene());fireEvent.click(screen.getByRole('button',{name:'Unlock a random skin'}));
 fireEvent.click(screen.getByRole('button',{name:'Unlock for 1,500 XP'}));await screen.findByRole('alert');
 expect(hasPendingXp(account().userId,RANDOM_SKIN_ITEM)).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Retry same unlock'}));await screen.findByRole('heading',{name:'Spider-Geek unlocked'});
 expect(vi.mocked(supabase.rpc).mock.calls[1][1]).toEqual(vi.mocked(supabase.rpc).mock.calls[0][1]);
});
it('discards an old account result from the screen after switching accounts',async()=>{
 let resolve!:(value:unknown)=>void;
 vi.mocked(supabase.rpc).mockImplementationOnce(()=>new Promise(r=>{resolve=r;}) as never);
 const balance=vi.fn(),view=render(scene(account(),balance));
 fireEvent.click(screen.getByRole('button',{name:'Unlock a random skin'}));
 fireEvent.click(screen.getByRole('button',{name:'Unlock for 1,500 XP'}));
 view.rerender(scene(planFixture('monthly','different-viewer'),balance));
 resolve({data:receipt,error:null});
 await waitFor(()=>expect(hasPendingXp(account().userId,RANDOM_SKIN_ITEM)).toBe(false));
 expect(screen.queryByRole('heading',{name:'Spider-Geek unlocked'})).toBeNull();
 expect(balance).not.toHaveBeenCalled();
});
it('offers random skins from the XP store without a specific-skin picker',()=>{
 render(<ProAccessContext.Provider value={account()}><Store/></ProAccessContext.Provider>);
 expect(screen.getByRole('heading',{name:'Random Geek skin'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'Unlock a random skin'})).toBeTruthy();
 expect(screen.queryByRole('button',{name:/Unlock Jedi/})).toBeNull();
});
