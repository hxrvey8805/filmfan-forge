// Broad leaves and an open collar keep the print legible in the wardrobe swatch.
function IslandPrint({ transform }: { transform: string }) {
  return <g transform={transform} stroke="none">
    <path d="M-3.7 6.8Q-.9 3.5-1.5-.4q-3.4-1.1-5.2 1.2 0-3.9 4.3-3.3Q-6-4.3-7-3.3q.4-2.7 3.4-2.4 2.3.4 3.2 2.7Q2.1-7.6 6.6-6.1 3-5.8 1-2.7q5-3 7.7 1.6Q5-.9 1.8-.7q4.4.4 4.9 4.9Q3.8 1.1.2.2.7 4-2.3 7.1Z" fill="#373539" />
    <path d="M-2.3 2q-3.5 1.6-5.3.4 1.6-2.8 5.4-2.5L.1.6Z" fill="#ffbf8a" />
  </g>;
}

export function ScarShirt() {
  return <g>
    <IslandPrint transform="translate(42 86) rotate(-26) scale(.85)" />
    <IslandPrint transform="translate(76.5 87) rotate(22) scale(1.02)" />
    <path d="m47 74 24-1-9.9 16.3Z" fill="#f7b633" stroke="#842d30" strokeWidth="1.1" />
    <path d="m46.1 74.8 5.8-2.1 9.3 16.2-9.2-6.5-5.9 1.9Zm27.4-2.6-6.3 1.1-6 15.6 9.8-8 4 .3Z" fill="#ff7461" stroke="#76262f" strokeWidth="1.55" />
    <path d="M53.8 78.5q6 12.1 13.6-1" fill="none" stroke="#8c5323" strokeWidth="2.55" />
    <path d="M53.8 78.2q6 12.1 13.6-1" fill="none" stroke="#ffe38c" strokeWidth="1.35" />
    <path className="costume-cue scar-chain-glint" d="m61 81 .7 2.1 2 .7-2 .6-.7 2-.7-2-1.9-.6 1.9-.7Z" fill="#fff9cf" stroke="none" />
    <path d="m61 89-.2 5" stroke="#98343a" strokeWidth="1.25" />
    <circle cx="61" cy="91" r="1" fill="#fff0c9" stroke="none" />
    <path d="M35.1 93q24.1 4.4 49-.9l.8 3.6q-23.6 6.1-48.4 1.4Z" fill="#4f3930" strokeWidth="1.25" />
    <rect x="56.7" y="94.8" width="6.5" height="3.6" rx=".7" fill="#70533c" stroke="#f5cc7c" strokeWidth="1.15" />
  </g>;
}

export function ScarTrousers({ seated = false }: { seated?: boolean }) {
  return <g fill="#e9d8ad" strokeWidth="2">
    <path d={seated
      ? "M41 92q13 4 21-1l13 8-5.5 6.3-16-7.1q-8 3.6-13.7-.2Zm21.5-1.2 15.5-3.5 20.2 8.6-4.6 6-17.7-6-9 2.1Z"
      : "M40.3 93q17.5 3.4 35.3-1.2l2 11.6-12.5 1.1-4.5-7.2-3.5.2-6.4 7-14.2-1.4Z"} />
    <path d={seated ? "m54 96 15.5 6.1m9.5-10.5 14.7 5.7" : "m48.8 97.3-3.6 4.3m23.4-5 2.2 5.6"} fill="none" stroke="#b59e79" strokeWidth="1.2" />
  </g>;
}

