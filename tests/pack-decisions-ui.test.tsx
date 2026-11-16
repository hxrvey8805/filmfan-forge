// @vitest-environment jsdom
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
import PackOpeningModal from '../src/components/PackOpeningModal';
import {supabase} from '@/integrations/supabase/client';
const fixtures=vi.hoisted(()=>({cards:[] as any[]}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{
 auth:{getUser:vi.fn(async()=>({data:{user:{id:'owner'}}}))},
 from:()=>({select:()=>({eq:async()=>({data:fixtures.cards,error:null})})}),
 rpc:vi.fn(async()=>({data:{decision:'kept'},error:null})),
 functions:{invoke:vi.fn(async()=>({data:{person:{id:99,name:'New Actor',profile_path:null},packType:'actor'},error:null}))}
}}));
afterEach(()=>{cleanup();fixtures.cards=[];vi.clearAllMocks();});
it('does not auto-accept a reveal; keep is explicit and uses one atomic decision',async()=>{
 const close=vi.fn();render(<PackOpeningModal isOpen packId="pack-a" onClose={close}/>);
 await screen.findByText('New Actor');expect(supabase.rpc).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Keep card'}));
 await waitFor(()=>expect(close).toHaveBeenCalledOnce());
 expect(supabase.rpc).toHaveBeenCalledWith('decide_cinegeek_pack',{p_pack:'pack-a',p_keep:true,p_replace:null});
});
it('at five cards, accepts only after choosing a replacement; does not sell or refund',async()=>{
 fixtures.cards=Array.from({length:5},(_,i)=>({id:`card-${i}`,person_id:i+1,person_type:'actor',person_name:`Actor ${i}`}));
 render(<PackOpeningModal isOpen packId="pack-b" onClose={()=>{}}/>);
 await screen.findByText('New Actor');const keep=screen.getByRole('button',{name:'Replace & keep'}) as HTMLButtonElement;
 expect(keep.disabled).toBe(true);fireEvent.click(screen.getByRole('radio',{name:'Actor 2'}));expect(keep.disabled).toBe(false);fireEvent.click(keep);
 await waitFor(()=>expect(supabase.rpc).toHaveBeenCalledWith('decide_cinegeek_pack',{p_pack:'pack-b',p_keep:true,p_replace:'card-2'}));
 expect(vi.mocked(supabase.functions.invoke).mock.calls.map(c=>c[0])).toEqual(['open-pack']);
});
it('closing leaves the reveal pending; a duplicate can only be skipped',async()=>{
 fixtures.cards=[{id:'owned',person_id:99,person_type:'actor',person_name:'New Actor'}];
 const close=vi.fn();const view=render(<PackOpeningModal isOpen packId="pack-c" onClose={close}/>);
 await screen.findByText('New Actor');expect((screen.getByRole('button',{name:'Keep card'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Close'}));expect(supabase.rpc).not.toHaveBeenCalled();
 view.unmount();render(<PackOpeningModal isOpen packId="pack-c" onClose={()=>{}}/>);await screen.findByText('New Actor');
 fireEvent.click(screen.getByRole('button',{name:'Skip card'}));await waitFor(()=>expect(supabase.rpc).toHaveBeenCalledWith('decide_cinegeek_pack',{p_pack:'pack-c',p_keep:false,p_replace:null}));
});
