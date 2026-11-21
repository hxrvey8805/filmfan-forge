import {it,expect,vi} from 'vitest';
import {gameCatalogueCast} from '../supabase/functions/_shared/game-catalogue';
it.each(['empty','offline','malformed'])('picker and verifier use the same TV fallback when aggregate credits are %s',async failure=>{
 const read=vi.fn(async(path:string)=>{if(path.endsWith('aggregate_credits')){if(failure==='offline')throw Error('Offline');return failure==='empty'?{cast:[]}:{cast:null};}return{cast:[{id:20,name:'Lead',order:0},{id:30,name:'Guest',order:12}]};});
 const cast=await gameCatalogueCast('tv',123,read);
 expect(cast.map(p=>p.id)).toEqual([20,30]);expect(read).toHaveBeenCalledWith('tv/123/credits');
});
it('never converts a catalogue failure into a missing acting credit',async()=>{
 await expect(gameCatalogueCast('movie',1,async()=>{throw Error('Offline');})).rejects.toThrow('Catalogue unavailable');
});
