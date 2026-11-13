const templeArms = "M2.5 13 5 7c.7-1.3 1.4-2 3-2 M21.5 13 19 7c-.7-1.3-1.5-2-3-2";

export function PulpFace() {
  return <g>
    {/* Match the other Geeks' frame arms; the curls below cover just their far ends. */}
    <g className="pulp-temples">
      <svg x="22" y="7" width="74" height="74" viewBox="0 0 24 24" fill="none" stroke="#151331" strokeWidth="2" strokeLinecap="round">
        <path d={templeArms} />
        <path d={templeArms} stroke="#766c82" strokeWidth=".38" transform="translate(-.2 -.12)" />
      </svg>
    </g>
    {/* A close cap of small curls, with a clear forehead for the eyebrow lift. */}
    <g transform="translate(0 6) scale(1 .89)">
      <path d="M21 44q-5-2-3-8-5-4-1-9-3-5 2-9 0-6 6-7 2-5 8-4 4-5 10-3 4-4 10-2 5-4 11-1 6-3 11 1 6-1 10 4 6 0 8 6 6 2 5 8 5 4 2 10 3 5-1 10l-4 6-4-7-1-15q-5 3-8 2-5 3-9-1-4 2-8-1-5 4-10 1-5 4-10 1-4 1-9-1-2 3-6 3l-2 17Z" fill="#302932" />
      <path d="M24 25q-2-5 3-7 2-1 3 1m5-4q1-4 5-4 3 0 3 2m7-3q2-4 6-3 2 0 2 2m9 3q3-3 6-1 2 1 1 3m8 4q4-2 6 2m-56 6q1-3 5-3m12-4q1-3 5-3m23 6q4-2 6 2" fill="none" stroke="#6d5b67" strokeWidth="1.7" />
      <path d="M24 31q2 3 5 0m15-12q1 2 4 1m11-9q-2 3 1 4m14 1q-1 3 3 3m14 4q2 2 0 4" fill="none" stroke="#211e26" strokeWidth="1.6" />
    </g>
    <path d="m20 39 7-4 1 17q0 8 7 12l-2 5q-10-3-12-12Zm70-4 6 3-1 19q-1 7-10 11l-3-4q7-5 7-11Z" fill="#392e36" strokeWidth="1.5" />
    <path d="M47 69q4-5 11-5l3 1 3-1q5-1 9 3-5 .6-9-1l-3 2-4-1q-4 1-10 2Z" fill="#47343b" strokeWidth="1.05" />
    <g fill="none" stroke="#332933" strokeWidth="2.8">
      <path className="pulp-brow" d="M32 38q7-4 16-.8" />
      <path d="M71 36q7-2 12 1" />
    </g>
  </g>;
}

export function PulpLensLight() {
  return <g className="pulp-lens-light" fill="none" stroke="#ffe099" strokeWidth=".56">
    <path d="M3.9 16.4q2 .3 4.3-.45m7.7.45q2 .3 4.3-.45" />
  </g>;
}

export function PulpBriefcase({ lounging }: { lounging: boolean }) {
  return <g>
    {!lounging && <g>
      <path d="M38 76q-11 1-13 11-1 8 9 12l7-5-6-6 8-8Z" fill="var(--jacket-dark)" />
      <path d="m29 94 4-5 7 4-3 6Z" fill="var(--trim)" />
      <path d="M35 93q4-2 7 1l4 5-3 4q-5 1-9-3Z" fill="#ffcd38" />
      <path d="M77 75q10-2 16 6 5 7 .5 12l-11 4-5-6 8-4-10-6Z" fill="var(--jacket-light)" />
      <path d="m80 91 5-2 4 5-6 4Z" fill="var(--trim)" />
    </g>}
    <g transform={lounging ? "translate(68 88) rotate(-5) scale(.65)" : "translate(38 93) rotate(-4)"}>
      <rect y="3.5" width="46" height="18" rx="3" fill="#483939" strokeWidth="1.8" />
      <path d="M4 17.8h37" fill="none" stroke="#655050" strokeWidth="1" />
      {!lounging && <path className="pulp-case-light" d="M1.6 2.8q21-1.6 42.8-.5v3.2H1.6Z" fill="#ffda82" stroke="none" />}
      <g className={lounging ? undefined : "pulp-case-lid"}>
        <path d="M16 1v-3q0-2 2-2h9q2 0 2 2v3" fill="none" strokeWidth="2" />
        <path d="M0 2q0-3 3-3h40q3 0 3 3v3H0Z" fill="#614c49" strokeWidth="1.6" />
        <path d="M8 3v3m30-3v3" fill="none" stroke="#d9ae72" strokeWidth="2.4" />
        {!lounging && <path d="M41-1q3-3 6-2l2 3q-2 2-4 1l-3 2q-2 0-2-2Z" fill="#ffda42" strokeWidth="1.5" />}
      </g>
      {lounging && <path className="costume-cue pulp-latch" d="m5.5 4 1.8-.7.7-2 .8 1.9 1.8.7-1.9.7-.7 1.7-.6-1.7Z" fill="#ffdf9a" stroke="none" />}
    </g>
  </g>;
}
