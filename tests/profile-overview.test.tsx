// @vitest-environment jsdom
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {ProfileHome} from '../src/components/MobileDestinations';
import {ProAccessContext} from '../src/hooks/use-pro-access';
import {planFixture} from './pro-access-fixture';
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:vi.fn()}}));
beforeEach(()=>{vi.spyOn(window,'scrollTo').mockImplementation(()=>{});});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it.each(['free','monthly','annual'] as const)('%s profile keeps details behind working rows',plan=>{
 render(<MemoryRouter initialEntries={['/dashboard?tab=profile']}><ProAccessContext.Provider value={planFixture(plan)}><ProfileHome email="viewer@example.com" onLogout={()=>{}} onInstall={()=>{}} allowance={{mode:'monthly',plan,included:plan==='free'?0:15,purchased:0,limit:plan==='free'?0:15,renewsAt:null}}/></ProAccessContext.Provider></MemoryRouter>);
 expect(screen.getByRole('heading',{name:'Profile'})).toBeTruthy();
 expect(screen.queryByRole('heading',{name:'Your Plan'})).toBeNull();expect(screen.queryByRole('radio')).toBeNull();
 expect(screen.getByRole('link',{name:'Account & privacy'}).getAttribute('href')).toBe('/account');
 fireEvent.click(screen.getByRole('link',{name:/Your Plan/}));expect(screen.getByRole('heading',{name:'Your Plan'})).toBeTruthy();
 expect(screen.getAllByRole('button',{name:'Purchases coming soon'}).every(b=>(b as HTMLButtonElement).disabled)).toBe(true);
 fireEvent.click(screen.getByRole('link',{name:'Profile'}));fireEvent.click(screen.getAllByRole('link',{name:/Dress your Geek/})[0]);
 expect(screen.getAllByRole('radio').length).toBe(plan==='annual'?21:1);
});
