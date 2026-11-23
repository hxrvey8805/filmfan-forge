import {webcrypto, createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {expect,it,vi} from 'vitest';
import {createDevicePasswordRecovery} from '../src/lib/device-password-recovery';
import {parseRecoveryLink,deviceRecoveryAppURL} from '../src/lib/recovery-link';

// Exercise the installed Supabase SDK against a local simulated auth server.
// No email, provider account or live credential is used by this suite.
function setup() {
 const values=new Map<string,string>([['everyday-app-session','untouched']]);
 const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
 const codes=new Map<string,{challenge:string;used:boolean}>();
 let challenge='',redirect='',sequence=0,now=1000,offline=false;
 const user={id:'test-owner',aud:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-11-23T00:00:00Z'};
 const fetch=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input)), body=JSON.parse(String(init?.body??'{}'));
  if(offline)return new Response(JSON.stringify({msg:'Temporary outage'}),{status:503});
  if(url.pathname==='/auth/v1/recover'){
   expect(body.code_challenge_method).toBe('s256');expect(body.code_challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
   challenge=body.code_challenge;redirect=url.searchParams.get('redirect_to')!;
   return new Response('{}',{status:200});
  }
  if(url.pathname==='/auth/v1/token'){
   const record=codes.get(body.auth_code);
   if(!record || record.used || createHash('sha256').update(body.code_verifier).digest('base64url')!==record.challenge)
    return new Response(JSON.stringify({code:'bad_code_verifier',msg:'Invalid code or verifier'}),{status:400});
   record.used=true;
   const token='eyJhbGciOiJub25lIn0.'+Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.test';
   return new Response(JSON.stringify({access_token:token,refresh_token:'test-refresh',expires_in:3600,token_type:'bearer',user}),{status:200});
  }
  if(url.pathname==='/auth/v1/user')return new Response(JSON.stringify(user),{status:200});
  if(url.pathname==='/auth/v1/logout')return new Response(null,{status:204});
  throw Error('Unexpected test auth endpoint: '+url.pathname);
 });
 const client=createClient('https://recovery-test.invalid','test-public-key',{global:{fetch},
  auth:{storage,storageKey:'test-recovery',persistSession:true,autoRefreshToken:false,detectSessionInUrl:false,flowType:'pkce'}});
 const fresh=()=>createDevicePasswordRecovery(client.auth,storage,webcrypto as unknown as Crypto,()=>now);
 const openEmail=()=>{
  const code=('code-'+String(++sequence).padStart(32,'0'));codes.set(code,{challenge,used:false});
  const url=new URL(redirect);url.searchParams.set('code',code);
  const link=parseRecoveryLink(url.href);if(link.kind!=='device')throw Error('Bad callback');return link;
 };
 return {flow:fresh(),fresh,openEmail,fetch,storage,values,client,advance:()=>{now+=3600001;},offline:(v:boolean)=>{offline=v;}};
}

it('uses S256 with the existing reset email and verifies on the requesting phone after a cold start',async()=>{
 const t=setup();expect((await t.flow.request('person@example.com')).error).toBeNull();
 const link=t.openEmail(),url=deviceRecoveryAppURL(link);
 expect(url).not.toMatch(/access_token|refresh_token|token_hash|email|verifier/);
 expect(parseRecoveryLink(url)).toEqual(link);
 const result=await t.fresh().confirm(link.code,link.state,()=>true);
 expect(result.error).toBeNull();expect(result.data?.session?.user.id).toBe('test-owner');
 expect(t.fetch.mock.calls.some(([url])=>String(url).endsWith('/user'))).toBe(true);
 expect(t.values.get('everyday-app-session')).toBe('untouched');
});
it('rejects a different phone without sending the intercepted code to the provider',async()=>{
 const original=setup();await original.flow.request('person@example.com');const link=original.openEmail();
 const other=setup();const result=await other.flow.confirm(link.code,link.state,()=>true);
 expect(result.error?.message).toContain('iPhone where you requested');expect(other.fetch).not.toHaveBeenCalled();
});
it('rejects a callback whose local request marker was changed',async()=>{
 const t=setup();await t.flow.request('person@example.com');const link=t.openEmail();t.fetch.mockClear();
 expect((await t.flow.confirm(link.code,'f'.repeat(32),()=>true)).error).toBeTruthy();expect(t.fetch).not.toHaveBeenCalled();
});
it('rejects an expired local request before calling auth',async()=>{
 const t=setup();await t.flow.request('person@example.com');const link=t.openEmail();t.advance();t.fetch.mockClear();
 expect((await t.flow.confirm(link.code,link.state,()=>true)).error).toBeTruthy();expect(t.fetch).not.toHaveBeenCalled();
});
it('rejects an earlier email after another reset was requested',async()=>{
 const t=setup();await t.flow.request('person@example.com');const old=t.openEmail();
 await t.flow.request('person@example.com');const current=t.openEmail();t.fetch.mockClear();
 expect((await t.flow.confirm(old.code,old.state,()=>true)).error).toBeTruthy();expect(t.fetch).not.toHaveBeenCalled();
 expect((await t.flow.confirm(current.code,current.state,()=>true)).error).toBeNull();
});
it('cannot redeem a different request’s code even with the right local state',async()=>{
 const t=setup();await t.flow.request('person@example.com');const old=t.openEmail();
 await t.flow.request('person@example.com');const current=t.openEmail();
 expect((await t.flow.confirm(old.code,current.state,()=>true)).error).toBeTruthy();
 expect((await t.client.auth.getSession()).data.session).toBeNull();
});
it('does not reuse a code or restore a normal stored session as recovery authority',async()=>{
 const t=setup();await t.flow.request('person@example.com');const link=t.openEmail();
 expect((await t.flow.confirm(link.code,link.state,()=>true)).error).toBeNull();t.fetch.mockClear();
 expect((await t.fresh().confirm(link.code,link.state,()=>true)).error).toBeTruthy();expect(t.fetch).not.toHaveBeenCalled();
});
it('discards a verified response if the viewer left recovery during the request',async()=>{
 const t=setup();await t.flow.request('person@example.com');const link=t.openEmail();
 expect((await t.flow.confirm(link.code,link.state,()=>false)).error).toBeTruthy();
 expect((await t.client.auth.getSession()).data.session).toBeNull();
});
it('returns provider failures without granting a recovery session',async()=>{
 const t=setup();await t.flow.request('person@example.com');const link=t.openEmail();
 expect((await t.flow.confirm('unissued-code-0000000000000000000',link.state,()=>true)).error).toBeTruthy();
 expect((await t.client.auth.getSession()).data.session).toBeNull();
});
it('refuses insecure PKCE instead of falling back to a plain challenge',async()=>{
 const t=setup();const flow=createDevicePasswordRecovery(t.client.auth,t.storage,{} as Crypto);
 expect((await flow.request('person@example.com')).error?.message).toContain('Secure recovery');expect(t.fetch).not.toHaveBeenCalled();
});
