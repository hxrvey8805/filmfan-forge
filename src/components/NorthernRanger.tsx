import { useId } from "react";

export function RangerCloak() {
  return <g>
    <path d="M31 68q17-13 42-7 15 3 18 19l3 13 9 10q-12 7-24 4l-13-4-9 4-14-4-10 3q-14 3-25-2 13-11 16-25Z" fill="#252830" />
    <path d="M33 76q-6 15-17 26l16-3 11-15m32-9q5 13 15 25l-9 3-12-8" fill="#393b42" strokeWidth="1.5" />
    <path d="m20 102 11-3m52 4 8-2" fill="none" stroke="#727174" strokeWidth="1.3" />
  </g>;
}

export function RangerArmour() {
  return <g>
    {/* Quilted leather, crossed sword belts and a deep, uneven pelt. */}
    <path d="m38 75 39-4 6 23-15 6-9-4-11 5-12-5Z" fill="#414047" strokeWidth="1.6" />
    <path d="m39 84 15 10m-11-14 22 16m5-18-13 16m-1-14-12 13m34-12-12 13" fill="none" stroke="#57545a" strokeWidth="1.2" />
    <path d="m40 76 6-3 32 17-3 4Zm36-5 5 3-32 21-5-3Z" fill="#514443" stroke="#231f28" strokeWidth="1.4" />
    <path d="m63 83 5-3 2 3-5 3Z" fill="none" stroke="#b5aba0" strokeWidth="1.25" />
    <path d="M36 92q20 1 47-4l.6 6-46 6Z" fill="#332d32" strokeWidth="1.6" />
    <path d="m55 93 9-1 .6 4.4-9 1Z" fill="none" stroke="#b7afa3" strokeWidth="1.6" />
    <path d="M17 77q3-11 15-15 17-8 29-4l10-4 6 4q17 0 22 12l-4-1 5 10-8-3 1 8-9-5-1 5-9-5-7 5-7-4-6 4-8-3-8 6 1-6-10 5 2-7-11 5 2-7-6 3Z" fill="#413c40" strokeWidth="2.1" />
    <path d="m23 73 8-6-2 7 8-6-2 7m44-11 6 6-1-4 6 7m-17 0 6 5" fill="none" stroke="#726b6a" strokeWidth="1.65" />
    <path d="m25 78 6-4m52 2 3 3" stroke="#948883" strokeWidth="1.15" />
    <circle cx="72" cy="79.5" r="2" fill="#aca7a0" strokeWidth="1" />
  </g>;
}

export function RangerCurls() {
  return <g transform="translate(0 4) scale(1 .95)">
    <path d="M19 35Q12 21 27 14q0-8 11-9 8-6 18-3 10-4 17 1 13-2 18 8 12 4 11 17 5 8 1 18-1 6 3 10l-4 1q6 12-2 19l-1-6q-2 8-9 10l1-6-7 2 3-13-57 2 3 12-7-3 1 6q-9-1-11-10l-3 4q-4-6 0-15-6-6-1-16Z" fill="#242229" />
    <path d="M19 46q-5 6-1 13 3 7-1 11m81-34q4 6-1 13-3 6 1 11m-3 4q2 6-3 10" fill="none" stroke="#544e54" strokeWidth="2" />
  </g>;
}

export function RangerFace() {
  return <g>
    <g transform="translate(0 4) scale(1 .95)">
      <path d="M20 48q-4-6 0-16-6-7 2-15 4-5 10-6 2-6 11-6 9-5 17 0 8-4 16 1 10-2 15 7 8 3 9 11 4 8-2 16l-3 9-4-9-2-11q-13 0-20-10-2 8-10 12l2-6q-7 5-14 6l3-5q-5 4-12 8l1-5q-9 3-12 12l-3-1Z" fill="#2a252c" />
      <path d="M25 27q-1-6 5-8 5-1 6-5m0 12q8-1 9-10m2 6q10-3 12-11m9 0q1 6 7 8 5 1 7 5m1-9q7 2 7 7" fill="none" stroke="#5b5159" strokeWidth="1.9" />
    </g>
    <path d="M25 57q4 6 9 9l4 4 1-3 9 6 7 2 6 1 6-1 9-7 2 2 9-8 5-7q0 12-10 19l-4 5-2-2-12 6-2-2-8 2 1-2q-12-1-18-8-10-5-12-16Z" fill="#3c3034" strokeWidth="1.4" />
    <path d="m33 66 5 5m41 0 4-4M51 67q5-3 9-1 4-3 9-1" fill="none" stroke="#4e3838" strokeWidth="1.7" />
  </g>;
}

export function RangerSwordHand({ lounging }: { lounging: boolean }) {
  return <>
    <WolfSword lounging={lounging} />
    {!lounging && <path d="M24 86q-6-1-7 5t7 7q6 0 9-8Z" fill="#ffbf17" />}
  </>;
}

function WolfSword({ lounging }: { lounging: boolean }) {
  const frostClip = useId().replace(/:/g, "");
  return <g className="wolf-sword" transform={lounging ? "translate(31 97) rotate(-27) scale(.83)" : "translate(23 92) rotate(-15)"}>
    <defs><clipPath id={frostClip}>
      <rect className="blade-frost-front" x="-5" y="-69" width="10" height="59" />
    </clipPath></defs>
    <path d="m-4-11 .5-43L0-69l3.1 15L4-11Z" fill="#bac8cd" stroke="#292b36" strokeWidth="1.6" />
    <path d="m0-64 2.3 12 .5 40H0Z" fill="#74848d" stroke="none" />
    <path d="M-.6-53v37" stroke="#65757e" strokeWidth=".8" />
    <g clipPath={`url(#${frostClip})`} opacity="var(--frost-opacity)" fill="none" stroke="#dcffff">
      <path d="M-.3-11q1-9-.5-17T.2-44L0-61" strokeWidth="2" />
      <path d="m-.4-22-2.2-4m2.5 0 2.4-5m-3-3-2-4m2 0 2.4-4m-2-4-1.7-3m2-3 1.5-4" strokeWidth="1" />
    </g>
    <path d="m-10-8 2-4 7-1 2-.5 7 1.5 2 3.5-2.5-.3-6-1-7 .6Z" fill="#69727a" strokeWidth="1.5" />
    <path d="m-2-9 4-.2.5 18-5 .1Z" fill="#524447" strokeWidth="1.25" />
    <path d="m-2-6 4-1m-4 5 4-1m-4 6 4-1m-4 5 4-1" stroke="#968785" strokeWidth=".9" />
    {/* A carved white wolf's head sits below the leather grip. */}
    <path d="m-3 10-1-4 3 2 2-3 1.5 4 3 2 3 .5-1.5 3-4 .7-3 3-3.5-1 1-2.5-3 .4Z" fill="#e6e3d7" stroke="#3d434c" strokeWidth="1.35" />
    <path d="m1 11 2-.4m3 2 1-.4" stroke="#444856" strokeWidth="1.05" />
  </g>;
}
