import {expect,it} from 'vitest';
import {parseRecoveryLink} from '../src/lib/recovery-link';
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
