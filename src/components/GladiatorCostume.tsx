export function MaximusCrop() {
  return <g>
    {/* A close taper at the temples leaves the arms of the glasses visible. */}
    <path d="M23 43q-3-6-2-13l-1.5 1.2q.3-8 5.4-12.6l-.4 2.4q3.4-7.6 11.1-10l-1.4 2.6q7.1-5.6 16.1-5.1L49 10q9.4-3.4 17.8-.9l-1.5 1.1q10.3-.2 16.2 5.2l-1.6-.3q11.5 5.9 13.3 19.7l-.6 9.2-3.4 4.6-1.6-12-4.2-6.5-5.7-4.6-.1 4.4-8.8-3.2 1.6 3.7-10.6-2.3 2.1 3.1-12.3-1.4 1.1 2.4-8.8-1.4-4.6 1.5-6.3-1.5-4.2 6.5-1 8.5Z" fill="#5b412e" strokeWidth="2.2" />
    <g fill="none" strokeLinecap="round">
      <path d="M26 29q1.7-5.4 5-8.2m4.2 4.6 5.8-8.1m1.8 6.1 6.7-7.3m2.2 6.2 5.9-6.6m4.1 5.8 4.7-5m6.3 5 2.6-3m8.8 8.4-3.4-5.3" stroke="#896747" strokeWidth="1.6" />
      <path d="m28.7 28.9 2.5-3.5m12.3 1.8 4.3-5m8.8 3.1 3.8-4.6m4.9 2.9 2.4-2.5" stroke="#75533b" strokeWidth="1.45" />
    </g>
  </g>;
}

export function MaximusBeard() {
  return <g fill="none" strokeLinecap="round">
    <path d="M28.2 60.8q3.8 5.8 10.4 8.2l6.8 1.9q5.5 3.5 12.2 3.6 8.1.2 13.1-3.8l6.5-2.5q7.5-2.7 12.1-10.2-1.7 11.5-13.4 16.8-7.7 3.6-20 3.1-18.9-.3-25.3-11.5Z" fill="#755039" stroke="none" opacity=".47" />
    <path d="M49.5 67.9q3.5-2.1 7.5-1.6m4.3-.2q4.3-1.5 7.7-.4" stroke="#875d3e" strokeWidth="1.25" opacity=".47" />
    <path d="m33.4 66.4.9 1.2m2.4-.1.8 1.4m2.2 1.1.8 1.2m3.6.5.8 1.2m3.4.3.6 1.4m4.6.1.5 1.2m5.4-.1.2 1.2m4.4-1.2-.2 1.1m5-.9-.4 1.1m4.4-2.1-.6 1.2m4.1-2.6-.7 1.2m4.2-3.6-.8 1.3m3.2-3.8-.7 1.3m3.6-4.4-.8 1.3" stroke="#805739" strokeWidth="1.05" opacity=".65" />
  </g>;
}

// Small relief figures flank the tree on the arena cuirass.
const horse = "M0 7 2.7 3.5l1.6-1.1-.5-2.5 2.5 1.6.4-2.2 1.5 2.8 2.8 2.2-1.3 1.5-3.1-1-1.9 3.7 1.7 2.8-1.4 1.1L2.6 9 0 9.1l-2.2 2.2-1.2-.8 1.8-3.1Z";

export function ArenaArmour() {
  return <g>
    <path d="m38 89 38.3-1.6 4.4 11.3-6.4 3.2-3.3-6.8 1 7-6.2 1.2-2.2-7.7-.3 8.1-6.2.4-.7-8.2-2.1 7.5-6.1-1.1.4-6.5-2.5 6.1-6.2-1.1Z" fill="#6a4b39" strokeWidth="1.45" />
    <path d="m41 72 35-2 6.5 10.2-4.7 12.5q-17.2 7.7-36.3 1.4l-4-10.8Z" fill="#463a31" strokeWidth="1.8" />
    <path d="m42.2 91.2q17.4 5.7 35.1-1.6l-.4 3.2q-16.7 7.1-34.1 1.2Z" fill="#785e47" strokeWidth="1" />
    <g fill="#c4bfae" stroke="none">
      <path d={horse} transform="translate(46.3 81.3) scale(.77)" />
      <path d={horse} transform="translate(73.3 81) scale(-.77 .77)" />
      <path d="m57 91.3 2.1-1.3-.1-3.4-2.9-1.2-1.4-1.9.8-.8 2.3 1.9 1.1.2-.9-3 1.2-1.4.9 2.7.9-1.9 1.1.3-.5 3.1 2.1-1.4 1 .7-3.5 2.9.1 3.2 2 1.5Z" />
    </g>
    <path d="M30.5 78.5q1.6-8.1 11.2-8.7l5.1 7.3q-9.4-.3-15.6 5.8Zm41-6.2q10.3-5.7 15.7 3l.8 6.4q-6.6-3.5-14-1.4Z" fill="#685343" strokeWidth="1.8" />
    <path d="M32.3 79q5.7-4.6 11.7-4.6m31.2 2.2q6-1.9 10.7 1.5" fill="none" stroke="#9b8062" strokeWidth="1.1" />
    <path d="m43.3 74.1 2.3 3.9m.2-4.1 2.4 3.4m23.5-5.5-1.2 4.1m3.6-3.8-1.2 3.5" stroke="#b09876" strokeWidth="1.3" />
  </g>;
}

export function ArenaShield({ resting = false }: { resting?: boolean }) {
  return <g className="arena-shield" transform={resting ? "rotate(15)" : "translate(21 88) rotate(-13)"} stroke="#211e2c" strokeWidth="1.7">
    <ellipse rx="15.8" ry="18.4" fill="#503f36" />
    <ellipse cx="-.8" cy="-.5" rx="14.4" ry="17.1" fill="#a1997f" />
    <ellipse cx="-.8" cy="-.5" rx="12.4" ry="14.8" fill="#76523a" stroke="#57463b" strokeWidth="1" />
    <path d="m-8.8-10.8-.2 20.9m4.5-23.3-.2 25.4m7.6-26 .1 26m3.8-24-.1 22.2" fill="none" stroke="#997251" strokeWidth=".85" />
    <ellipse cx="-.7" cy="-.8" rx="6" ry="6.3" fill="#827e70" />
    <ellipse cx="-1.1" cy="-1.1" rx="4.2" ry="4.5" fill="#b7b6a7" stroke="#625f58" strokeWidth="1" />
    <path d="M-4-2q.6-2.6 2.8-2.7" stroke="#eee8d4" fill="none" strokeWidth="1.25" />
    {!resting && <path className="costume-cue arena-glint" d="m-4.1-6.8.8 2.6 2.4.6-2.3.7-.7 2.6-.8-2.5-2.3-.7 2.2-.7Z" fill="#fff5d4" stroke="none" />}
    <g fill="#d2c5a2" stroke="none">
      <circle cx="-1" cy="-16.1" r=".85" /><circle cx="-1" cy="15.1" r=".85" /><circle cx="-13.8" cy="-.6" r=".85" /><circle cx="12.4" cy="-.6" r=".85" />
    </g>
  </g>;
}
