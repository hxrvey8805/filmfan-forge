import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export interface FocusStatus {
  locked: boolean;
  selectiveAvailable: boolean;
  paused: number;
  session: string;
  saved?: number; // -1 = never configured; zero = timer only
}

interface NativeWatchFocus {
  getStatus(options: { viewer: string }): Promise<FocusStatus>;
  startWithApps(options: { session: string; viewer: string; editOnly: boolean }): Promise<{ started: boolean; paused?: number; saved?: number }>;
  finish(options: { session: string }): Promise<void>;
  reset(): Promise<void>;
  addListener(event: "statusChanged", listener: (status: FocusStatus) => void): Promise<PluginListenerHandle>;
}

export const iosWatchFocus = Capacitor.getPlatform() === "ios" ? registerPlugin<NativeWatchFocus>("WatchFocus") : null;
// The timer is in memory. A new web runtime must release shields from the old one.
export const watchFocusReady = iosWatchFocus?.reset().catch(() => undefined);
