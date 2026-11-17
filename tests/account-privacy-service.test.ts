import {expect,it,vi} from 'vitest';
import {deleteAccountHandler,recentPasswordAuthentication} from '../supabase/functions/_shared/delete-account';
import {aiPermission} from '../supabase/functions/_shared/ai-privacy';
const request=(body:unknown={confirmation:'DELETE'},token='valid')=>new Request('https://test/delete-account',{method:'POST',headers:token?{Authorization:`Bearer ${token}`}:{},body:JSON.stringify(body)});
it('deletes only the freshly authenticated owner and never a client-supplied account',async()=>{
 const authenticate=vi.fn().mockResolvedValue({id:'owner',recentlyAuthenticated:true}),remove=vi.fn().mockResolvedValue(true);
 const handler=deleteAccountHandler({authenticate,remove});
 expect((await handler(request({confirmation:'DELETE',userId:'victim'}))).status).toBe(400);
 expect(remove).not.toHaveBeenCalled();
 expect(await (await handler(request())).json()).toEqual({deleted:true});expect(remove).toHaveBeenCalledExactlyOnceWith('owner');
});
it('rejects missing, invalid and old authentication before any destructive operation',async()=>{
 const authenticate=vi.fn().mockResolvedValue(null),remove=vi.fn();const handler=deleteAccountHandler({authenticate,remove});
 expect((await handler(request(undefined,''))).status).toBe(401);expect(authenticate).not.toHaveBeenCalled();
 expect((await handler(request())).status).toBe(401);
 authenticate.mockResolvedValue({id:'owner',recentlyAuthenticated:false});expect((await handler(request())).status).toBe(403);
 expect(remove).not.toHaveBeenCalled();
});
it('fails closed on an unavailable cleanup backend and bounds request data',async()=>{
 const remove=vi.fn().mockRejectedValue(Error('PRIVATE')),handler=deleteAccountHandler({authenticate:async()=>({id:'owner',recentlyAuthenticated:true}),remove});
 expect((await handler(request({confirmation:'x'.repeat(1000)}))).status).toBe(413);expect(remove).not.toHaveBeenCalled();
 const response=await handler(request());expect(response.status).toBe(503);expect(await response.text()).not.toContain('PRIVATE');
});
it('accepts only a recent password authentication claim on the already verified token',()=>{
 const now=1000000,base={sub:'owner',exp:2000,amr:[{method:'password',timestamp:999}]};
 const token=(claims:unknown)=>`a.${btoa(JSON.stringify(claims))}.c`;
 expect(recentPasswordAuthentication(token(base),'owner',now)).toBe(true);
 for(const bad of [{...base,sub:'victim'},{...base,exp:999},{...base,amr:[{method:'password',timestamp:699}]},{...base,amr:[{method:'recovery',timestamp:999}]},{...base,amr:[{method:'password',timestamp:2000}]}])expect(recentPasswordAuthentication(token(bad),'owner',now)).toBe(false);
});
it('permission checks fail closed on unknown data, errors, or withdrawal',async()=>{
 const rpc=vi.fn().mockResolvedValue({data:false,error:null});expect(await aiPermission(rpc,'owner','companion')).toBe(false);
 expect(rpc).toHaveBeenCalledWith('cinegeek_ai_allowed',{p_user:'owner',p_feature:'companion',p_version:'2026-11-17'});
 for(const result of [{data:null,error:null},{data:'true',error:null},{data:true,error:'failure'}]){rpc.mockResolvedValue(result);await expect(aiPermission(rpc,'owner','companion')).rejects.toThrow();}
});
