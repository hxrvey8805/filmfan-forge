import { expect, it, vi } from 'vitest';
import { parseListInterpretation, listRequest, type ListInterpretation } from '../supabase/functions/_shared/list-interpretation';
import { interpretWithFreeModel, listInterpreterHandler, listProviderBody } from '../supabase/functions/_shared/list-interpreter-service';
import { matchesRule } from '../src/lib/home-lists';
const suggestion: ListInterpretation = {kind:'suggestion',rule:{kind:'all',scope:'movie',rules:[{kind:'genre',value:'Comedy',scope:'movie'},{kind:'runtime',minutes:90,inclusive:false,scope:'movie'}]}};
const answer = (content:unknown, extra={}) => Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(content)}}],usage:{cost:0},...extra});
it('accepts compound rules while actual catalogue facts still decide membership',()=>{
  const parsed=parseListInterpretation(suggestion); expect(parsed).toEqual(suggestion);
  if(parsed?.kind!=='suggestion') throw Error();
  const title={id:1,type:'movie' as const,title:'Fixture',posterPath:''};
  expect(matchesRule(title,{directors:[],genres:['Comedy'],minutes:[89]},parsed.rule)).toBe(true);
  expect(matchesRule(title,{directors:[],genres:['Comedy'],minutes:[92]},parsed.rule)).toBe(false);
  expect(matchesRule(title,undefined,parsed.rule)).toBeNull();
  expect(matchesRule({...title,type:'tv'},{directors:[],genres:['Comedy'],minutes:[30]},parsed.rule)).toBe(false);
});
it.each([
  {kind:'suggestion',rule:{kind:'genre',value:'Comedy',scope:'movie',entityId:'Q123'}},
  {kind:'suggestion',rule:{kind:'streaming',value:'Netflix',scope:'movie'}},
  {kind:'suggestion',rule:{kind:'runtime',minutes:-1,inclusive:false,scope:'movie'}},
  {kind:'suggestion',rule:{kind:'runtime',minutes:90,inclusive:false,scope:'tv'}},
  {kind:'suggestion',rule:{kind:'year',from:2000,to:1990,scope:'all'}},
  {kind:'suggestion',rule:{kind:'genre',value:'<script>alert()</script>',scope:'all'}},
  {kind:'suggestion',rule:{kind:'all',rules:[],scope:'all'}},
  {kind:'suggestion',rule:{kind:'not',scope:'movie',rule:{kind:'genre',value:'Comedy',scope:'tv'}}},
  {kind:'suggestion',rule:{kind:'all',scope:'movie',rules:[{kind:'genre',value:'Comedy',scope:'tv'},{kind:'genre',value:'Horror',scope:'movie'}]}},
  {kind:'suggestion',rule:suggestion.kind==='suggestion'?suggestion.rule:null,titles:[1,2]},
  {kind:'clarify',reason:'vague',explanation:'An unsolicited plot spoiler'},
])('rejects untrusted or unsupported output %#',value=>expect(parseListInterpretation(value)).toBeNull());
it('bounds request and rule tree size',()=>{
  expect(listRequest('  funny  short films  ')).toBe('funny short films');
  expect(listRequest('x'.repeat(161))).toBeNull();expect(listRequest(42)).toBeNull();
  let rule:any={kind:'genre',scope:'movie',value:'Comedy'};
  for(let i=0;i<6;i++) rule={kind:'all',scope:'movie',rules:[rule,{kind:'genre',scope:'movie',value:'Horror'}]};
  expect(parseListInterpretation({kind:'suggestion',rule})).toBeNull();
});
it('requests only the pinned free model with zero prices, no paid fallback and only the description',()=>{
  const body=listProviderBody('something funny and short');
  expect(body.model).toBe('baidu/ernie-5.5-flash-preview:free');expect(body).not.toHaveProperty('models');
  expect(body.provider.allow_fallbacks).toBe(false);
  expect(body.response_format.type).toBe('json_object');
  expect(body.provider.max_price).toEqual({prompt:0,completion:0,request:0});
  expect(body.plugins.every(plugin=>plugin.enabled===false)).toBe(true);
  expect(body.messages[1]).toEqual({role:'user',content:JSON.stringify({list_description:'something funny and short'})});
});
it('validates a complete provider reply and never retries a 429',async()=>{
  const transport=vi.fn().mockResolvedValueOnce(answer(suggestion)).mockResolvedValueOnce(new Response('private provider error',{status:429}));
  expect(await interpretWithFreeModel('funny short films','test',transport)).toEqual(suggestion);
  await expect(interpretWithFreeModel('funny short films','test',transport)).rejects.toMatchObject({code:'provider_busy'});
  expect(transport).toHaveBeenCalledTimes(2);
});
it('accepts an otherwise valid bare rule without relaxing field checks',async()=>{
  if(suggestion.kind!=='suggestion') throw Error();
  const transport=vi.fn().mockResolvedValueOnce(answer(suggestion.rule)).mockResolvedValueOnce(answer({...suggestion.rule,titles:[1,2]}));
  expect(await interpretWithFreeModel('funny short films','test',transport)).toEqual(suggestion);
  await expect(interpretWithFreeModel('funny short films','test',transport)).rejects.toMatchObject({code:'invalid_response'});
});
it.each([
  {choices:[{finish_reason:'length',message:{content:JSON.stringify(suggestion)}}]},
  {choices:[{finish_reason:'stop',message:{content:JSON.stringify(suggestion),tool_calls:[{}]}}]},
  {usage:{cost:0.01}}, {error:{message:'secret upstream text'}},
])('rejects incomplete, tool, charged or error responses %#',async extra=>{
  await expect(interpretWithFreeModel('funny short films','test',vi.fn().mockResolvedValue(answer(suggestion,extra)))).rejects.toMatchObject({code:'invalid_response'});
});
const request = (body:unknown={request:'something funny and short'}, auth=true) => new Request('https://app.test/interpreter',{method:'POST',headers:auth?{Authorization:'Bearer fixture'}:{},body:JSON.stringify(body)});
function service() {
  const deps={authenticate:vi.fn().mockResolvedValue('owner'),reserve:vi.fn().mockResolvedValue({status:'reserved'}),complete:vi.fn().mockResolvedValue(undefined),interpret:vi.fn().mockResolvedValue(suggestion)};
  return {deps,handle:listInterpreterHandler(deps)};
}
it('requires an authenticated user before touching cache, quotas or AI',async()=>{
  const {deps,handle}=service();
  expect((await handle(request(undefined,false))).status).toBe(401);
  deps.authenticate.mockResolvedValue(null);
  expect((await handle(request())).status).toBe(401);
  expect(deps.reserve).not.toHaveBeenCalled();expect(deps.interpret).not.toHaveBeenCalled();
});
it('ignores client identity and forbids unrelated payload data',async()=>{
  const {deps,handle}=service();
  expect((await handle(request({request:'funny',userId:'other',titles:[1]}))).status).toBe(400);
  expect((await handle(request({request:'x'.repeat(3000)}))).status).toBe(413);
  expect(deps.reserve).not.toHaveBeenCalled();
  expect((await handle(request())).status).toBe(200);
  expect(deps.reserve).toHaveBeenCalledWith('owner',expect.stringMatching(/^[0-9a-f]{64}$/),expect.any(String));
  expect(deps.complete).toHaveBeenCalledWith('owner',expect.any(String),suggestion);
});
it('reuses a validated cache and fails closed on quota or database errors',async()=>{
  const {deps,handle}=service();
  deps.reserve.mockResolvedValue({status:'cached',result:suggestion});
  expect((await handle(request())).status).toBe(200);expect(deps.interpret).not.toHaveBeenCalled();
  deps.reserve.mockResolvedValue({status:'limited'});expect((await handle(request())).status).toBe(429);
  deps.reserve.mockRejectedValue(Error('private db details')); const result=await handle(request());
  expect(result.status).toBe(503);expect(await result.text()).not.toContain('private');expect(deps.interpret).not.toHaveBeenCalled();
});
it('rejects contradictory AND conditions rather than offering an empty rule',()=>{
  const positive={kind:'genre',value:'Comedy',scope:'movie'};
  expect(parseListInterpretation({kind:'suggestion',rule:{kind:'all',scope:'movie',rules:[positive,{kind:'not',scope:'movie',rule:positive}]}})).toBeNull();
});
