// @vitest-environment jsdom
import {act,render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import DailyPuzzle from '../src/pages/DailyPuzzle';
import {ProAccessContext} from '../src/hooks/use-pro-access';
import {planFixture} from './pro-access-fixture';
const api=vi.hoisted(()=>({rpc:vi.fn(),invoke:vi.fn(),result:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:api.rpc,functions:{invoke:api.invoke}}}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
const actor=(id:number,name:string)=>({id,name,profilePath:'',order:id,character:'',episodeCount:0});
const cast=[actor(1,'Start Actor'),actor(2,'Bridge Actor'),actor(3,'Target Actor')];
beforeEach(()=>{
 Object.defineProperty(Element.prototype,'scrollIntoView',{configurable:true,value:vi.fn()});
 api.rpc.mockReset();api.invoke.mockReset();api.result.mockReset();
 api.rpc.mockImplementation(async(name)=>name==='start_cinegeek_game'?{data:{status:'playing',expires_at:new Date(Date.now()+120000).toISOString()},error:null}:{data:null,error:null});
 api.invoke.mockImplementation(async(name,{body})=>{
  if(name==='game-result')return api.result(body);
  if(body.action==='getRandomActors')return {data:{actors:[cast[0],cast[2]]},error:null};
  if(body.action==='getActorFilmography')return {data:{credits:[{id:10,type:'movie',title:'Shared Film',posterPath:'',character:'Character'}]},error:null};
  return {data:{cast,castVersion:2},error:null};
 });
});
afterEach(()=>{cleanup();vi.restoreAllMocks();localStorage.clear();});
async function connect(){
 render(<ProAccessContext.Provider value={planFixture('monthly')}><DailyPuzzle/></ProAccessContext.Provider>);
 const start=await screen.findByRole('button',{name:/Start game/});await waitFor(()=>expect((start as HTMLButtonElement).disabled).toBe(false));fireEvent.click(start);
 fireEvent.click(await screen.findByRole('button',{name:'Shared Film'}));fireEvent.click(await screen.findByRole('button',{name:'Bridge Actor'}));
 fireEvent.click(await screen.findByRole('button',{name:'Shared Film'}));fireEvent.click(await screen.findByRole('button',{name:/Target Actor Target/}));
}
it('a genuine repeated-film route submits intact and opens the reward only after server acceptance',async()=>{
 api.result.mockResolvedValue({data:{won:true,xp:75},error:null});await connect();
 await screen.findByText('Connection complete!');expect(api.result.mock.calls[0][0].path.map((s:{id:number})=>s.id)).toEqual([1,10,2,10,3]);
 expect(screen.getByRole('dialog')).toBeTruthy();expect(api.result).toHaveBeenCalledTimes(1);
});
it('a rejected result is final, without an endless retry or reward',async()=>{
 api.result.mockResolvedValue({data:{won:false,xp:0},error:null});await connect();
 await screen.findByText('Connection not confirmed');expect(screen.queryByRole('button',{name:'Retry verification'})).toBeNull();expect(screen.queryByRole('dialog')).toBeNull();
});
it('a service outage can retry the identical proof without showing an unearned reward',async()=>{
 api.result.mockResolvedValueOnce({data:null,error:{message:'offline'}}).mockResolvedValue({data:{won:true,xp:75},error:null});await connect();
 await screen.findByText('Couldn’t finish checking');expect(screen.queryByRole('dialog')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Retry verification'}));await screen.findByText('Connection complete!');
 expect(api.result.mock.calls[1][0]).toEqual(api.result.mock.calls[0][0]);
});
