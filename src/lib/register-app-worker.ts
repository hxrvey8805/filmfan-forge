import type { registerSW } from 'virtual:pwa-register';
import { authNavigationPattern } from './auth-navigation';
import { recovery } from './password-recovery';

export function registerAppWorker(register: typeof registerSW) {
  // autoUpdate reloads the document when a new worker activates. A recovery
  // session's verified event belongs to this document; reloading here loses it
  // after Auth has already removed the one-time credentials from the URL.
  if (import.meta.env.MODE === 'native' || recovery.snapshot().intent ||
      authNavigationPattern.test(window.location.pathname)) return;
  register({ immediate: true });
}
