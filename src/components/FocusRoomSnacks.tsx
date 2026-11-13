import type { Outfit } from "@/hooks/use-geek-outfit";

// The loose kernel and the one at the Geek's fingertips have the same silhouette.
function Kernel({ toasted = false }: { toasted?: boolean }) {
  return <g strokeLinecap="round" strokeLinejoin="round">
    <path d="M-4 2q-2-2 0-4 1-1 2-1 0-3 3-2 2 0 2 2 3-1 3 2 1 2-1 3-1 2-4 1-3 1-5-1Z"
      fill={toasted ? "#ffd580" : "#fff0bf"} stroke="#ba8a55" strokeWidth=".85" />
    <path d="M-1 1q1-2 3-1" fill="none" stroke="#e7b568" strokeWidth="1.3" />
  </g>;
}

// Separate shoulder and elbow pivots keep the sleeve attached throughout the reach.
export function LoungingSnackArm({ sleeve, look }: { sleeve: string; look: Outfit }) {
  if (look === "jedi") {
    return <g transform="translate(39 79)">
      <g className="room-force-lift">
        <path d="M3-3Q-2-7-8 0l-9 7 4 9q8-2 16-12Z" fill={sleeve} strokeWidth="2" />
        <g transform="translate(-14 8)">
          <g className="room-force-hand">
            <g transform="translate(-5 1)">
              <g className="room-force-fingers">
                <path d="M1-2-9-8q-2-1.3-3 .3-.8 1.5 1.2 2.9l7.4 5.4-9-3.3q-2.2-.8-2.8.9-.4 1.4 1.8 2.4l11.6 4.5 4-1Z" fill="#ffcf3e" strokeWidth="1.65" />
              </g>
            </g>
            <path d="M2 0Q0-2.5-3-3l-2-1q-2.4-1-3.8.9-2.4.7-2.4 3.4-.7 2.9 1.2 4.8 1.9 2.2 5.6 2.2L2 5Z" fill="#ffcf3e" strokeWidth="1.7" />
            <path d="M-7.5-.5q1.8-.4 3.5 1.4" fill="none" stroke="#cd8e25" strokeWidth="1" />
          </g>
        </g>
        <path d="m-18 6 5-2 4.2 10-5 2.6Z" fill="var(--trim)" strokeWidth="1.6" />
      </g>
    </g>;
  }
  const webCatch = look === "spider";
  const trackStripe = look === "squid";
  return <g transform="translate(39 78)">
    <g className="room-snack-shoulder">
      <path d="M-4 1q0-5 4-5t4.5 5l.8 12q.3 5-5 5t-5-4Z" fill={sleeve} strokeWidth="2" />
      {trackStripe && <path d="m-1.5-1 .6 13" fill="none" stroke="#efeedd" strokeWidth="2" />}
      <g transform="translate(0 15)">
        <g className="room-snack-elbow">
          {look === "scar" ? (
            <path d="M-4.2.6q-.3-4.2 3.9-4.3Q3.4-4 4.1.2c.7 3.8-.1 7.2.6 10.1.3 1.1 1.1 2 1.7 3.2q1.3 2.8-.1 4.3-.6.7-1.7.7-1.2 2.4-3.6 2.4-2.9 0-4.1-3.4-1.1-2.8-.4-5.7C-2.7 8.2-4 4.3-4.2.6Z" fill="#ffce38" strokeWidth="1.8" />
          ) : <>
            <path d="M-4 .5q0-4 4-4t4.3 4l.8 9q-4 3-9 .7Z" fill={sleeve} strokeWidth="2" />
            {trackStripe && <path d="m-.8-.3 .4 7" fill="none" stroke="#efeedd" strokeWidth="2" />}
            <path d="M-3 11q-2 3-.4 6.6 1.5 3.1 4.2 3 2-.1 2.9-1.5 3-1 2.3-4.2l-2.5-4.6Z" fill="var(--glove, #ffce38)" strokeWidth="1.8" />
            <path d="M-4.5 7.6q4 .8 9.4-1l.5 4q-4 2.4-9.5 1Z" fill="var(--trim)" strokeWidth="1.5" />
          </>}
          {webCatch && <g transform="translate(-4 10)">
            <circle r="1.7" fill="#acc8d8" strokeWidth="1" />
            <path className="room-kernel-web" d="M0 0C-5 3-5 9-2 12Q0 16 4 16"
              pathLength="1" fill="none" stroke="#e0eafa" strokeWidth="1.15" />
          </g>}
          <g className={webCatch ? "room-web-pull" : undefined}>
            <g transform="translate(0 20) scale(.83)">
              <g className="room-kernel-held"><Kernel /></g>
            </g>
          </g>
        </g>
      </g>
    </g>
  </g>;
}

