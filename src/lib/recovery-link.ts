export const recoveryOrigin = 'https://cinegeek.lovable.app';
export const recoveryPath = '/reset-password';
export const recoveryScheme = 'app.cinegeek.mobile:';
const statePattern = /^[a-f0-9]{32}$/;
const codePattern = /^[a-zA-Z0-9_-]{20,512}$/;

export type RecoveryLink = { kind: 'request' } | { kind: 'token'; token: string } |
  { kind: 'device'; code: string; state: string } |
  { kind: 'invalid' } | { kind: 'unrelated' };

// The browser must never exchange an iPhone-bound code or import a session
// attached to an app callback. Only the requesting app has the PKCE verifier.
export function isDeviceRecoveryPage(raw: string): boolean {
  try { const url = new URL(raw); return url.pathname === recoveryPath && url.searchParams.has('app'); }
  catch { return false; }
}

export function deviceRecoveryReturnURL(state: string): string {
  if (!statePattern.test(state)) throw Error('Invalid recovery request');
  return `${recoveryOrigin}${recoveryPath}?app=1&state=${state}`;
}

export function deviceRecoveryAppURL(link: Extract<RecoveryLink, {kind: 'device'}>): string {
  if (!statePattern.test(link.state) || !codePattern.test(link.code)) throw Error('Invalid recovery response');
  return `${recoveryScheme}//reset-password?app=1&state=${link.state}&code=${link.code}`;
}

// Only the verified HTTPS domain and exact recovery route can enter this flow.
// Fragments keep one-time hashes out of HTTP requests and referrer headers.
export function parseRecoveryLink(raw: string): RecoveryLink {
  let url: URL;
  try { url = new URL(raw); } catch { return { kind: 'unrelated' }; }
  const appLink = url.protocol === recoveryScheme && url.hostname === 'reset-password' &&
    !url.port && !url.pathname;
  const httpsLink = url.origin === recoveryOrigin && url.pathname === recoveryPath;
  if ((!httpsLink && !appLink) || url.username || url.password) return { kind: 'unrelated' };
  if (appLink || url.searchParams.has('app')) {
    const params = url.searchParams;
    if (url.hash || params.get('app') !== '1' ||
        ['app', 'state', 'code'].some(key => params.getAll(key).length !== 1) ||
        [...params.keys()].some(key => !['app', 'state', 'code'].includes(key)) ||
        !statePattern.test(params.get('state') ?? '') || !codePattern.test(params.get('code') ?? '')) return {kind:'invalid'};
    return {kind:'device', state:params.get('state')!, code:params.get('code')!};
  }
  if (!url.hash && !url.search) return { kind: 'request' };
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (url.search || fragment.getAll('type').length !== 1 || fragment.get('type') !== 'recovery' ||
      fragment.getAll('token_hash').length !== 1 ||
      [...fragment.keys()].some(key => key !== 'type' && key !== 'token_hash')) return { kind: 'invalid' };
  const token = fragment.get('token_hash')!;
  return /^[a-f0-9]{40,128}$/i.test(token) ? { kind: 'token', token } : { kind: 'invalid' };
}
