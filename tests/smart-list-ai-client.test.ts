import { afterEach, expect, it, vi } from 'vitest';
const {getSession,invoke}=vi.hoisted(()=>({getSession:vi.fn(),invoke:vi.fn()}));
vi.mock('../src/integrations/supabase/client',()=>({supabase:{auth:{getSession},functions:{invoke}}}));
import { interpretListWithAI } from '../src/lib/list-ai';
afterEach(()=>vi.resetAllMocks());
it('sends only the description under the current account',async()=>{
  getSession.mockResolvedValue({data:{session:{user:{id:'owner'}}}});
  invoke.mockResolvedValue({data:{interpretation:{kind:'clarify',reason:'vague'}},error:null});
  const signal=new AbortController().signal;
  expect(await interpretListWithAI('Friday options','owner',signal)).toEqual({kind:'clarify',reason:'vague'});
  expect(invoke).toHaveBeenCalledWith('interpret-smart-list',{body:{request:'Friday options'},signal});
});
it('does not call under another viewer or signed-out session',async()=>{
  for(const session of [null,{user:{id:'other'}}]) {
    getSession.mockResolvedValue({data:{session}});
    await expect(interpretListWithAI('Friday options','owner',new AbortController().signal)).rejects.toThrow('Sign in');
  }
  expect(invoke).not.toHaveBeenCalled();
});
it('turns provider errors into safe helpful copy without surfacing their body',async()=>{
  getSession.mockResolvedValue({data:{session:{user:{id:'owner'}}}});
  invoke.mockResolvedValue({error:{context:Response.json({error:'provider_busy',details:'PRIVATE'})}});
  await expect(interpretListWithAI('Friday options','owner',new AbortController().signal)).rejects.toThrow('The free AI is busy');
  expect(invoke).toHaveBeenCalledTimes(1);
});
it('rejects invalid output and cancellations',async()=>{
  getSession.mockResolvedValue({data:{session:{user:{id:'owner'}}}});
  invoke.mockResolvedValue({data:{interpretation:{kind:'suggestion',rule:{kind:'ranking'}}}});
  await expect(interpretListWithAI('Friday options','owner',new AbortController().signal)).rejects.toThrow('reliable rule');
  const stop=new AbortController();stop.abort();
  await expect(interpretListWithAI('Friday options','owner',stop.signal)).rejects.toMatchObject({name:'AbortError'});
  expect(invoke).toHaveBeenCalledTimes(1);
});
