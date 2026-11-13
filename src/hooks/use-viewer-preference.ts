import { createContext, useContext, useSyncExternalStore } from "react";

export const GeekViewer = createContext<string | null>(null);
const event = "cinegeek:viewer-preference";
const temporary = new Map<string, string>();

function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(event, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(event, notify);
  };
}

/** Personal on this device, shared across titles even when device storage is unavailable. */
export function useViewerPreference<T extends string>(
  namespace: string, fallback: T, decode: (value: string | null) => T | null,
) {
  const viewer = useContext(GeekViewer);
  const key = viewer ? `cinegeek.${namespace}.v1.${viewer}` : null;
  const value = useSyncExternalStore(subscribe, () => {
    if (!key) return fallback;
    try { return decode(temporary.get(key) ?? localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }, () => fallback);
  function choose(selection: T) {
    if (!key) return;
    try {
      localStorage.setItem(key, selection);
      temporary.delete(key);
    } catch { temporary.set(key, selection); }
    window.dispatchEvent(new Event(event));
  }
  return { value, choose, ready: Boolean(key) };
}
