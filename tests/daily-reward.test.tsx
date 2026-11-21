// @vitest-environment jsdom
import {act,render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {DailyReward,readDailyPrize,rewardAngle} from '../src/components/DailyReward';
import {PlayHome} from '../src/components/PlayHome';
import {ProAccessContext} from '../src/hooks/use-pro-access';
import {planFixture} from './pro-access-fixture';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc}}));
beforeEach(()=>{rpc.mockReset();vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true})));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('Play has no standalone daily reward panel',()=>{
 render(<ProAccessContext.Provider value={planFixture('annual')}><PlayHome onOpen={()=>{}}/></ProAccessContext.Provider>);
 expect(screen.queryByText(/Daily reward/i)).toBeNull();expect(screen.queryByRole('dialog')).toBeNull();
});
it.each(['monthly','annual'] as const)('%s gets one post-win spinner; duplicate taps cannot request two prizes',async plan=>{
 let resolve!:(value:unknown)=>void;rpc.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 render(<ProAccessContext.Provider value={planFixture(plan)}><DailyReward/></ProAccessContext.Provider>);
 expect(screen.getByRole('dialog')).toBeTruthy();
 const button=screen.getByRole('button',{name:'Spin my reward'});fireEvent.click(button);fireEvent.click(button);
 expect(rpc).toHaveBeenCalledTimes(1);expect(screen.queryByRole('button',{name:'Close daily spin'})).toBeNull();
 await act(async()=>resolve({data:{kind:'pack',packType:'actor'},error:null}));
 expect(screen.getByRole('heading',{name:'Actor pack unlocked'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Nice. Keep playing'}));expect(screen.queryByRole('dialog')).toBeNull();
 expect(screen.queryByRole('button',{name:'Your daily spin is ready'})).toBeNull();
});
it('Free and already-spun Pro users never get the spinner',()=>{
 const view=render(<ProAccessContext.Provider value={{...planFixture('free'),spinAvailable:true}}><DailyReward/></ProAccessContext.Provider>);
 expect(screen.queryByRole('dialog')).toBeNull();
 view.rerender(<ProAccessContext.Provider value={{...planFixture('monthly'),spinAvailable:false}}><DailyReward/></ProAccessContext.Provider>);
 expect(screen.queryByRole('dialog')).toBeNull();expect(rpc).not.toHaveBeenCalled();
});
it('a failed request does not display a prize; retry retrieves the server result',async()=>{
 rpc.mockResolvedValueOnce({data:null,error:{message:'Offline'}}).mockResolvedValue({data:{kind:'xp',xp:25},error:null});
 render(<ProAccessContext.Provider value={planFixture('monthly')}><DailyReward/></ProAccessContext.Provider>);
 fireEvent.click(screen.getByRole('button',{name:'Spin my reward'}));
 await screen.findByRole('alert');expect(screen.queryByText('+25 XP')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Retry daily spin'}));
 await screen.findByRole('heading',{name:'+25 XP'});expect(rpc.mock.calls.map(c=>c[0])).toEqual(['spin_cinegeek_reward','spin_cinegeek_reward']);
});
it('a delayed eligibility refresh opens the earned reward once',async()=>{
 const a={...planFixture('monthly'),spinAvailable:false};
 const view=render(<ProAccessContext.Provider value={a}><DailyReward/></ProAccessContext.Provider>);expect(screen.queryByRole('dialog')).toBeNull();
 view.rerender(<ProAccessContext.Provider value={{...a,spinAvailable:true}}><DailyReward/></ProAccessContext.Provider>);
 await screen.findByRole('dialog');fireEvent.click(screen.getByRole('button',{name:'Close daily spin'}));
 view.rerender(<ProAccessContext.Provider value={{...a,spinAvailable:true}}><DailyReward/></ProAccessContext.Provider>);
 expect(screen.queryByRole('dialog')).toBeNull();expect(screen.getByRole('button',{name:'Your daily spin is ready'})).toBeTruthy();
});
it('wheel positions correspond to server rewards and reject malformed awards',()=>{
 expect(rewardAngle({kind:'xp',xp:25})).toBeLessThan(180);
 expect(rewardAngle({kind:'pack',packType:'actor'})).toBe(198);
 expect(rewardAngle({kind:'pack',packType:'director'})).toBe(270);
 expect(rewardAngle({kind:'badge',badge:'film_buff'})).toBe(342);
 for(const bad of [null,{kind:'cash'},{kind:'xp',xp:250},{kind:'pack',packType:'bogus'}])expect(readDailyPrize(bad)).toBeNull();
});
