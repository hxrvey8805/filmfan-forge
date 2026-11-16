import {it,expect,vi} from 'vitest';
import {productionPurchaseRelay} from '../supabase/functions/_shared/apple-production-relay';
const config={enabled:true,supabaseUrl:'https://pginaazhujdtcjonxjrh.supabase.co',nodeUrl:'https://cinegeek-apple-production.onrender.com/'};
const request=(body='{"signedTransactionInfo":"fixture-signed"}',headers:Record<string,string>={})=>new Request('https://pginaazhujdtcjonxjrh.supabase.co/functions/v1/apple-purchases',{
  method:'POST',headers:{Origin:'capacitor://localhost',Authorization:'Bearer fixture','Content-Type':'application/json',...headers},body});
it('stays off without explicit configuration and never forwards',async()=>{
  const send=vi.fn();const relay=productionPurchaseRelay({...config,enabled:false},send);
  expect((await relay(request())).status).toBe(503);expect(send).not.toHaveBeenCalled();
});
it.each(['http://cinegeek-apple-production.onrender.com/','https://cinegeek-apple-sandbox.onrender.com/',
  'https://cinegeek-apple-production.onrender.com@attacker.invalid/','https://cinegeek-apple-production.onrender.com/?token=test'])('rejects unexpected billing destination %s',nodeUrl=>{
  expect(()=>productionPurchaseRelay({...config,nodeUrl})).toThrow();
});
it('pins the live project',()=>{expect(()=>productionPurchaseRelay({...config,supabaseUrl:'https://lpvyfqnxkhqmyviiqjim.supabase.co'})).toThrow();});
it('forwards only the receipt and session to a fixed path with redirects disabled',async()=>{
  const send=vi.fn(async()=>Response.json({acknowledged:true}));const relay=productionPurchaseRelay(config,send);
  const response=await relay(request());expect(response.status).toBe(200);
  expect(String(send.mock.calls[0][0])).toBe('https://cinegeek-apple-production.onrender.com/apple-purchases/purchase');
  expect(send.mock.calls[0][1]).toMatchObject({redirect:'error',method:'POST'});
  expect(response.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
});
it.each([{Authorization:''},{Origin:'https://other.invalid'}])('rejects missing session or unapproved origin before forwarding',async headers=>{
  const send=vi.fn();const relay=productionPurchaseRelay(config,send);
  expect((await relay(request(undefined,headers))).status).toBe(headers.Authorization===''?401:403);expect(send).not.toHaveBeenCalled();
});
it('bounds a streamed request before forwarding',async()=>{
  const send=vi.fn();expect((await productionPurchaseRelay(config,send)(request('a'.repeat(31000)))).status).toBe(413);expect(send).not.toHaveBeenCalled();
});
it('hides upstream internals on failure',async()=>{
  const send=vi.fn(async()=>new Response('private stack',{status:503}));const r=await productionPurchaseRelay(config,send)(request());
  expect(await r.json()).toEqual({error:'purchase_verification_pending'});
});
