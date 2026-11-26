// @vitest-environment jsdom
import {it,expect,vi,afterEach} from 'vitest';
import {redeemXp} from '../src/lib/xp-redemption';
import {supabase} from '@/integrations/supabase/client';
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:vi.fn()}}));
afterEach(()=>{vi.clearAllMocks();localStorage.clear();});
it('reuses a pending request across an uncertain response, then clears it on success',async()=>{
 vi.mocked(supabase.rpc).mockResolvedValueOnce({data:null,error:{message:'Network error'}} as any).mockResolvedValueOnce({data:{packId:'saved'},error:null} as any);
 await expect(redeemXp('retry-user','pack:actor')).rejects.toThrow();
 const first=vi.mocked(supabase.rpc).mock.calls[0][1];expect(localStorage.getItem('cinegeek.xp.pending.retry-user.pack:actor')).toBe(first?.p_request);
 await redeemXp('retry-user','pack:actor');expect(vi.mocked(supabase.rpc).mock.calls[1][1]).toEqual(first);expect(localStorage.getItem('cinegeek.xp.pending.retry-user.pack:actor')).toBeNull();
});

it('retains the identity when the request throws before a response',async()=>{
 vi.mocked(supabase.rpc).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({data:{skin:'spider'},error:null} as never);
 await expect(redeemXp('thrown-user','skin:random')).rejects.toThrow('offline');
 await redeemXp('thrown-user','skin:random');
 expect(vi.mocked(supabase.rpc).mock.calls[1][1]).toEqual(vi.mocked(supabase.rpc).mock.calls[0][1]);
});
it('clears a definitively rejected database transaction, not an uncertain transport result',async()=>{
 vi.mocked(supabase.rpc).mockResolvedValueOnce({data:null,error:{message:'Every skin unlocked',code:'P0001'}} as never);
 await expect(redeemXp('rejected-user','skin:random')).rejects.toThrow();
 expect(localStorage.getItem('cinegeek.xp.pending.rejected-user.skin:random')).toBeNull();
});
