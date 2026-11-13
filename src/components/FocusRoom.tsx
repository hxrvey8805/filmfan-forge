import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CircleStop, Play } from "lucide-react";
import { GeekViewer, useGeekOutfit } from "@/hooks/use-geek-outfit";
import { useViewerPreference } from "@/hooks/use-viewer-preference";
import { decodeRoomStyle, defaultRoomStyle, roomStyles } from "@/lib/room-styles";
import { FocusRoomScene } from "./FocusRoomScene";
import { FocusProtection } from "./FocusProtection";
import { iosWatchFocus, watchFocusReady, type FocusStatus } from "@/lib/watch-focus";
import { RoomStylePicker } from "./RoomStylePicker";
import "./focus-room.css";

interface FocusRoomProps {
  title: string;
  episodeLabel: string;
  active: boolean;
  validPosition: boolean;
  chatting?: boolean;
  setup?: (options: ReactNode, preparing: boolean) => ReactNode;
  children?: (focusAction: ReactNode) => ReactNode;
}

function sessionTime(seconds: number) {
  return Math.floor(seconds / 60).toString().padStart(2, "0") + ":" + (seconds % 60).toString().padStart(2, "0");
}

export function FocusRoom({ title, episodeLabel, active, validPosition, chatting = false, setup, children }: FocusRoomProps) {
  const viewer = useContext(GeekViewer) ?? "guest";
  const { look } = useGeekOutfit();
  const { value: roomStyle, choose, ready } = useViewerPreference("room", defaultRoomStyle, decodeRoomStyle);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);
  useEffect(() => {
    if (!active || startedAt === null) return;
    const update = () => setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [active, startedAt]);

  const [session] = useState(() => crypto.randomUUID?.() ?? String(Math.random()));
  const [protection, setProtection] = useState<FocusStatus | null>(null);
  const [checking, setChecking] = useState(Boolean(iosWatchFocus));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(false);
  const requesting = useRef(false);
  const withApps = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const native = iosWatchFocus;
    if (!native) return;
    let live = true;
    let updates = 0;
    const accept = (state: FocusStatus) => {
      if (!live) return;
      setProtection(previous => ({ ...state, saved: state.saved ?? previous?.saved ?? -1,
        paused: state.session === session ? state.paused : 0 }));
    };
    const listener = native.addListener("statusChanged", state => { updates++; accept(state); }).catch(() => null);
    const refresh = async () => {
      const previous = updates;
      try {
        await watchFocusReady;
        const state = await native.getStatus({ viewer });
        if (updates === previous) accept(state);
        else if (live && state.saved !== undefined) setProtection(current => current && { ...current, saved: state.saved });
      } catch { if (live && updates === previous) setProtection(null); }
      finally { if (live) setChecking(false); }
    };
    void refresh();
    const foreground = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", foreground);
    return () => {
      live = false;
      mounted.current = false;
      document.removeEventListener("visibilitychange", foreground);
      void listener.then(handle => handle?.remove());
      void native.finish({ session }).catch(() => undefined);
    };
  }, [session, viewer]);

  // The previous version auto-paused a saved selection. Keep it unless this viewer chooses timer only.
  const preference = useViewerPreference<"timer" | "apps">("focus-mode", "apps", value =>
    value === "timer" || value === "apps" ? value : null);
  const [guestMode, setGuestMode] = useState<"timer" | "apps">("apps");
  const setMode = preference.ready ? preference.choose : setGuestMode;
  const useApps = Boolean(protection?.selectiveAvailable && !protection.locked && (protection.saved ?? 0) > 0
    && (preference.ready ? preference.value : guestMode) === "apps");
  const running = startedAt !== null;
  function startTimer() {
    setError("");
    setSeconds(0);
    setStartedAt(Date.now());
  }

  async function startWithApps(editOnly = false) {
    if (!iosWatchFocus || (!editOnly && !validPosition) || running || requesting.current) return;
    setError("");
    requesting.current = true;
    setBusy(true);
    try {
      await watchFocusReady;
      if (!mounted.current) return;
      const result = await iosWatchFocus.startWithApps({ session, viewer, editOnly });
      if (mounted.current && result.saved !== undefined) setProtection(state => state && { ...state, saved: result.saved });
      if (mounted.current && editOnly && result.saved !== undefined) setMode(result.saved > 0 ? "apps" : "timer");
      if (mounted.current && !editOnly && result.started) {
        withApps.current = true;
        setProtection(state => state && { ...state, session, paused: result.paused ?? 0 });
        startTimer();
      }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "Couldn’t start app blocking. You can still use the timer.");
    } finally {
      requesting.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function toggleSession() {
    if (requesting.current) return;
    if (startedAt === null) {
      if (useApps) await startWithApps();
      else startTimer();
      return;
    }
    if (withApps.current && iosWatchFocus) {
      requesting.current = true;
      setBusy(true);
      try {
        await iosWatchFocus.finish({ session });
        withApps.current = false;
        if (mounted.current) setProtection(state => state && { ...state, paused: 0, session: "" });
      } catch {
        if (mounted.current) setError("Couldn’t confirm your apps are available again. Tap End focus to retry.");
        return;
      } finally {
        requesting.current = false;
        if (mounted.current) setBusy(false);
      }
      if (!mounted.current) return;
    }
    setError("");
    setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    setStartedAt(null);
  }
  const palette = roomStyles[roomStyle];
  if (!active) {
    const options = <div className="room-setup-options">
      <RoomStylePicker value={roomStyle} choose={choose} ready={ready} />
      <FocusProtection status={protection} running={running} busy={busy || checking} useApps={useApps}
        editApps={() => void startWithApps(true)} timerOnly={() => { setMode("timer"); setError(""); }} />
      {error && <p role="alert" className="room-focus-error">{error}</p>}
    </div>;
    return setup ? setup(options, busy || checking) : options;
  }
  const time = sessionTime(seconds ?? 0);
  const focusAction = <button type="button" className="focus-session-action" onClick={toggleSession}
    disabled={busy || checking || (!running && !validPosition)}>
    {running ? <CircleStop size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
    {running ? "End focus" : seconds === null ? "Start focus" : "Start again"}
  </button>;
  return <section className="focus-room screening-room" data-chat={chatting ? "open" : "closed"} aria-label="Your screening room"
    data-session={running ? "active" : "idle"} data-room-style={roomStyle} style={roomStyle === defaultRoomStyle ? undefined : palette.paint}>
    <figure className="focus-room-card" aria-label={`${title} · ${episodeLabel}`}>
      <FocusRoomScene look={look} running={running} styleName={palette.name} time={time} />
    </figure>
    <span role="timer" aria-live="off" aria-label={`Focus time: ${time}`} className="sr-only" />
    {error && <p role="alert" className="room-focus-error">{error}</p>}
    {children ? children(focusAction) : focusAction}
  </section>;
}
