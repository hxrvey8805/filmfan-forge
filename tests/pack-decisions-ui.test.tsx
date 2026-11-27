// @vitest-environment jsdom
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {it,expect,vi,afterEach,beforeEach} from 'vitest';
import PackOpeningModal from '../src/components/PackOpeningModal';
import {supabase} from '@/integrations/supabase/client';
import {savePackChoice} from '../src/lib/pack-decision';
const fixtures=vi.hoisted(()=>({cards:[] as any[]}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{
 auth:{getUser:vi.fn(async()=>({data:{user:{id:'owner'}}}))},
 from:()=>({select:()=>({eq:async()=>({data:fixtures.cards,error:null})})}),
 rpc:vi.fn(async()=>({data:{decision:'kept'},error:null})),
 functions:{invoke:vi.fn(async()=>({data:{person:{id:99,name:'New Actor',profile_path:null},packType:'actor'},error:null}))}
}}));
beforeEach(()=>{vi.mocked(supabase.rpc).mockImplementation(async (_name,args:any)=>({data:{decision:args.p_keep?'kept':'skipped',replacementXp:args.p_expected_cost},error:null}) as never);});
afterEach(()=>{cleanup();fixtures.cards=[];vi.clearAllMocks();localStorage.clear();});
async function reveal(){await waitFor(()=>expect((screen.getByRole('button',{name:'Reveal card'}) as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByRole('button',{name:'Reveal card'}));await screen.findByText('New Actor');}
it('does not auto-accept a reveal; keep is explicit and uses one atomic decision',async()=>{
 const close=vi.fn();render(<PackOpeningModal isOpen packId="pack-a" onClose={close}/>);
 expect(screen.queryByText('New Actor')).toBeNull();await reveal();expect(supabase.rpc).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Keep card'}));
 await waitFor(()=>expect(close).toHaveBeenCalledOnce());
 expect(supabase.rpc).toHaveBeenCalledWith('decide_cinegeek_pack_v2',{p_pack:'pack-a',p_keep:true,p_replace:null,p_expected_cost:0});
});
it('at six cards, accepts only after choosing a replacement; does not sell or refund',async()=>{
 fixtures.cards=Array.from({length:6},(_,i)=>({id:`card-${i}`,person_id:i+1,person_type:'actor',person_name:`Actor ${i}`}));
 render(<PackOpeningModal isOpen packId="pack-b" onClose={()=>{}}/>);
 await reveal();const keep=screen.getByRole('button',{name:'Replace · 450 XP'}) as HTMLButtonElement;
 expect(keep.disabled).toBe(true);fireEvent.click(screen.getByRole('radio',{name:'Actor 2'}));expect(keep.disabled).toBe(false);fireEvent.click(keep);
 await waitFor(()=>expect(supabase.rpc).toHaveBeenCalledWith('decide_cinegeek_pack_v2',{p_pack:'pack-b',p_keep:true,p_replace:'card-2',p_expected_cost:450}));
 expect(vi.mocked(supabase.functions.invoke).mock.calls.map(c=>c[0])).toEqual(['open-pack']);
});
it('closing leaves the reveal pending; a duplicate can only be skipped',async()=>{
 fixtures.cards=[{id:'owned',person_id:99,person_type:'actor',person_name:'New Actor'}];
 const close=vi.fn();const view=render(<PackOpeningModal isOpen packId="pack-c" onClose={close}/>);
 await reveal();expect((screen.getByRole('button',{name:'Keep card'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Close'}));expect(supabase.rpc).not.toHaveBeenCalled();
 view.unmount();render(<PackOpeningModal isOpen packId="pack-c" onClose={()=>{}}/>);await reveal();
 fireEvent.click(screen.getByRole('button',{name:'Skip card'}));await waitFor(()=>expect(supabase.rpc).toHaveBeenCalledWith('decide_cinegeek_pack_v2',{p_pack:'pack-c',p_keep:false,p_replace:null,p_expected_cost:0}));
});

it('allows a sixth card without asking for a replacement',async()=>{
 fixtures.cards=Array.from({length:5},(_,i)=>({id:`card-${i}`,person_id:i+1,person_type:'actor',person_name:`Actor ${i}`}));
 render(<PackOpeningModal isOpen packId="sixth" onClose={()=>{}}/>);await reveal();
 expect(screen.queryByRole('radio')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Keep card'}));
 await waitFor(()=>expect(supabase.rpc).toHaveBeenCalledWith('decide_cinegeek_pack_v2',{p_pack:'sixth',p_keep:true,p_replace:null,p_expected_cost:0}));
});
it('an uncertain network response retries the same decision without allowing another choice',async()=>{
 vi.mocked(supabase.rpc).mockRejectedValueOnce(new Error('Connection lost'));
 const close=vi.fn();render(<PackOpeningModal isOpen packId="retry" onClose={close}/>);await reveal();
 fireEvent.click(screen.getByRole('button',{name:'Skip card'}));await screen.findByRole('alert');
 expect(close).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:'Keep card'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Retry skip decision'}));
 await waitFor(()=>expect(close).toHaveBeenCalledOnce());
 expect(vi.mocked(supabase.rpc).mock.calls.map(c=>c[1])).toEqual(Array(2).fill({p_pack:'retry',p_keep:false,p_replace:null,p_expected_cost:0}));
});

it('also retains the original decision when Supabase returns a transport error object',async()=>{
 vi.mocked(supabase.rpc).mockResolvedValueOnce({data:null,error:{message:'Failed to fetch',code:'',details:'',hint:''}} as never);
 render(<PackOpeningModal isOpen packId="returned-error" onClose={()=>{}}/>);await reveal();
 fireEvent.click(screen.getByRole('button',{name:'Keep card'}));await screen.findByRole('alert');
 expect(screen.queryByRole('button',{name:'Skip card'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Retry keep decision'}));
 await waitFor(()=>expect(supabase.rpc).toHaveBeenCalledTimes(2));
 expect(vi.mocked(supabase.rpc).mock.calls.map(c=>c[1])).toEqual(Array(2).fill({p_pack:'returned-error',p_keep:true,p_replace:null,p_expected_cost:0}));
});

it('discloses the 450 XP cost and permanent replacement before confirmation',async()=>{
 fixtures.cards=Array.from({length:6},(_,i)=>({id:`card-${i}`,person_id:i+1,person_type:'actor',person_name:`Actor ${i}`}));
 render(<PackOpeningModal isOpen packId="cost" onClose={()=>{}}/>);await reveal();
 expect(screen.getByText('450 XP to replace. The selected card leaves permanently.')).toBeTruthy();
 expect(supabase.rpc).not.toHaveBeenCalled();
});
it('reopens an uncertain paid decision without drawing again or changing its cost',async()=>{
 savePackChoice('owner','reopen',{keep:true,replace:'card-2',cost:450});
 const close=vi.fn();render(<PackOpeningModal isOpen packId="reopen" onClose={close}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Retry keep decision'}));
 await waitFor(()=>expect(close).toHaveBeenCalledOnce());
 expect(supabase.functions.invoke).not.toHaveBeenCalled();
 expect(supabase.rpc).toHaveBeenCalledWith('decide_cinegeek_pack_v2',{p_pack:'reopen',p_keep:true,p_replace:'card-2',p_expected_cost:450});
});
it('keeps an unconfirmed receipt pending instead of assuming that a charge succeeded',async()=>{
 vi.mocked(supabase.rpc).mockResolvedValueOnce({data:{decision:'kept'},error:null} as never);
 const close=vi.fn();render(<PackOpeningModal isOpen packId="bad-receipt" onClose={close}/>);await reveal();
 fireEvent.click(screen.getByRole('button',{name:'Keep card'}));await screen.findByRole('alert');
 expect(close).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Retry keep decision'}));
 await waitFor(()=>expect(close).toHaveBeenCalledOnce());
});
it('insufficient XP lets the user skip or save the same reveal without claiming success',async()=>{
 fixtures.cards=Array.from({length:6},(_,i)=>({id:`card-${i}`,person_id:i+1,person_type:'actor',person_name:`Actor ${i}`}));
 vi.mocked(supabase.rpc).mockResolvedValueOnce({data:null,error:{code:'P0001',message:'You need 450 XP to replace a card.'}} as never);
 const close=vi.fn();render(<PackOpeningModal isOpen packId="poor" onClose={close}/>);await reveal();
 fireEvent.click(screen.getByRole('radio',{name:'Actor 2'}));fireEvent.click(screen.getByRole('button',{name:'Replace · 450 XP'}));
 await screen.findByRole('alert');expect(close).not.toHaveBeenCalled();expect(screen.getByText('New Actor')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Skip card'}));await waitFor(()=>expect(close).toHaveBeenCalledOnce());
 expect(supabase.rpc).toHaveBeenLastCalledWith('decide_cinegeek_pack_v2',{p_pack:'poor',p_keep:false,p_replace:null,p_expected_cost:0});
});
