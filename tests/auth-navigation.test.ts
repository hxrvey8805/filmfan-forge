// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NavigationRoute } from 'workbox-routing/NavigationRoute';
import { authNavigationPattern } from '../src/lib/auth-navigation';

const state = vi.hoisted(() => ({ recoveryIntent: false, registerSW: vi.fn() }));
vi.mock('../src/lib/password-recovery', () => ({ recovery: {
  snapshot: () => ({ intent: state.recoveryIntent }),
} }));
import { registerAppWorker } from '../src/lib/register-app-worker';

beforeEach(() => {
  state.recoveryIntent = false;
  state.registerSW.mockClear();
  vi.stubEnv('MODE', 'production');
  window.history.replaceState(null, '', '/');
});
afterEach(() => vi.unstubAllEnvs());

const offlineShell = new NavigationRoute(async () => new Response('old app shell'), {
  denylist: [authNavigationPattern],
});
function handlesOfflineNavigation(path: string) {
  return offlineShell.match({
    url: new URL(path, 'https://cinegeek.lovable.app'),
    request: { mode: 'navigate' } as Request,
    event: {} as FetchEvent,
    sameOrigin: true,
  });
}

it.each(['/reset-password', '/reset-password/', '/reset-password?source=email',
  '/reset-password#error_code=otp_expired', '/auth', '/auth?mode=signup'])
('keeps %s out of Workbox’s old offline app shell', (path) => {
  expect(handlesOfflineNavigation(path)).toBe(false);
  window.history.replaceState(null, '', path);
  registerAppWorker(state.registerSW);
  expect(state.registerSW).not.toHaveBeenCalled();
});

it('does not install an automatic page-reload handler during a verified recovery redirect', () => {
  // Auth may already have consumed the fragment by the time the app starts.
  window.history.replaceState(null, '', '/dashboard');
  state.recoveryIntent = true;
  registerAppWorker(state.registerSW);
  expect(state.registerSW).not.toHaveBeenCalled();
});

it.each(['/', '/dashboard', '/companion', '/author'])
('preserves normal web caching and updates for %s', (path) => {
  expect(handlesOfflineNavigation(path)).toBe(true);
  window.history.replaceState(null, '', path);
  registerAppWorker(state.registerSW);
  expect(state.registerSW).toHaveBeenCalledExactlyOnceWith({ immediate: true });
});

it('never registers a browser worker in the installed iPhone app', () => {
  vi.stubEnv('MODE', 'native');
  registerAppWorker(state.registerSW);
  expect(state.registerSW).not.toHaveBeenCalled();
});
