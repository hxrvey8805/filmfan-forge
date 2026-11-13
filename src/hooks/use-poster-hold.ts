import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent } from "react";

type HoldPoint = { x: number; y: number };

function destination(p: HoldPoint) {
  return document.elementFromPoint(p.x, p.y)?.closest<HTMLButtonElement>("button[data-move-option]:not(:disabled)") ?? null;
}

// Touch listeners must be non-passive: let an ordinary swipe through, but take over
// scrolling once a stationary hold has explicitly opened the picker.
export function usePosterHold() {
  const cleanup = useRef<() => void>();
  const suppress = useRef<{ button: HTMLElement; until: number }>();
  useEffect(() => () => cleanup.current?.(), []);

  function start(button: HTMLElement, origin: HoldPoint, id: number, touch: boolean, open: () => void) {
    cleanup.current?.();
    suppress.current = undefined;
    let held = false;
    let marked: HTMLElement | null = null;
    const events = new AbortController();
    const options = { capture: true, passive: false, signal: events.signal };
    const timer = window.setTimeout(() => {
      held = true;
      suppress.current = { button, until: Infinity };
      open();
    }, 450);
    const clear = () => {
      window.clearTimeout(timer);
      marked?.removeAttribute("data-sliding");
      if (held) suppress.current = { button, until: performance.now() + 600 };
      events.abort();
      cleanup.current = undefined;
    };
    cleanup.current = clear;
    function step(e: Event, p: HoldPoint, end: boolean) {
      const moved = Math.hypot(p.x - origin.x, p.y - origin.y);
      if (!held) {
        if (end || moved > 9) clear();
        return;
      }
      if (e.cancelable) e.preventDefault();
      // Let Embla receive its end event and clear its drag listeners.
      if (!end) e.stopPropagation();
      const option = moved >= 12 ? destination(p) : null;
      if (end) { clear(); option?.click(); }
      else if (marked !== option) {
        marked?.removeAttribute("data-sliding");
        option?.setAttribute("data-sliding", "");
        marked = option;
      }
    }
    if (touch) {
      const at = (e: TouchEvent, end: boolean) => {
        if (!end && e.touches.length !== 1) { clear(); return; }
        const finger = Array.from(e.changedTouches).find(t => t.identifier === id);
        if (finger) step(e, { x: finger.clientX, y: finger.clientY }, end);
      };
      window.addEventListener("touchstart", e => { if (e.touches.length > 1) clear(); }, options);
      window.addEventListener("touchmove", e => at(e, false), options);
      window.addEventListener("touchend", e => at(e, true), options);
      window.addEventListener("touchcancel", clear, options);
    } else {
      const at = (e: PointerEvent, end: boolean) => { if (e.pointerId === id) step(e, { x: e.clientX, y: e.clientY }, end); };
      window.addEventListener("pointermove", e => at(e, false), options);
      window.addEventListener("pointerup", e => at(e, true), options);
      window.addEventListener("pointercancel", clear, options);
    }
    window.addEventListener("scroll", () => { if (!held) clear(); }, options);
    window.addEventListener("blur", clear, { signal: events.signal });
    window.addEventListener("keydown", e => { if (e.key === "Escape") clear(); }, options);
  }

  return {
    touch(e: ReactTouchEvent<HTMLButtonElement>, open: () => void) {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      start(e.currentTarget, { x: t.clientX, y: t.clientY }, t.identifier, true, open);
    },
    pointer(e: ReactPointerEvent<HTMLButtonElement>, open: () => void) {
      if (e.pointerType === "touch" || e.button !== 0 || !e.isPrimary) return;
      start(e.currentTarget, { x: e.clientX, y: e.clientY }, e.pointerId, false, open);
    },
    skipClick(button: HTMLElement) {
      return suppress.current?.button === button && performance.now() < suppress.current.until;
    },
  };
}
