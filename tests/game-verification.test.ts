import {it,expect,vi} from 'vitest';
import {gamePath,verifyGamePath} from '../supabase/functions/_shared/game-verification';
const path=[{type:'actor' as const,id:1},{type:'movie' as const,id:3},{type:'actor' as const,id:2}];
it('verifies both ends of each connection using cast, not client-supplied names',async()=>{
 const cast=vi.fn().mockResolvedValue([1,2]);expect(gamePath(path,1,2)).toEqual(path);expect(await verifyGamePath(path,cast)).toBe(true);expect(cast).toHaveBeenCalledWith('movie',3);
 cast.mockResolvedValue([1,4]);expect(await verifyGamePath(path,cast)).toBe(false);
});
it('rejects loops, wrong endpoints, malformed steps and client claims',()=>{
 for(const p of [[],[...path,{type:'actor',id:2}],path.map(s=>({...s,verified:true})),[{type:'actor',id:1},{type:'tv',id:4},{type:'actor',id:1}],path.map(s=>({...s,id:-1}))])expect(gamePath(p,1,2)).toBeNull();
 expect(gamePath(path,1,999)).toBeNull();
});
it('checks every TV/movie bridge; a service error remains retryable',async()=>{
 const mixed=[...path,{type:'tv' as const,id:5},{type:'actor' as const,id:6}];
 expect(await verifyGamePath(mixed,async(t)=>t==='tv'?[2,6]:[1,2])).toBe(true);
 await expect(verifyGamePath(mixed,async()=>{throw new Error('Catalogue unavailable');})).rejects.toThrow('Catalogue unavailable');
});
