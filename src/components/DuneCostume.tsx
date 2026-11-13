// Side curls sit behind the face so the thick glasses frames keep their shape.
export function PaulCurlsBack() {
  return <path d="M26 24q-10 2-10 13 0 7-5 9 4 2 8-1-1 8-6 10 4 4 10 .5-1 6-4 9 7 2 14-6l3-18 49-5 3 21q5 9 13 5-5-2-4-8 5 3 9 .5-6-3-6-10 5 1 7-3-6 0-8-8 0-9-9-14Z"
    transform="translate(0 3) scale(1 .94)" fill="#342b2c" />;
}

export function PaulFringe() {
  return <g>
    <g transform="translate(0 3) scale(1 .94)">
      <path d="M22 44c3-9 10-12 16-14 6-2 10-5 12-9-1 5-4 9-8 12 7 0 14-5 17-10 4-5 7-6 10-5-4 3-8 6-7 11 1 4 5 7 3 11 7-3 7-8 5-12-1-3 1-5 5-6 5 4 10 5 11 10 1 3 0 5-1 7 5-2 8-5 7-10 5 4 6 9 4 14 7-5 8-12 4-18 2-7-3-12-10-14-1-6-7-9-14-8-5-4-12-4-17-1-8-4-16-3-21 2-7-2-14 1-17 7-6 2-9 8-7 13-3 6-1 13 4 17Z" fill="#3d3030" />
      <g fill="none" stroke="#79594b" strokeWidth="2">
        <path d="M20 27c0-5 4-10 10-11m-7 15c5-9 15-7 20-17m-7 2c2-7 8-11 15-10" />
        <path d="M48 21c4-9 10-12 16-11m-8 8c4-5 10-8 14-6m2-5c6-1 12 4 12 9m-4 3c7 2 13 4 14 11" />
      </g>
    </g>
    <path d="M58 63.5q-3-.5-5 2.2-4 5-11 4.7l-11-.7q-5-.4-7-3" fill="none" stroke="#394044" strokeWidth="2" />
    <path d="m56 63.5 3-.2" stroke="#a5aaa3" strokeWidth="2.1" />
  </g>;
}

export function Stillsuit({ lounging }: { lounging: boolean }) {
  return <g>
    {/* The darker panel edges separate each rib even in the wardrobe swatch. */}
    <path d="m39 79 13 1 5.5 5.2-1.3 7-15-3.4Zm39-2.4-13.3 2.7-5.1 5.4 1.2 7.2 16.5-5.5Z" fill="#53595b" strokeWidth="1.65" />
    <g fill="none" stroke="#91938d" strokeWidth="1.4">
      <path d="m42 82 11.5 2.8m-11 1 11.3 2.8m11.4-5 9.9-3m-10 6.8 10.2-3" />
    </g>
    <path d="m40 93 13 2.8 10-.8 15-4m-34 5.1 8.5 1.3 10-.6 12.8-3" stroke="#6f7370" strokeWidth="1.2" fill="none" />
    <path d="M38 73q9 5 20 3 13-2 21-8l6 6q-9 7-18 10l-21 5-8-3-3-6Z" fill="#a08365" strokeWidth="1.8" />
    <path d="m40 80 7 3-4 10-3 7-3-2-2 1-4-3 4-11Z" fill="#9a795b" strokeWidth="1.6" />
    <path d="M43 82q17 2 36-8m-41 13-3 7" stroke="#d0b695" strokeWidth="1.45" fill="none" />
    <g transform="translate(59 91) rotate(-4)">
      <rect x="-3.1" y="-4.6" width="6.2" height="9.2" rx="2" fill="#30383b" strokeWidth="1.3" />
      <path d="M-1.5-1.5h3m-3 3h3" stroke="#7a9799" strokeWidth="1.15" />
      {lounging && <path className="costume-cue dune-gauge" d="M-1.5-1.5h3" stroke="#c5f1ef" strokeWidth="1.6" />}
    </g>
  </g>;
}

export function SpiceDrift() {
  return <g className="dune-spice" stroke="none" fill="#efb36c">
    <path d="M99 37q4-5 10-5 6-.5 8-5-1 6-8 7-6 0-10 3Z" />
    <circle cx="103" cy="30" r="1" /><circle cx="112" cy="27" r="1.4" />
    <circle cx="118" cy="23" r=".9" fill="#ffe2a1" />
  </g>;
}

export function Crysknife({ lounging = false }: { lounging?: boolean }) {
  const pose = lounging ? "translate(63 107) rotate(88) scale(.74)" : "translate(24 92) rotate(-14)";
  return <g className="crysknife" transform={pose} strokeWidth="1.45">
    <path d="M-2.8-6C-5-11-3.8-18-4.8-24q-.7-5-4.5-11 8.2 5.2 11.3 17.6Q4-11 2.4-6Z" fill="#e7d7b3" />
    <path d="M-7.6-32q6.7 9.2 7.1 23.8L2.1-7C3.4-16.5-.6-26.4-7.6-32Z" fill="#b5a080" stroke="none" />
    <path d="m-3.7-19 .5 4" stroke="#f6ebd2" strokeWidth=".85" />
    <path className="costume-cue crysknife-glint" d="m-3.7-24 .8 5.6m-2-2.5 2.9-.5" fill="none" stroke="#fff9dc" strokeWidth="1.25" />
    <path d="m-3.5-7.5 6.4-.4.8 2.7-7.7.5Z" fill="#957959" />
    <path d="m-2.5-5.2 4.8-.3.4 12.8q-2.3 2-4.8.3Z" fill="#5f5248" />
    <path d="m-1.7-2.8 3.2-1m-3 5.2 3.1-1m-3 5.1 3.1-1" fill="none" stroke="#ad977c" strokeWidth="1" />
    {!lounging && <g className="dune-spice" fill="#edba76" stroke="none">
      <circle cx="-6" cy="-19.8" r="1" /><circle cx="-9.4" cy="-18" r=".65" />
    </g>}
  </g>;
}