function PopcornTub({ levitate }: { levitate: boolean }) {
  return <g strokeLinejoin="round">
    <ellipse cx="210" cy="344" rx="29" ry="5" fill="#754c48" opacity=".34" stroke="none" />
    <path d="M181 308q28-6 59-1l-7 33q-24 12-45 2Z" fill="#e17060" stroke="#784445" strokeWidth="2" />
    <path d="m184 311 7 .7 6 31-6-1Zm15 1 7 .4 2 31-7 .4Zm16 .3 7-.5-2 30-7 1Zm15-1.4 7-1.2-6 29-6 2Z" fill="#fff0cf" stroke="none" />
    <path d="M189 341q22 6 43-2" fill="none" stroke="#a35d4f" strokeWidth="1.4" />
    <ellipse cx="211" cy="309" rx="30" ry="7" fill="#ffe1a3" stroke="#96594a" strokeWidth="1.6" />
    {/* Overlapping rows give the buttered popcorn a heaped, uneven crown. */}
    {[[187,305,1.2],[197,301,1.3],[204,296,1.22],[219,298,1.18],[229,301,1.35],[236,306,1.06],
      [193,307,1.25],[208,302,1.35],[222,305,1.45],[201,310,1.16],[214,309,1.25],[230,309,.95]].map(([x,y,s],i) =>
      <g key={x} transform={`translate(${x} ${y}) rotate(${i%2 ? -17 : 16}) scale(${s})`}><Kernel toasted={i%4 === 1}/></g>)}
    <path d="M181 309q29 12 59-1" fill="none" stroke="#fff0cf" strokeWidth="2.8" />
    <g transform="translate(214 292)">
      <g className={levitate ? "room-kernel-levitating" : "room-kernel-on-pile"}>
        <g transform="scale(1.35)"><Kernel /></g>
      </g>
    </g>
  </g>;
}

export function FocusRoomSnacks({ levitate }: { levitate: boolean }) {
  return <g strokeLinecap="round" strokeLinejoin="round">
    <PopcornTub levitate={levitate} />
    {/* A speckled mint mug of cocoa with marshmallows, on a cork coaster. */}
    <ellipse cx="127" cy="350" rx="20" ry="5" fill="#996c57" strokeWidth="1.4" />
    <path d="M113 333q-13-4-13 6 0 8 14 6" fill="none" stroke="#4d6463" strokeWidth="6"/>
    <path d="M113 333q-12-4-12 6 0 6 12 6" fill="none" stroke="#a3d9c6" strokeWidth="3.1"/>
    <path d="M112 330q12-5 29-1l-2 16q-2 6-13 6-11 0-12-5Z" fill="#99d1c1" stroke="#516461" strokeWidth="1.8" />
    <path d="M116 335q0 6 2 9" fill="none" stroke="#def3d9" strokeWidth="2" />
    <path d="m130 344 .3 0m4-3 .4 0m-7 5 .3 0" stroke="#6caa9d" strokeWidth="1.3" />
    <ellipse cx="126.5" cy="330" rx="14" ry="4.1" fill="#694236" stroke="#daead2" strokeWidth="2" />
    <path d="m119 329 4-1 2 2-5 1Zm9 1 4-2 3 1-2 2Z" fill="#fff0d7" stroke="none"/>
    <g className="room-mug-steam" fill="none" stroke="#f6dec6" opacity=".72" strokeWidth="1.5">
      <path d="M124 325q-5-4-1-9t-1-8" />
      <path d="M132 325q-3-3 .5-6.5t0-6" strokeWidth="1.2" />
    </g>
    {/* Two chocolate chunk cookies on a glazed saucer, one already nibbled. */}
    <ellipse cx="166" cy="360" rx="27" ry="7.5" fill="#efe6ca" stroke="#658880" strokeWidth="1.8" />
    <path d="M143 362q21 7 44-1" fill="none" stroke="#a0beb0" strokeWidth="1.2" />
    <g stroke="#975c3f" strokeWidth="1.3">
      <path d="M144 355q0-6 10-8 9-1 14 5l-2 5q-12 5-21 1Z" fill="#d89857" />
      <path d="M159 354q4-7 14-6 8 0 12 5-4-1-5 2-3 0-3 3-8 6-16 2-4-2-2-6Z" fill="#efb66e" />
      <path d="M146 356q3 2 9 1m6 .6q6 3 12 0" fill="none" stroke="#be804d" strokeWidth="1.2" />
    </g>
    <path d="m149 353 3-2 2 2-3 2Zm7-4 3 1-1 2-3-1Zm9 4 4-1 1 2-3 2Zm9-2 3 1-1 2-3-1Zm-4 6 3-1 1 2-3 1Z" fill="#69453e" stroke="none" />
    <path d="m182 358 1-1m3-.3 1 0" stroke="#b78257" strokeWidth="1.7" />
    <g transform="rotate(-17 247 353)" strokeWidth="1.5">
      <rect x="234" y="348" width="29" height="10" rx="4" fill="#353346"/>
      <circle cx="239" cy="352" r="1.5" fill="#ed927d" stroke="none"/><path d="M245 351h6m-6 3h4m5-1h4" stroke="#c4bac6" strokeWidth="1.3"/>
    </g>
  </g>;
}
