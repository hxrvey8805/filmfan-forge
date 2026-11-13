export function SocialHair() {
  return <g>
    <path d="M21 40q-5-3-2-10-3-5 2-9-2-6 4-10 3-4 9-3 4-6 11-4 5-4 11-1 6-3 12 1 8-2 12 3 9 0 12 7 7 3 6 10 5 6 0 12l-4 8-4-4-1-10q-7 2-11-4l-1 6-7-6q-5 6-12 7l2-6q-7 5-15 6l2-5q-9 4-16 12l-3-3-4 6Z" fill="#654235" />
    <path d="M24 24q0-6 6-7 3-1 4 1m3-4q3-5 8-3m7 0q4-5 9-1m8 1q6-2 9 3m5 5q5-1 7 4m-55 6q3-5 9-5m9-1q4-6 9-6" fill="none" stroke="#a77753" strokeWidth="2" />
  </g>;
}

export function CampusHoodie() {
  return <g>
    <path d="m40 73 36-2 8 23-9 5-34 1-8-6Z" fill="#929da6" />
    <path d="m45 73 28-2-6 25-12 2Z" fill="#8e394a" strokeWidth="1.5" />
    <path d="M32 70q3-9 16-9l24-1q12-1 16 8l-5 10-9 4-9 16-1-13 6-9-17 2 5 17-10-12-12-4Z" fill="#b0b8bc" strokeWidth="1.8" />
    <path d="m36 70 11 2 10 7-7 2-11-5Zm34 4 13-8-2 8-11 6Z" fill="#54626d" strokeWidth="1.4" />
    <path d="m45 79 1 8m30-9-2 7" stroke="#eee9d9" strokeWidth="1.8" />
    <path d="m39 92 8-5m28 4-3-4m-34 9 13 1m15-1 13-2" fill="none" stroke="#64747e" strokeWidth="1.3" />
  </g>;
}

export function CampusComputer({ lounging }: { lounging: boolean }) {
  if (lounging) {
    return <g transform="translate(62 91) rotate(-4)" strokeWidth="1.5">
      <path d="m0 3 22-3 11 4-24 4Z" fill="#a6b5ba" />
      <path d="m0 3 9 5 24-4v2L9 10 0 5Z" fill="#697884" />
      <path d="m20 7 4-.7" stroke="#354451" strokeWidth="1" />
      <path className="costume-cue social-sleep-light" d="m20 7 3-.5" stroke="#c0ffdf" strokeWidth="1.3" />
    </g>;
  }
  return <g className="social-laptop">
    <path d="M39 76q-7 2-11 12-2 8 4 11l7-3-3-7 8-9Z" fill="var(--jacket-dark)" />
    <path d="m29 94 6-4 5 6-7 4Z" fill="var(--trim)" />
    <g strokeWidth="1.6">
      <path d="M8 76q-.4-2 2-2l27 2q1.5 0 2 2l2 15-30-2Z" fill="#7f939f" />
      <path d="m11 77 25 1.8 1.8 11-25-1.6Z" fill="#19303e" stroke="none" />
      <g transform="matrix(1 .07 .16 1 13 79)" fill="none" strokeWidth="1.1">
        <path d="m0 1 2.3 2L0 5" stroke="#8ce1cb" />
        <g className="social-code" transform="translate(4)" stroke="#c1f5dc">
          {/* The four glyphs spell hi() on the tiny terminal. */}
          <path d="M.8 5.7V.8m0 3.2q2.4-2.3 2.4.1v1.6" />
          <path d="M5.7 3v2.7m0-4.5v.1" />
          <path d="M10.9.9q-3.3 2.4 0 5.1" stroke="#ffce79" />
          <path d="M13.4.9q3.3 2.4 0 5.1" stroke="#ffce79" />
        </g>
      </g>
      <path d="m11 91 30 2 10 6-31-2Z" fill="#c2d2d8" />
      <path d="m11 91 9 6 31 2-.8 2-30-2.3-7-4.7Z" fill="#748893" />
      <path d="m18 93 19 1.3 3 1.7-19-1.4Z" fill="#506775" stroke="none" />
    </g>
    <path d="M32 96q1-2 3-1.5l3 2 5 .6q2 .4 1.5 2-.6 2-4 2.4l-3 .5q-4 .4-7-3Z" fill="#ffcf39" strokeWidth="1.8" />
  </g>;
}
