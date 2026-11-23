import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {deviceRecoveryReturnURL} from './recovery-link';

const requestKey = 'cinegeek-device-recovery-request-v1';
const authKey = 'cinegeek-device-recovery-auth-v1';
const requestLifetime = 60 * 60 * 1000;
type Auth = Pick<SupabaseClient['auth'], 'resetPasswordForEmail' | 'exchangeCodeForSession' | 'getUser' | 'signOut' | 'updateUser'>;
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const failure = (message:string) => ({data:null, error:{name:'CineGeekRecoveryError', message}});

// Separate storage prevents a recovery attempt from replacing an everyday app
// session, signup verifier, or Apple sign-in. No account data or email is stored.
export function createDevicePasswordRecovery(auth:Auth, storage:Store, crypto:Crypto, now=Date.now) {
  let busy = false;
  const read = () => {
    try {
      const value = JSON.parse(storage.getItem(requestKey) ?? 'null');
      return value && /^[a-f0-9]{32}$/.test(value.state) && Number.isFinite(value.createdAt) &&
        now() >= value.createdAt && now()-value.createdAt < requestLifetime ? value : null;
    } catch { return null; }
  };
  const clear = (state:string) => { if (read()?.state === state) storage.removeItem(requestKey); };
  return {
    auth,
    async request(email:string) {
      if (busy) return failure('Please wait for the current reset request.');
      // Supabase can otherwise fall back to plain PKCE in an insecure context.
      if (!crypto?.subtle || !crypto.getRandomValues) return failure('Secure recovery is unavailable. Close and reopen CineGeek.');
      busy = true;
      let state = '';
      try {
        await auth.signOut({scope:'local'});
        state = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte=>byte.toString(16).padStart(2,'0')).join('');
        storage.setItem(requestKey, JSON.stringify({state, createdAt:now()}));
        // Fail before sending if persistent storage cannot retain the request.
        if (read()?.state !== state) return failure('CineGeek couldn’t save this reset request. Please reopen the app.');
        const result = await auth.resetPasswordForEmail(email, {redirectTo:deviceRecoveryReturnURL(state)});
        if (result.error) clear(state);
        return result;
      } catch {
        clear(state);
        return failure('Couldn’t send the reset email. Check your connection and try again.');
      } finally { busy = false; }
    },
    async confirm(code:string, state:string, current:()=>boolean) {
      if (busy) return failure('Please wait for the current reset request.');
      if (read()?.state !== state) return failure('Open the newest email on the iPhone where you requested it, or request a new link in this app.');
      busy = true;
      try {
        const result = await auth.exchangeCodeForSession(code);
        if (result.error || !result.data.session?.user.id) return result;
        const checked = await auth.getUser();
        if (!current() || checked.error || checked.data.user?.id !== result.data.session.user.id) {
          await auth.signOut({scope:'local'});
          return failure('This reset could not be verified. Request a new link in CineGeek.');
        }
        clear(state);
        return result;
      } finally { busy = false; }
    },
  };
}

let device:ReturnType<typeof createDevicePasswordRecovery> | undefined;
export function devicePasswordRecovery() {
  if (!device) {
    const client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
      auth:{flowType:'pkce', storage:localStorage, storageKey:authKey, persistSession:true,
        autoRefreshToken:false, detectSessionInUrl:false},
    });
    device = createDevicePasswordRecovery(client.auth, localStorage, globalThis.crypto);
  }
  return device;
}
