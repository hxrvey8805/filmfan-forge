export function BrokerHair() {
  return <g>
    {/* A high combed-back wave, a low side part and narrow, tapered temples. */}
    <path d="M21.7 47.3q-3.5-8.1-2.6-14.6.3-11.5 7.1-17.5 4.3-4.4 10.4-5.4C42 3.4 57.7 2.9 69 5.3q9.2.8 15.7 7.6 8.4 1.1 11.2 11.9 2.6 9.3-1.7 20.6l-2.6 4.3-2.1-12.2q-5.1-3.2-8.4-11.9-6.5 1.8-15.8.6-10.2-.7-16.1 3.2-6.2-4.5-14.1-2l-4.8 9.3-4.3 2.7-1.1 9.1Z" fill="#49322d" strokeWidth="2.35" />
    <path d="M25.2 29.5C29.6 15.3 46 7.8 60.9 8.5 46 11 35.4 17.9 29 27.6Zm12.5-5.9c9.5-10 24.9-14.5 37.6-11.5-11.6-.1-25.9 5.8-33.1 11.9Z" fill="#855941" stroke="none" />
    <path d="M51.2 24.1q13.9-7.8 27.6-7.8M82 18q5.4 5.2 6.4 11.2m-1.8-11q5.5 6 6.2 13.6" stroke="#a77854" strokeWidth="1.3" fill="none" />
  </g>;
}

export function BrokerSuit() {
  return <g>
    <path d="M38 81.1 35.6 92m8-10.8-2.8 13m8.1-9.2-2 10.9m8-5.4-1.1 6.4m14.5-7.6 2.3 6.4m3.4-14.3 3.4 12.4m1.6-13.4 3.1 10.8" fill="none" stroke="#98adbf" strokeWidth=".95" />
    <path d="m44.9 73.8 29.3-2.3-11.6 24.9Z" fill="#d4e5ef" strokeWidth="1.4" />
    <path d="m52.2 76.2 8.1 3.3-5.1 4.5-5.7-6.8Zm15.6-1.6-7.5 4.9 5.1 3.3 5.2-8.3Z" fill="#fff8e7" stroke="#7a8996" strokeWidth="1.1" />
    <path d="m57.2 80.4 3.2-2 3.4 1.4-1.6 3.6 2.4 8.2-2.5 4.2-3.7-3.6.9-8.4Z" fill="#ab3947" stroke="#612b3a" strokeWidth="1.1" />
    <path d="m59.9 85.7 2.3-.9m-2.6 4.2 3.1-1.3" fill="none" stroke="#edb083" strokeWidth=".9" />
    <path d="m44.3 74.2 4.3-.7 12.8 22.6L41 83.8l5.5-3.3-5.5-1.4Zm30.4-2.6-4.3.7L62 96l17.2-15.3-5.3-1.7 4.5-3.1Z" fill="#324c67" strokeWidth="1.5" />
    <path d="m72.2 86.3 2.5-3.4 2.4 1 1.6-1.3 1.6 2.7Z" fill="#fff6db" stroke="none" />
    <path d="m71.9 87.1 8.6-1.5" fill="none" strokeWidth="1.3" />
    <circle cx="60.2" cy="96.3" r="1.05" fill="#c4a16e" stroke="none" />
  </g>;
}

export function BrokerPen({ onTable = false }: { onTable?: boolean }) {
  const placement = onTable
    ? "translate(216 365.5) rotate(77) scale(1.35 1.65) translate(-22 -88)"
    : "rotate(-21 22 92)";
  return <g className="broker-pen" transform={placement} stroke="#151331">
    <path d="M20.4 92.8V76.3q1.7-1.7 3.3.1v16.4l-1.7 7.3Z" fill="#233740" strokeWidth="1.25" />
    <path d="m20.5 82 3.1.1M22 77.4l2.9.2v4.2" fill="none" stroke="#edca82" strokeWidth="1.25" />
    <path d="m20.9 95.5 2.2.1-1.1 4.5Z" fill="#e6bd70" stroke="none" />
  </g>;
}

export function FallingBanknotes() {
  return <g aria-hidden="true">
    {["translate(13 10) rotate(-12)", "translate(104 5) rotate(7)", "translate(123 16) rotate(-10)"].map(placement =>
      <g key={placement} transform={placement} className="broker-note-track">
        <g className="broker-note">
          <path d="M-6.8-3.5q3.4-1.4 7-.3t6.7-.3l-.4 7q-3.1 1.3-6.6.3t-6.9.2Z" fill="#9ee4aa" stroke="#245947" strokeWidth="1" />
          <ellipse rx="2.1" ry="2.45" fill="#419374" stroke="none" />
          <path d="m-4.6-.8 1.2-.1m6.6 2 1.2-.1" fill="none" stroke="#327755" strokeWidth="1" />
        </g>
      </g>
    )}
  </g>;
}

export function BrokerWatch({ seated = false }: { seated?: boolean }) {
  return <g className="broker-watch" transform={seated ? "translate(101 79.1) rotate(-15)" : "translate(100.7 73.5) rotate(38)"}>
    <rect x="-3.8" y="-4.8" width="7.6" height="9.6" rx="1.1" fill="#c99951" stroke="#604a40" strokeWidth="1" />
    <rect x="-3.3" y="-3.1" width="6.6" height="6.2" rx="1.3" fill="#244b4b" stroke="#ffe29a" strokeWidth="1.15" />
    <path d="m-1.4-1.2 1.4 1.5 1.5-.8" stroke="#fff1ce" strokeWidth=".85" fill="none" />
    {!seated && <path className="costume-cue broker-glint" d="m2.6-5.7.8 2 2 .8-2 .7-.8 2-.7-2-2-.7 2-.8Z" fill="#fff8cd" stroke="none" />}
  </g>;
}
