// @vitest-environment jsdom
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
import {ProAccessContext} from '../src/hooks/use-pro-access';
import {planFixture} from './pro-access-fixture';
import {readProAccess,canWear,type Plan} from '../src/lib/pro-access';
import {YourPlan} from '../src/components/YourPlan';
import {GeekWardrobe} from '../src/components/GeekWardrobe';
import {GeekViewer} from '../src/hooks/use-geek-outfit';
import {FocusRoom} from '../src/components/FocusRoom';
import {HomeLists} from '../src/components/HomeLists';
import {listMetadata} from '../src/lib/list-metadata';
import {homeListKey} from '../src/lib/home-list-storage';
vi.mock('../src/lib/list-metadata',()=>({listMetadata:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:vi.fn()}}));
afterEach(()=>{cleanup();localStorage.clear();vi.clearAllMocks();});
it.each(['free','monthly','annual'] as Plan[])('%s shows accurate entitlements and keeps purchases disabled',plan=>{
 const a=planFixture(plan);
 render(<ProAccessContext.Provider value={a}><YourPlan allowance={{mode:'monthly',plan,included:plan==='free'?0:15,limit:plan==='free'?0:15,purchased:2,renewsAt:plan==='free'?null:'2026-12-13T00:00:00Z'}}/></ProAccessContext.Provider>);
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
 view.rerender(scene(a));expect((screen.getByRole('radio',{name:'Jedi Geek'}) as HTMLInputElement).checked).toBe(true);
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
