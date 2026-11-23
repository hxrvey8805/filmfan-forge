import {expect,it} from 'vitest';
import {parseRecoveryLink,deviceRecoveryAppURL,isDeviceRecoveryPage} from '../src/lib/recovery-link';
const base='https://cinegeek.lovable.app/reset-password';
const fragment='#token_hash='+ 'a'.repeat(56)+'&type=recovery';
it('accepts only the direct recovery hash and leaves plain reset links as requests',()=>{
 expect(parseRecoveryLink(base+fragment)).toEqual({kind:'token',token:'a'.repeat(56)});
 expect(parseRecoveryLink(base)).toEqual({kind:'request'});
});
it.each(['http://cinegeek.lovable.app/reset-password','https://cinegeek.lovable.app.attacker.test/reset-password',
 'https://attacker.test/reset-password','https://user@cinegeek.lovable.app/reset-password',
 'cinegeek://reset-password','https://cinegeek.lovable.app/dashboard','not a URL'])
('rejects unrelated URL %s',url=>expect(parseRecoveryLink(url+fragment).kind).toBe('unrelated'));
it.each(['#type=recovery','#token_hash=wrong&type=recovery',fragment+'&type=signup',
 fragment+'&token_hash='+ 'b'.repeat(56),fragment+'&access_token=untrusted',
 fragment.replace('type=recovery','type=signup'),'?token_hash='+ 'a'.repeat(56)+'&type=recovery'])
('rejects malformed or wrong-purpose recovery data %s',suffix=>expect(parseRecoveryLink(base+suffix).kind).toBe('invalid'));
const deviceQuery='?app=1&state='+ 'a'.repeat(32)+'&code='+ 'c'.repeat(36);
it('accepts device-bound codes on the exact HTTPS route and registered app callback',()=>{
 const parsed=parseRecoveryLink(base+deviceQuery);expect(parsed.kind).toBe('device');
 if(parsed.kind==='device')expect(parseRecoveryLink(deviceRecoveryAppURL(parsed))).toEqual(parsed);
});
it.each([deviceQuery+'&code=duplicate',deviceQuery+'&state=duplicate',deviceQuery+'&next=https://attacker.test',
 deviceQuery+'#access_token=secret',deviceQuery+'&token_hash='+ 'a'.repeat(56),deviceQuery.replace('app=1','app=2'),
 deviceQuery.replace('a'.repeat(32),'bad'),deviceQuery.replace('c'.repeat(36),'bad'),fragment])
('rejects unsafe app callback %s',suffix=>expect(parseRecoveryLink('app.cinegeek.mobile://reset-password'+suffix).kind).toBe('invalid'));
it.each(['app.cinegeek.mobile://elsewhere','app.cinegeek.mobile://reset-password/extra',
 'app.cinegeek.mobile://user@reset-password','app.cinegeek.mobile://reset-password:123'])
('ignores unrelated app callback %s',prefix=>expect(parseRecoveryLink(prefix+deviceQuery).kind).toBe('unrelated'));
it('keeps browser auth from consuming either a valid app response or an injected implicit session',()=>{
 expect(isDeviceRecoveryPage(base+deviceQuery)).toBe(true);
 expect(isDeviceRecoveryPage(base+deviceQuery+'#access_token=bad&type=recovery')).toBe(true);
 expect(isDeviceRecoveryPage(base+fragment)).toBe(false);
});