export function MontanaCrop() {
  return <g>
    {/* Close cropped, forward combed, with an uneven fringe and tapered sideburns. */}
    <path d="M22 47.5Q19.4 42 20.6 34l-1.4 1.4q-.5-9.5 3-14l.2 2.1q2-7.8 7.2-10.8l-.6 2.6q6-6.1 14-7.4l-1.2 2q9.5-4.4 18.6-3.3l-1.6 1.6q11-2 19.9 2.4l-1.7.7q9.2 2.4 13.6 9.1l-1.6-.5q7 8.3 5.7 16.5l-1.3 11-3.5 3.4-.9-9.6-2.8-3.5-2.1-12q-2.6 4.3-5.5 6l.2-4.6q-3 3.3-7.3 5.1l.5-3.5q-4.2 3.7-10.9 4.8l2.2-4.2q-6.1 3.5-13 4l1.9-3.7q-5.5 2.8-10.2 3.1l1.3-3.7-7 2.1.8-3.1-6.3 3.8-2 6.8-2.8 1.7-1.3 8.5Z"
      fill="#25252c" strokeWidth="2.4" />
    <path d="M26.5 26.5q1.3-5.7 5.9-9.1m6.1 5.9q4.1-7.3 11-9.5m6.5 4.6q3.1-3.1 8.8-4.9m18 5q4.4 3.4 5.6 7.7" fill="none" stroke="#51464a" strokeWidth="1.95" />
  </g>;
}

export function ScarExpression() {
  return <g>
    <path d="m81.8 32-2.6 9.1 1 8.7-1.8 10.8-2 5.7-4.4 5.1" fill="none" stroke="#af6134" strokeWidth="1.8" />
    <path d="m79.1 60.1-2 6.8-3.1 3.8" fill="none" stroke="#ffe794" strokeWidth=".9" />
    <g fill="#33282a" stroke="none">
      <path d="M29.5 39q6.5-6 11.5-5.1l8.9 4.7-1.5 2.8-9.4-3.5Z" />
      <path d="m65 37.5 11.4-4.8 3.9.8-1.5 3.1-3.1-.3-9.4 4.4Zm17.9-3.4q4 .8 6.8 4l-8.2-1.1Z" />
    </g>
  </g>;
}

export function ScarWatch({ seated = false }: { seated?: boolean }) {
  return <g className="scar-watch" transform={seated ? "translate(100.6 79.3) rotate(-16)" : "translate(102.5 75.2) rotate(-33)"}>
    <rect x="-2.55" y="-5.3" width="5.1" height="10.6" rx="1.2" fill="#e7b654" stroke="#61402b" strokeWidth="1.05" />
    <circle r="4.15" fill="#f2c668" stroke="#513329" strokeWidth="1.15" />
    <circle r="2.95" fill="#233334" stroke="none" />
    <path d="M-1.35-1.1 0 .25 1.55-1.35" fill="none" stroke="#fff1ba" strokeWidth="1.05" />
  </g>;
}

export function ScarGreeting() {
  return <g className="geek-wave scar-salute">
    {/* A short sleeve with a strip of bare forearm separates the print from the watch. */}
    <path d="M76.5 74.5q5.2-1.4 8.3 3l5.2-1.6 4.8 7.7-7.7 5.5q-7.8 3.3-11.1-.7Z" fill="var(--jacket-light)" strokeWidth="2" />
    <path d="m86.7 77.8 3.1 1.9-.9 4.4 3.3-2" fill="none" stroke="#463b3b" strokeWidth="1.8" />
    <path d="m91.7 78.5 8.6-5.7 4.7 4.8-10.4 7.2Z" fill="#ffcb35" strokeWidth="1.9" />
    <path d="M102.6 71.8q.9-2.4 1.2-5.2l-.4-3.1q0-2 1.9-2 2 .1 2.7 4.3l.1.5 5.5-10q1.4-2.4 3.3-1.1 1.3.9.3 3.2l-3.6 8 7.1-7.5q1.5-1.7 3-.3 1.2 1.4-.1 3.1l-7.4 9.3 2.6-1.8q1.5-1 2.6.4.8 1.4-.9 3.1l-5 4.7q-3.8 3.2-8.5 1.7Z" fill="#ffce36" strokeWidth="1.9" />
    <path d="m109.9 71.6 3.6 2.5m-.4-1.7 3.5-3.7" stroke="#bc781e" strokeWidth="1.15" fill="none" />
    <ScarWatch />
  </g>;
}
