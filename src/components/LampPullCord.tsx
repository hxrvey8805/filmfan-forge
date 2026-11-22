import { useEffect, useRef, useState, type PointerEvent } from 'react';

const pullThreshold = 24; // CSS pixels: a deliberate downward gesture at every room size.

type Drag = { id: number; x: number; y: number; scale: number };
export function LampPullCord({ enabled, onStart }: { enabled: boolean; onStart?: () => void }) {
  const [pull, setPull] = useState(0);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const activated = useRef(false);
  useEffect(() => {
    drag.current = null;
    setPull(0);
    if (enabled) activated.current = false;
  }, [enabled]);

  function start() {
    if (!enabled || !onStart || activated.current) return;
    activated.current = true;
    onStart();
  }
  function begin(event: PointerEvent<HTMLButtonElement>) {
    if (!enabled || event.button !== 0 || event.isPrimary === false || drag.current) return;
    const svg = event.currentTarget.closest('svg');
    const matrix = svg?.getScreenCTM?.();
    const scale = matrix ? Math.hypot(matrix.c, matrix.d) : 1;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, scale: scale || 1 };
    suppressClick.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || event.pointerId !== current.id) return;
    const dx = event.clientX - current.x, dy = event.clientY - current.y;
    setPull(enabled && Math.abs(dx) < 36 ? Math.min(44, Math.max(0, dy / current.scale)) : 0);
  }
  function end(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || event.pointerId !== current.id) return;
    const dx = event.clientX - current.x, dy = event.clientY - current.y;
    // A short tap uses the native button click. Dragging sideways/up or releasing
    // before the threshold must not turn its synthetic click into a Focus start.
    suppressClick.current = Math.hypot(dx, dy) > 8;
    drag.current = null;
    setPull(0);
    if (dy >= pullThreshold && Math.abs(dx) < 36 && dy > Math.abs(dx)) start();
  }
  function cancel() {
    if (!drag.current) return;
    drag.current = null;
    suppressClick.current = true;
    setPull(0);
  }
  return <g className="room-lamp-cord" data-pulling={pull > 0 ? 'true' : undefined}>
    <g aria-hidden="true" pointerEvents="none" className="room-cord-art">
      <path d={`M447 170v${19 + pull}`} fill="none" stroke="#61474b" strokeWidth="1.4" />
      {enabled && <circle className="room-cord-glow" cx="447" cy={191 + pull} r="9" fill="#ffe1a0" opacity=".16" />}
      <circle cx="447" cy={191 + pull} r={enabled ? 3.4 : 2.3} fill="#d9b17d" stroke="#61474b" strokeWidth="1.6" />
      {enabled && pull === 0 && <g className="room-cord-hint">
        <path d="M426 212q14 0 18-13m-4 2 4-3 1 5" fill="none" stroke="#f5d7a5" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="336" y="201" width="91" height="24" rx="12" fill="#292330" fillOpacity=".88" stroke="#f5d7a5" strokeOpacity=".24" />
        <text x="381.5" y="216.5" textAnchor="middle" fontSize="10" fontWeight="550" fill="#f5dfb7">Pull to start</text>
      </g>}
    </g>
    {onStart && <foreignObject x="416" y="172" width="64" height="90">
      <button type="button" className="room-cord-target" disabled={!enabled}
        aria-label="Start focus with lamp cord" title="Pull down or tap to start Focus"
        onPointerDown={begin} onPointerMove={move} onPointerUp={end}
        onPointerCancel={cancel} onLostPointerCapture={cancel}
        onClick={event => {
          const suppress = suppressClick.current && event.detail > 0;
          suppressClick.current = false;
          if (!suppress) start();
        }}>
        <span className="sr-only">Pull down or tap the lamp cord to start Focus.</span>
      </button>
    </foreignObject>}
  </g>;
}
