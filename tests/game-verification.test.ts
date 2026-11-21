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

const ruthToKyle=[{type:'actor',id:58430},{type:'movie',id:823766},{type:'actor',id:1373737},{type:'movie',id:1003596},{type:'actor',id:1253360},{type:'movie',id:1003596},{type:'actor',id:1083010},{type:'movie',id:284054},{type:'actor',id:135651},{type:'movie',id:615121},{type:'actor',id:1371297},{type:'tv',id:83867},{type:'actor',id:1390505}] as const;
it('accepts the saved Ruth Bradley → Kyle Soller route, including a repeated film',async()=>{
 const proof=gamePath(ruthToKyle,58430,1390505);expect(proof).not.toBeNull();
 const credits=new Map<string,number[]>();
 for(let i=1;i<ruthToKyle.length;i+=2){const key=`${ruthToKyle[i].type}:${ruthToKyle[i].id}`;credits.set(key,[...(credits.get(key)??[]),ruthToKyle[i-1].id,ruthToKyle[i+1].id]);}
 const cast=vi.fn(async(type:string,id:number)=>credits.get(`${type}:${id}`)!);
 expect(await verifyGamePath(proof!,cast)).toBe(true);
 expect(cast.mock.calls.filter(([,id])=>id===1003596)).toHaveLength(1);
 credits.set('movie:284054',[135651]);expect(await verifyGamePath(proof!,cast)).toBe(false);
});
it('loads independent titles concurrently so catalogue latency does not multiply by route length',async()=>{
 const calls:string[]=[];let release!:(ids:number[])=>void;
 const waiting=new Promise<number[]>(resolve=>{release=resolve;});
 const verification=verifyGamePath([...path,{type:'tv',id:8},{type:'actor',id:9}],async(type)=>{calls.push(type);return waiting;});
 expect(calls).toEqual(['movie','tv']);release([1,2,9]);expect(await verification).toBe(true);
});
