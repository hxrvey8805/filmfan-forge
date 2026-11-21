// @vitest-environment jsdom
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {ProAccessContext} from '../src/hooks/use-pro-access';
import {planFixture} from './pro-access-fixture';
import {readProAccess,canWear,type Plan} from '../src/lib/pro-access';
import {YourPlan} from '../src/components/YourPlan';
import {GeekWardrobe} from '../src/components/GeekWardrobe';
import {GeekViewer,outfits} from '../src/hooks/use-geek-outfit';
import {FocusRoom} from '../src/components/FocusRoom';
import {HomeLists} from '../src/components/HomeLists';
import {listMetadata} from '../src/lib/list-metadata';
import {homeListKey} from '../src/lib/home-list-storage';
vi.mock('../src/lib/list-metadata',()=>({listMetadata:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:vi.fn()}}));
afterEach(()=>{cleanup();localStorage.clear();vi.clearAllMocks();});
it.each(['free','monthly','annual'] as Plan[])('%s shows accurate entitlements and keeps purchases disabled',plan=>{
 const a=planFixture(plan);
 render(<MemoryRouter><ProAccessContext.Provider value={a}><YourPlan allowance={{mode:'monthly',plan,included:plan==='free'?0:15,limit:plan==='free'?0:15,purchased:2,renewsAt:plan==='free'?null:'2026-12-13T00:00:00Z'}}/></ProAccessContext.Provider></MemoryRouter>);
 expect(screen.getByRole('heading',{name:'Your Plan'})).toBeTruthy();expect(screen.getByText(/2 purchased/)).toBeTruthy();
 expect(screen.getAllByRole('button',{name:'Purchases coming soon'}).every(b=>(b as HTMLButtonElement).disabled)).toBe(true);
 expect(screen.getByText('2,000 XP')).toBeTruthy();expect(screen.getByText('Level 4')).toBeTruthy();
 expect(screen.getByText(/£79.99/)).toBeTruthy();expect(screen.getByText(/£6.67/)).toBeTruthy();
});
it('Free retains the animated Focus room but cannot wear a saved paid skin',()=>{
 localStorage.setItem('cinegeek.geek.v1.viewer-a','jedi');
 const view=render(<ProAccessContext.Provider value={planFixture('free')}><GeekViewer.Provider value="viewer-a"><FocusRoom title="Movie" episodeLabel="Movie" active validPosition/></GeekViewer.Provider></ProAccessContext.Provider>);
 const avatar=view.container.querySelector('.geek-avatar');expect(avatar?.getAttribute('data-outfit')).toBe('classic');expect(avatar?.hasAttribute('data-still')).toBe(false);
 expect(localStorage.getItem('cinegeek.geek.v1.viewer-a')).toBe('jedi');
});
it('Monthly can wear owned skins; expiry restores Arcade without deleting the saved preference',()=>{
 const a={...planFixture('monthly'),unlockedSkins:['jedi']};localStorage.setItem('cinegeek.geek.v1.viewer-a','jedi');
 const scene=(plan:typeof a|ReturnType<typeof planFixture>)=><ProAccessContext.Provider value={plan}><GeekViewer.Provider value="viewer-a"><GeekWardrobe/></GeekViewer.Provider></ProAccessContext.Provider>;
 const view=render(scene(a));expect((screen.getByRole('radio',{name:'Jedi Geek'}) as HTMLInputElement).checked).toBe(true);
 view.rerender(scene(planFixture('free')));expect((screen.getByRole('radio',{name:'Arcade'}) as HTMLInputElement).checked).toBe(true);
 expect(screen.getAllByRole('radio')).toHaveLength(1);expect(screen.queryByRole('radio',{name:'Jedi Geek'})).toBeNull();
 expect(localStorage.getItem('cinegeek.geek.v1.viewer-a')).toBe('jedi');
 view.rerender(scene(a));expect((screen.getByRole('radio',{name:'Jedi Geek'}) as HTMLInputElement).checked).toBe(true);
});
it.each([false,true])('Free and unconfirmed access show only Arcade in the wardrobe (compact=%s)',compact=>{
 localStorage.setItem('cinegeek.geek.v1.viewer-a','jedi');
 const scene=(access:ReturnType<typeof planFixture>|null)=><ProAccessContext.Provider value={access}><GeekViewer.Provider value="viewer-a"><GeekWardrobe compact={compact}/></GeekViewer.Provider></ProAccessContext.Provider>;
 const view=render(scene({...planFixture('free'),unlockedSkins:['jedi']}));
 if(compact)fireEvent.click(screen.getByRole('button',{name:'Outfit'}));
 for(const access of [null,planFixture('free')]){
  view.rerender(scene(access));
  expect(screen.getAllByRole('radio')).toHaveLength(1);
  expect((screen.getByRole('radio',{name:'Arcade'}) as HTMLInputElement).checked).toBe(true);
  expect([...view.container.querySelectorAll('.geek-avatar')].every(el=>el.getAttribute('data-outfit')==='classic')).toBe(true);
  expect(screen.queryByText('Pro skin')).toBeNull();
 }
});
it.each([false,true])('Monthly shows only owned skins in each picker (compact=%s)',compact=>{
 const a={...planFixture('monthly'),unlockedSkins:['jedi','unknown-skin']};
 const view=render(<ProAccessContext.Provider value={a}><GeekViewer.Provider value="viewer-a"><GeekWardrobe compact={compact}/></GeekViewer.Provider></ProAccessContext.Provider>);
 if(compact)fireEvent.click(screen.getByRole('button',{name:'Outfit'}));
 expect(screen.getAllByRole('radio')).toHaveLength(2);
 expect(screen.getByRole('radio',{name:'Arcade'})).toBeTruthy();expect(screen.getByRole('radio',{name:'Jedi Geek'})).toBeTruthy();
 expect(screen.queryByRole('radio',{name:'Spider-Geek'})).toBeNull();expect(screen.queryByText(/1,500 XP/)).toBeNull();
 fireEvent.click(screen.getByRole('radio',{name:'Jedi Geek'}));expect((screen.getByRole('radio',{name:'Jedi Geek'}) as HTMLInputElement).checked).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Unlock with XP'}));
 expect(screen.getByRole('dialog')).toBeTruthy();expect(screen.getByRole('button',{name:'Unlock Spider-Geek for 1,500 XP'})).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Unlock Jedi Geek for 1,500 XP'})).toBeNull();
});
it('a newly granted skin appears only after confirmed access refresh',()=>{
 const a=planFixture('monthly');
 const scene=(access:typeof a)=><ProAccessContext.Provider value={access}><GeekViewer.Provider value="viewer-a"><GeekWardrobe/></GeekViewer.Provider></ProAccessContext.Provider>;
 const view=render(scene(a));expect(screen.getAllByRole('radio')).toHaveLength(1);
 view.rerender(scene({...a,unlockedSkins:['spider']}));expect(screen.getAllByRole('radio')).toHaveLength(2);
 fireEvent.click(screen.getByRole('radio',{name:'Spider-Geek'}));expect((screen.getByRole('radio',{name:'Spider-Geek'}) as HTMLInputElement).checked).toBe(true);
});
it('Annual retains all wearable skins without an XP shop',()=>{
 const scene=(compact:boolean)=><ProAccessContext.Provider value={planFixture('annual')}><GeekViewer.Provider value="viewer-a"><GeekWardrobe compact={compact}/></GeekViewer.Provider></ProAccessContext.Provider>;
 const view=render(scene(false));expect(screen.getAllByRole('radio')).toHaveLength(Object.keys(outfits).length);
 expect(screen.queryByRole('button',{name:'Unlock with XP'})).toBeNull();
 view.rerender(scene(true));fireEvent.click(screen.getByRole('button',{name:'Outfit'}));
 expect(screen.getAllByRole('radio')).toHaveLength(Object.keys(outfits).length);
});
it('Free cannot run saved Smart Lists or activate Smart mode from a matching name',async()=>{
 localStorage.setItem(homeListKey('viewer-a'),JSON.stringify([{id:'smart',name:'Horror',mode:'smart',rule:{kind:'genre',value:'Horror'}}]));
 render(<ProAccessContext.Provider value={planFixture('free')}><HomeLists viewer="viewer-a" shelves={[]} onOpen={()=>{}}/></ProAccessContext.Provider>);
 fireEvent.click(screen.getByRole('button',{name:'Horror'}));expect(listMetadata).not.toHaveBeenCalled();expect(screen.getByText(/Smart Lists are included in Pro/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'New list'}));fireEvent.change(screen.getByLabelText('List name'),{target:{value:'Comedy movies'}});
 expect(screen.getByRole('button',{name:'Pick titles'}).getAttribute('aria-pressed')).toBe('true');
 fireEvent.click(screen.getByRole('button',{name:'Smart match · Pro'}));expect(screen.queryByText('Let Geek sort for you')).toBeNull();
});
it('rejects inconsistent access and permits only the default while unavailable',()=>{
 expect(readProAccess(planFixture('annual'))?.plan).toBe('annual');expect(readProAccess({...planFixture('free'),allSkins:true})).toBeNull();
 expect(readProAccess({...planFixture('monthly'),purchasesEnabled:true})).toBeNull();expect(canWear(null,'classic')).toBe(true);expect(canWear(null,'jedi')).toBe(false);
});
