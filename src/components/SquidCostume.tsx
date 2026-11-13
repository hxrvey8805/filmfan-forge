export function PlayerHair() {
  return <g>
    <path d="M21 47q-5-6-3-14-4-11 3-19 4-9 16-10 11-5 21 0 8-5 18-1 13 1 18 11 6 8 4 17 2 8-3 15l-4-6-1-10q-12-1-21-10-3-3-5-7-2 10-16 15l3-6q-9 7-18 10l-6 12-2-5Z" fill="#312f36" />
    <path d="M23 25q7-13 22-15m-17 17q13-3 23-13m7-5q-1 8-10 13m20-13q10 2 18 12m-15-5q8 7 17 8" stroke="#65565a" strokeWidth="1.9" fill="none" />
  </g>;
}

export function PlayerTracksuit() {
  return <g>
    <path d="M48 72q10 4 21-2l-2 5.5-8 7.3-8-6.2Z" fill="#eeeada" stroke="#225c50" strokeWidth="1.5" />
    <path d="M59 83v11.7" fill="none" stroke="#b4cdbc" strokeWidth="1.15" />
    <path d="M59 83v2" fill="none" stroke="#f1edda" strokeWidth="1.7" />
    <path d="m40 92 5.6-3m29.4 2.1 4.4 2" fill="none" stroke="#1b594e" strokeWidth="1.4" />
    <path d="M40.5 95.2q19 .8 38.5-1" fill="none" stroke="#1b594e" strokeWidth="1.25" />
    <g transform="translate(64 83) scale(.60)">
      <rect width="19" height="10" rx="1.4" fill="#215e50" stroke="#74a38c" strokeWidth=".75" />
      {/* Stitched block numerals stay legible without a font on the tiny patch. */}
      <path d="M4.6 2 1.8 5.9h4.5M5 2v6m6.1-5.9H7.6v3h2.6q1.8 0 1.3 1.7-.4 1.6-3.9 1m9.5-5.6q-4.2-.7-4.1 3.6.1 2.5 2.4 2.2 2.2-.3 1.5-2-.6-1.4-3.6-.4"
        fill="none" stroke="#fffae4" strokeWidth="1.25" />
    </g>
  </g>;
}

export function PlayerTrackPants({ lounging = false }: { lounging?: boolean }) {
  return <g fill="#205e50" strokeWidth="1.8">
    {lounging
      ? <path d="M44 90q13 1 20-1l12 11-6 4-12-8-12 2ZM65 89q14-5 20-1l13 8-5 5-14-7-11 3Z" />
      : <path d="m44 92 12 .4-8 12-9-1ZM62 92l12-1 2 12-9 2Z" />}
  </g>;
}

// Printed on the card at rest, then briefly picked out in rose as he greets the viewer.
const cardSymbols = "M4 7a2.2 2.2 0 1 0 4.4 0A2.2 2.2 0 1 0 4 7Zm6.3 2 2.6-4.2L15.4 9Zm7.2-4h4v4h-4Z";

export function GameInvitation({ lounging }: { lounging: boolean }) {
  return <g transform={lounging ? "translate(74 102) rotate(-4) scale(.78 .65)" : "translate(5 80) rotate(-8 19 13)"}>
    <g className={lounging ? undefined : "costume-tilt squid-card-tilt"}>
      <rect width="25" height="14" rx="1.5" fill="#d9ab78" strokeWidth="1.7" />
      <path d="m1.8 2 21-.2" fill="none" stroke="#efcc9e" strokeWidth="1" />
      <path d={cardSymbols} fill="none" stroke="#553e3c" strokeWidth="1.35" />
      <path className="costume-cue squid-card-ink" d={cardSymbols} fill="none" stroke="#fa7394" strokeWidth="1.55" />
    </g>
    {!lounging && <path d="M16.5 11q1.5-2.9 4 .2l2.4 1.6-1.5 3-3.9-.5Z" fill="#ffd038" strokeWidth="1.35" />}
  </g>;
}
