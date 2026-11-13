import { Check, Shield, Timer } from "lucide-react";
import type { FocusStatus } from "@/lib/watch-focus";

interface Props {
  status: FocusStatus | null;
  running: boolean;
  busy: boolean;
  useApps: boolean;
  editApps: () => void;
  timerOnly: () => void;
}

export function FocusProtection({ status, running, busy, useApps, editApps, timerOnly }: Props) {
  const saved = status?.saved ?? 0;
  const apps = (n: number) => n === 1 ? "1 app" : n + " apps";
  const selectable = status?.selectiveAvailable && !status.locked && !running;
  const detail = status?.locked ? "Locked to CineGeek" : running && status?.paused ? apps(status.paused) + " paused"
    : useApps ? apps(saved) + " ready to pause" : "Timer only · apps stay available";
  return <div className="room-focus-choice">
    <div className="room-focus-setting"><Timer size={17} aria-hidden="true" /><strong>Focus mode</strong></div>
    {selectable && <div className="room-focus-modes" role="group" aria-label="Focus mode">
      <button type="button" disabled={busy} aria-pressed={!useApps} onClick={timerOnly}>
        {!useApps && <Check size={14} aria-hidden="true" />}Timer only</button>
      <button type="button" disabled={busy} aria-pressed={useApps} onClick={editApps}>
        <Shield size={14} aria-hidden="true" />{useApps ? "Edit apps" : "Choose apps"}</button>
    </div>}
    <p role="status">{detail}</p>
  </div>;
}
