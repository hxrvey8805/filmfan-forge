export const recoveryOrigin = 'https://cinegeek.lovable.app';
export const recoveryPath = '/reset-password';

export type RecoveryLink = { kind: 'request' } | { kind: 'token'; token: string } |
  { kind: 'invalid' } | { kind: 'unrelated' };

// Only the verified HTTPS domain and exact recovery route can enter this flow.
// Fragments keep one-time hashes out of HTTP requests and referrer headers.
export function parseRecoveryLink(raw: string): RecoveryLink {
  let url: URL;
  try { url = new URL(raw); } catch { return { kind: 'unrelated' }; }
  if (url.origin !== recoveryOrigin || url.username || url.password ||
      url.pathname !== recoveryPath) return { kind: 'unrelated' };
  if (!url.hash && !url.search) return { kind: 'request' };
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (url.search || fragment.getAll('type').length !== 1 || fragment.get('type') !== 'recovery' ||
      fragment.getAll('token_hash').length !== 1 ||
      [...fragment.keys()].some(key => key !== 'type' && key !== 'token_hash')) return { kind: 'invalid' };
  const token = fragment.get('token_hash')!;
  return /^[a-f0-9]{40,128}$/i.test(token) ? { kind: 'token', token } : { kind: 'invalid' };
}
