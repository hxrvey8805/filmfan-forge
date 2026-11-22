import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type TouchEvent } from "react";

type Point = { x: number; y: number };
type Lift = { key: string; width: number; height: number; left: number; top: number };
type Session = { key: string; keyboard: boolean; shift: (amount: number) => void; finish: (commit: boolean) => void };

export function usePosterReorder(keys: string[], onReorder?: (keys: string[]) => void) {
  const viewport = useRef<HTMLDivElement>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const session = useRef<Session>();
  const cleanup = useRef<() => void>();
  const latest = useRef({ keys, onReorder });
  latest.current = { keys, onReorder };
  const [lift, setLift] = useState<Lift | null>(null);
  const [announcement, announce] = useState("");
  const suppress = useRef(0);
  const signature = keys.join("|");
  useEffect(() => () => cleanup.current?.(), [signature]);

  function begin(button: HTMLButtonElement, key: string, origin: Point, id: number, touch: boolean, keyboard = false) {
    if (!latest.current.onReorder || keys.length < 2 || !viewport.current) return;
    cleanup.current?.();
    const port = viewport.current;
    const cards = Array.from(port.querySelectorAll<HTMLElement>("[data-reorder-key]"));
    const from = cards.findIndex(card => card.dataset.reorderKey === key);
    if (from < 0) return;
    const initial = [...latest.current.keys];
    const events = new AbortController();
    const options = { capture: true, passive: false, signal: events.signal };
    let active = false, to = from, frame = 0, lastTime = 0, point = origin;
    let rect: DOMRect, slots: { left: number; width: number }[] = [];
    let portRect: DOMRect;
    let timer = 0;

    function mark(next: number) {
      to = Math.max(0, Math.min(cards.length - 1, next));
      cards.forEach((card, index) => {
        const destination = index === from ? to : from < to && index > from && index <= to ? index - 1
          : to < from && index >= to && index < from ? index + 1 : index;
        card.style.transform = `translate3d(${slots[destination].left - slots[index].left}px,0,0)`;
      });
      announce(`Position ${to + 1} of ${cards.length}. Release to place, or press Escape to cancel.`);
    }
    function tick(time: number) {
      if (!active) return;
      const dt = Math.min((time - (lastTime || time)) / 1000, .035); lastTime = time;
      if (!keyboard) {
        const edge = Math.min(52, portRect.width / 5);
        const direction = point.x < portRect.left + edge ? -Math.min(1, (portRect.left + edge - point.x) / edge)
          : point.x > portRect.right - edge ? Math.min(1, (point.x - portRect.right + edge) / edge) : 0;
        port.scrollLeft += direction * 520 * dt;
        const center = rect.left + rect.width / 2 + point.x - origin.x - portRect.left + port.scrollLeft;
        let nearest = 0, distance = Infinity;
        slots.forEach((slot, index) => { const d = Math.abs(slot.left + slot.width / 2 - center); if (d < distance) { distance = d; nearest = index; } });
        if (nearest !== to) mark(nearest);
      }
      if (ghost.current) {
        const dx = keyboard ? slots[to].left - slots[from].left - (port.scrollLeft - startScroll) : point.x - origin.x;
        const dy = keyboard ? -8 : point.y - origin.y - 8;
        ghost.current.style.transform = `translate3d(${dx}px,${dy}px,0) scale(1.045)`;
      }
      frame = requestAnimationFrame(tick);
    }
    let startScroll = port.scrollLeft;
    function activate() {
      if (!button.isConnected || !port.isConnected) { finish(false); return; }
      active = true; suppress.current = Infinity;
      rect = button.getBoundingClientRect(); portRect = port.getBoundingClientRect(); startScroll = port.scrollLeft;
      slots = cards.map(card => { const r = card.getBoundingClientRect(); return { left: r.left - portRect.left + port.scrollLeft, width: r.width }; });
      port.dataset.reordering = "true";
      cards[from].dataset.lifted = "true";
      setLift({ key, width: rect.width, height: rect.height, left: rect.left, top: rect.top });
      mark(from);
      session.current = { key, keyboard, finish, shift(amount) {
        mark(to + amount);
        const slot = slots[to];
        if (slot.left < port.scrollLeft) port.scrollLeft = slot.left;
        else if (slot.left + slot.width > port.scrollLeft + port.clientWidth) port.scrollLeft = slot.left + slot.width - port.clientWidth;
      } };
      frame = requestAnimationFrame(tick);
    }
    function finish(commit: boolean) {
      clearTimeout(timer); cancelAnimationFrame(frame); events.abort();
      cleanup.current = undefined; session.current = undefined;
      if (!active) return;
      active = false; suppress.current = performance.now() + 650;
      delete port.dataset.reordering;
      cards.forEach(card => { card.style.transform = ""; delete card.dataset.lifted; });
      setLift(null);
      if (commit && to !== from && latest.current.keys.join("|") === initial.join("|")) {
        const reordered = [...initial]; reordered.splice(from, 1); reordered.splice(to, 0, key);
        latest.current.onReorder?.(reordered);
        announce(`Placed at position ${to + 1} of ${cards.length}.`);
      } else announce(commit ? "Order unchanged." : "Reordering cancelled.");
      button.focus({ preventScroll: true });
    }
    function step(event: Event, p: Point, end: boolean) {
      point = p;
      if (!active) { if (end || Math.hypot(p.x - origin.x, p.y - origin.y) > 9) finish(false); return; }
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      if (end) {
        // Resolve the final finger position even when touchend arrives before the next frame.
        cancelAnimationFrame(frame); tick(performance.now()); finish(true);
      }
    }
    cleanup.current = () => finish(false);
    if (!keyboard) {
      if (touch) {
        const at = (e: globalThis.TouchEvent, end: boolean) => {
          if (!end && e.touches.length !== 1) { finish(false); return; }
          const finger = Array.from(e.changedTouches).find(t => t.identifier === id);
          if (finger) step(e, { x: finger.clientX, y: finger.clientY }, end);
        };
        window.addEventListener("touchstart", e => { if (e.touches.length > 1) finish(false); }, options);
        window.addEventListener("touchmove", e => at(e, false), options);
        window.addEventListener("touchend", e => at(e, true), options);
        window.addEventListener("touchcancel", () => finish(false), options);
      } else {
        const at = (e: globalThis.PointerEvent, end: boolean) => { if (e.pointerId === id) step(e, { x: e.clientX, y: e.clientY }, end); };
        window.addEventListener("pointermove", e => at(e, false), options);
        window.addEventListener("pointerup", e => at(e, true), options);
        window.addEventListener("pointercancel", () => finish(false), options);
      }
      timer = window.setTimeout(activate, 380);
    } else activate();
    window.addEventListener("blur", () => finish(false), { signal: events.signal });
    window.addEventListener("resize", () => finish(false), { signal: events.signal });
    window.addEventListener("scroll", e => { if (!active || e.target !== port) finish(false); }, { ...options, passive: true });
    document.addEventListener("visibilitychange", () => { if (document.hidden) finish(false); }, { signal: events.signal });
    window.addEventListener("keydown", e => { if (e.key === "Escape") { e.preventDefault(); finish(false); } }, options);
  }
  return {
    viewport, ghost, lift, announcement,
    skipClick: () => performance.now() < suppress.current,
    touch(e: TouchEvent<HTMLButtonElement>, key: string) {
      if (e.touches.length !== 1) return;
      const t = e.touches[0]; begin(e.currentTarget, key, { x: t.clientX, y: t.clientY }, t.identifier, true);
    },
    pointer(e: PointerEvent<HTMLButtonElement>, key: string) {
      if (e.pointerType === "touch" || e.button !== 0 || e.isPrimary === false) return;
      begin(e.currentTarget, key, { x: e.clientX, y: e.clientY }, e.pointerId, false);
    },
    keyboard(e: KeyboardEvent<HTMLButtonElement>, key: string) {
      const current = session.current;
      if (current?.key === key && current.keyboard) {
        if (["ArrowLeft", "ArrowRight", "Enter", " ", "Escape", "Tab"].includes(e.key)) {
          if (e.key !== "Tab") e.preventDefault(); e.stopPropagation();
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") current.shift(e.key === "ArrowLeft" ? -1 : 1);
          else current.finish(e.key === "Enter" || e.key === " ");
        }
      } else if (e.key === " " && !e.repeat) {
        e.preventDefault(); const r = e.currentTarget.getBoundingClientRect();
        begin(e.currentTarget, key, { x: r.left + r.width / 2, y: r.top + r.height / 2 }, 0, false, true);
      }
    },
  };
}
