import { useId } from "react";
import { CineGeekFrames } from "./GlassesWithLenses";
import { FocusRoomSnacks } from "./FocusRoomSnacks";
import { ArenaShield } from "./GladiatorCostume";
import { BrokerPen } from "./WolfCostume";
import { GeekAvatar } from "./GeekAvatar";
import type { Outfit } from "@/hooks/use-geek-outfit";

const tapes = ["#b86a6c", "#56aaa6", "#daae71", "#7c74ae", "#9cbbad", "#aa719c"];
function TapeShelf({ y }: { y: number }) {
  return <g transform={`translate(0 ${y})`}>
    {tapes.map((colour, i) => <g key={colour} transform={`translate(${3 + i * 13} ${i % 2 ? 3 : 0})`}>
      <rect width="12" height={i % 2 ? 37 : 40} rx="1.5" fill={colour} stroke="#403447" strokeWidth="1.7"/>
      <path d="M3 5h6M3 8h6" stroke="#f8dfb5" strokeWidth="1.5"/>
      <path d="M4 27v6m3-8v8" stroke="#373342" strokeWidth="1.6"/>
    </g>)}
  </g>;
}

function FilmCollection() {
  return <g strokeLinejoin="round" strokeLinecap="round">
    <path d="M0 0h119v276L0 305Z" fill="var(--room-timber, #6d4745)" stroke="var(--room-shadow, #40323d)" strokeWidth="3"/>
    <path d="M0 0h103v270L0 289Z" fill="var(--room-shadow, #32423d)"/>
    <path d="m103 0 15 1v275l-15 4Z" fill="var(--room-wood-edge, #8e6152)"/>
    <TapeShelf y={7}/><TapeShelf y={115}/>
    <g stroke="#38313f" strokeWidth="1.7">
      <path d="m79 12 11-2 11 34-11 4Z" fill="#bda079"/><path d="m83 18 7-1m-4 19 7-2" stroke="#fff0c8"/>
      <path d="m1 86 43-1 1 9-44 1Z" fill="#688f8f"/><path d="m4 77 36-1 2 9-40 1Z" fill="#c78d75"/>
      <g transform="translate(9 62) rotate(-6)">
        <rect x="0" y="5" width="26" height="17" rx="1.5" fill="#313443"/>
        <path d="m0 4 25-3 1 5L0 9Z" fill="#ecd6a6"/>
        <path d="m6 4-3 4m12-5-3 4m12-5-3 4" stroke="#333440" strokeWidth="2.5"/>
        <path d="M5 13h16M5 17h8" stroke="#c7bba6" strokeWidth="1.4"/>
      </g>
      <circle cx="69" cy="81" r="17" fill="#b5b1a7"/><circle cx="69" cy="81" r="3" fill="#413b4b"/>
      {[[69,70],[79,78],[76,89],[64,90],[59,78]].map(([x,y])=><circle key={x} cx={x} cy={y} r="3.4" fill="#514653" stroke="none"/>)}
      <path d="m87 92 8-18 7 2-6 17Z" fill="#bb7168"/>
      <path d="m0 194 39-3 1 9-40 4Z" fill="#b49b85"/><path d="m3 185 32-2 3 9-36 3Z" fill="#847893"/>
      <path d="m8 178 25-2 1 7-29 2Z" fill="#789e94"/>
      <path d="m54 185 4-12 9-1 4 12-2 12-14 1Z" fill="#92cabe"/>
      <rect x="54" y="164" width="16" height="12" rx="4" fill="#a1dacf"/><path d="M57 169h3m4 0h3" stroke="#334b50"/>
      <path d="M62 163v-4" stroke="#c2ccc1"/>
      <path d="m81 169 12-2 5 28-11 3Z" fill="#bc8779"/>
    </g>
    {[48,99,155,205].map(y=><g key={y}>
      <path d={`M0 ${y+4} 104 ${y-2}v6L0 ${y+11}Z`} fill="var(--room-wood-edge, #a16e57)" stroke="#493642" strokeWidth="1.8"/>
      <path d={`m1 ${y+6} 98-5`} stroke="#bd8e69" strokeWidth="1.2"/>
      <path className="room-shelf-light" d={`m3 ${y+10} 94-5`} stroke="var(--room-lamplight, #ffce88)" strokeWidth="1.5"/>
    </g>)}
    <path d="m1 220 99-8v57L0 285Z" fill="var(--room-rug, #59616a)" stroke="#493d47" strokeWidth="2.5"/>
    <path d="m50 217-1 61m-9-35 4-1m11-1 4-1" stroke="#303944" strokeWidth="2.4"/>
  </g>;
}

function WallGallery() {
  return <g strokeLinecap="round" strokeLinejoin="round">
    {/* Original genre prints and a ticket from a double feature. */}
    <g transform="translate(247 10)">
      <rect x="3" y="4" width="63" height="78" rx="2" fill="#7e554f" opacity=".45"/>
      <rect width="63" height="78" rx="1.6" fill="#6e4b45" stroke="#333e39" strokeWidth="2.5"/>
      <rect x="5" y="5" width="53" height="68" fill="#eed4a6"/>
      <rect x="9" y="9" width="45" height="60" fill="#312a55"/>
      <circle cx="30" cy="31" r="13" fill="#ffbd64"/><path d="M15 39q15-17 30-16M15 39q16 0 30-16" fill="none" stroke="#84e6cf" strokeWidth="2"/>
      <path d="m12 55 10-13 8 8 7-12 14 17Z" fill="#9474b4"/><path d="M17 61h29m-23 3h17" stroke="#e8d6b9" strokeWidth="1.2"/>
      <path d="M15 19h.5m28-4h.5m4 23h.5" stroke="#fff0d6" strokeWidth="2"/>
    </g>
    <g transform="translate(182 72) rotate(-2)">
      <rect x="2" y="3" width="48" height="71" fill="#885851"/>
      <rect width="47" height="71" fill="#966b55" stroke="#513b41" strokeWidth="2.4"/>
      <rect x="4" y="4" width="39" height="63" fill="#f1d9b2"/><rect x="8" y="8" width="31" height="55" fill="#ef906e"/>
      <circle cx="30" cy="22" r="7" fill="#f8cd84"/><path d="M9 53h29v7H9Zm2-9h5v10h-5Zm8-13h5v23h-5Zm8 8h7v15h-7Z" fill="#464156"/>
      <path d="m11 16 12-1" stroke="#ffe6b4" strokeWidth="1.6"/>
    </g>
    <g transform="translate(246 98) rotate(2)">
      <rect x="2" y="3" width="70" height="53" fill="#90665c"/>
      <rect width="70" height="53" fill="#73554d" stroke="#39423e" strokeWidth="2.5"/>
      <rect x="4" y="4" width="62" height="45" fill="#edcf9e"/>
      <g transform="rotate(-11 35 26)">
        <path d="M10 17h48v5q-5 3 0 6v6H10v-5q5-3 0-6Z" fill="#6b737a"/>
        <path d="M15 12h44v5q-5 3 0 6v7H15v-5q5-3 0-6Z" fill="#df9666" stroke="#a46755" strokeWidth="1.3"/>
        <path d="M46 14v14" stroke="#f4d59e" strokeDasharray="2 2"/>
        <path d="M22 18h17m-17 5h12" stroke="#764c4e" strokeWidth="2"/>
      </g>
    </g>
    <g transform="translate(338 46)">
      <rect x="2" y="3" width="51" height="61" fill="#946b5e"/>
      <rect width="51" height="61" fill="#8b6453" stroke="#513d42" strokeWidth="2.4"/>
      <rect x="4" y="4" width="43" height="53" fill="#f1d7a8"/>
      <rect x="8" y="8" width="35" height="45" fill="#408f91"/>
      <path d="m8 45 11-16 6 8 7-14 11 18v12H8Z" fill="#414e60"/>
      <path d="m16 46 8-11 5 6 4-8" fill="none" stroke="#a6c7af" strokeWidth="1.6"/>
    </g>
  </g>;
}

function WallClock({ time, running }: { time: string; running: boolean }) {
  return <g className="room-wall-clock" transform="translate(128 12) rotate(-2 55 24)" textAnchor="middle" aria-hidden="true">
    <rect x="2" y="4" width="108" height="48" rx="8" fill="#211a2b" opacity=".5"/>
    <rect width="108" height="48" rx="8" fill="#24222e" stroke="#433b43" strokeWidth="2.5"/>
    <rect x="3" y="3" width="102" height="42" rx="6" fill="#201e28" stroke="var(--room-accent,#80bdad)" strokeWidth="1.4"/>
    <circle cx="31" cy="13" r="2.1" fill={running ? "#a0e2ab" : "#887c76"}/>
    <text x="56" y="16" fill="#ead9b5" fontWeight="650" fontSize="9" letterSpacing="2">FOCUS</text>
    <text x="54" y="38" fill="#ffdf99" fontFamily="ui-monospace, Menlo, monospace" fontWeight="600" fontSize={time.length > 6 ? 17 : 23}
      style={{ fontVariantNumeric: "tabular-nums" }}>{time}</text>
  </g>;
}

export function FocusRoomScene({ look, running, styleName, time }: { look: Outfit; running: boolean; styleName: string; time: string }) {
  const prefix = useId().replace(/:/g, "");
  const paint = (name: string) => `url(#${prefix}-${name})`;
  return <svg key={look} className="focus-room-scene" viewBox="0 0 480 480" preserveAspectRatio="xMidYMid meet" role="img"
    aria-label={(running
      ? "Your geek watches the glowing TV from a cherry-red armchair. The lamp is low and the popcorn is within reach."
      : "Your geek looks at you from a cherry-red armchair. The lamp is warm, the TV is off and the popcorn is ready.") + " Room style: " + styleName + "."}>
    <defs>
      <linearGradient id={prefix+"-wall"} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="480" y2="312"><stop stopColor="var(--room-shadow, #3c3859)"/><stop offset=".5" stopColor="var(--room-wall, #655471)"/><stop offset="1" stopColor="var(--room-lit-wall, #aa797b)"/></linearGradient>
      <linearGradient id={prefix+"-floor"} gradientUnits="userSpaceOnUse" x1="0" y1="273" x2="264" y2="480"><stop stopColor="var(--room-floor, #946859)"/><stop offset="1" stopColor="var(--room-floor-dark, #51483e)"/></linearGradient>
      <linearGradient id={prefix+"-velvet"} x2=".85" y2="1"><stop stopColor="#ed786d"/><stop offset=".43" stopColor="#bb3b4c"/><stop offset="1" stopColor="#74273b"/></linearGradient>
      <linearGradient id={prefix+"-velvet-edge"} x2=".2" y2="1"><stop stopColor="#d45a5d"/><stop offset=".45" stopColor="#a63043"/><stop offset="1" stopColor="#672539"/></linearGradient>
      <linearGradient id={prefix+"-slat-light"} x1="0" y1="1" x2=".1" y2="0"><stop stopColor="var(--room-accent, #65d9c4)" stopOpacity=".52"/><stop offset="1" stopColor="var(--room-accent, #65d9c4)" stopOpacity="0"/></linearGradient>
      <radialGradient id={prefix+"-shelf-halo"}><stop stopColor="var(--room-accent, #9294fb)" stopOpacity=".36"/><stop offset="1" stopColor="var(--room-accent, #9294fb)" stopOpacity="0"/></radialGradient>
      <linearGradient id={prefix+"-wood"} x2=".25" y2="1"><stop stopColor="#c58e64"/><stop offset="1" stopColor="#9d6854"/></linearGradient>
      <radialGradient id={prefix+"-lamp"}><stop stopColor="var(--room-lamplight, #ffe4a7)" stopOpacity=".85"/><stop offset=".55" stopColor="var(--room-lamplight, #ffcd86)" stopOpacity=".37"/><stop offset="1" stopColor="var(--room-lamplight, #ffc277)" stopOpacity="0"/></radialGradient>
      <linearGradient id={prefix+"-sun"} x2="1" y2=".5"><stop stopColor="var(--room-accent, #af9cd6)"/><stop offset="1" stopColor="var(--room-lamplight, #edb47c)" stopOpacity=".16"/></linearGradient>
      <radialGradient id={prefix+"-edge"} cx=".56" cy=".37" r=".78"><stop offset=".51" stopColor="var(--room-shadow, #443547)" stopOpacity="0"/><stop offset="1" stopColor="var(--room-shadow, #443547)" stopOpacity=".19"/></radialGradient>
      <linearGradient id={prefix+"-tv"} x2="1" y2=".8"><stop stopColor="#211e2b"/><stop offset=".75" stopColor="#333241"/><stop offset="1" stopColor="#20202d"/></linearGradient>
      <linearGradient id={prefix+"-beam"} x1="0" y1="1" x2="1" y2=".15"><stop stopColor="#b5e6d6" stopOpacity=".4"/><stop offset="1" stopColor="#c1e9d9" stopOpacity="0"/></linearGradient>
      <clipPath id={prefix+"-set"}><rect width="480" height="480"/></clipPath>
      <linearGradient id={prefix+"-ceiling"} x2="0" y2="1"><stop stopColor="#1b1820"/><stop offset="1" stopColor="var(--room-shadow,#3c3859)"/></linearGradient>
      <radialGradient id={prefix+"-can-light"}><stop stopColor="var(--room-lamplight,#ffe4a7)" stopOpacity=".25"/><stop offset="1" stopColor="var(--room-lamplight,#ffe4a7)" stopOpacity="0"/></radialGradient>
      <pattern id={prefix+"-curtain"} width="30" height="20" patternUnits="userSpaceOnUse">
        <rect width="30" height="20" fill="var(--room-shadow,#3c3859)"/><path d="M2 0v20m3-20v20" stroke="var(--room-wall,#655471)" strokeWidth="3" opacity=".4"/>
        <path d="M18 0v20" stroke="#19161f" strokeWidth="7" opacity=".65"/>
      </pattern>
    </defs>
    {/* Extend the set beyond its original square. A tall screen reveals the ceiling
        and near floor; a wide one reveals the side drapes. The seated scene always fits. */}
    <rect x="-2500" y="-2500" width="5480" height="5480" fill="#19171d"/>
    <g>
      <rect x="0" y="-1200" width="480" height="1200" fill={paint("ceiling")}/>
      <g stroke="var(--room-wood-edge,#8e6152)" opacity=".22" strokeWidth="2">
        <path d="M-40-220 109-56m-9-164 75 164m49-164 17 164m91-164-24 164m128-164L374-56m175-164L444-56"/>
      </g>
      {[83,375].map(x=><g key={x} className="room-lamp-glow">
        <ellipse cx={x} cy="-109" rx="37" ry="13" fill={paint("can-light")}/>
        <ellipse cx={x} cy="-110" rx="11" ry="3.2" fill="#211e25" stroke="var(--room-timber,#60554e)" strokeWidth="1.5"/>
        <ellipse cx={x} cy="-109.5" rx="7.5" ry="1.6" fill="var(--room-lamplight,#ffe4a7)"/>
      </g>)}
      <path d="M0-61h480v62H0Z" fill={paint("wall")}/>
      <path d="M0-65h480v8H0Z" fill="var(--room-timber,#594452)"/>
      <path d="M0-57h480" stroke="var(--room-lamplight,#ffda96)" strokeWidth="2.2" opacity=".7"/>
      <path d="M0-11h110l9 8v4H0Z" fill="var(--room-timber,#6d4745)" stroke="var(--room-shadow,#40323d)" strokeWidth="2"/>
      <rect x="120" y="-55" width="35" height="56" fill="var(--room-timber,#494051)"/>
      {[123,131,139,147].map(x=><path key={x} d={`M${x}-55V1`} stroke="var(--room-wood-edge,#576e65)" strokeWidth="4"/>)}
      <rect y="478" width="480" height="700" fill={paint("floor")}/>
      <g stroke="#201d21" strokeWidth="1.4" opacity=".34">
        <path d="M173 480-61 764m367-284L115 860m321-380-73 386M22 480l-86 78m49-18 501-90M-10 629l500-107m-500 211 500-130"/>
      </g>
      <path d="M14 506v9l9-1 1-9m77-11 1 8 7-1 1-9" fill="#46363c"/>
      <rect className="room-lights-down" x="0" y="-1200" width="480" height="2600" fill="var(--room-shadow,#201b38)"/>
    </g>
    <path d="M-1 476h125v16L-1 508Z" fill="#80584f" stroke="#272431" strokeWidth="3"/>
    <path d="M-2500-1200H0v2600h-2500Zm2980 0h2500v2600H480Z" fill={paint("curtain")}/>
    <g clipPath={paint("set")}>

    <path d="M0 0h480v480H0Z" fill={paint("wall")}/>
    <path className="room-lamp-glow" d="M132 12q168 35 348 120v122l-349-28Z" fill={paint("sun")} opacity=".36"/>
    <path d="m0 333 480-60v207H0Z" fill={paint("floor")}/>
    <path d="m0 333 480-60" stroke="var(--room-wood-edge, #845f5c)" strokeWidth="6"/>
    <g stroke="var(--room-floor-dark, #754c44)" strokeWidth="1.2" opacity=".55">
      <path d="m329 291-156 189m233-200L306 480m168-201-38 201M78 321 0 376m222-73L24 480"/>
      <path d="m0 412 480-77M0 460l480-84m-242 84 242-45"/>
    </g>
    <FilmCollection />
    <ellipse cx="135" cy="189" rx="78" ry="140" fill={paint("shelf-halo")}/>
    {/* Acoustic timber slats and a soft uplight at the edge of the media cabinet. */}
    <path d="M119 0h36v307l-36 5Z" fill="var(--room-timber, #494051)"/>
    <g stroke="var(--room-shadow, #403747)" strokeWidth="1.2">
      {[123,131,139,147].map((x,i)=><g key={x}>
        <path d={`M${x} 0v${310-i}l4-1V0Z`} fill="var(--room-wood-edge, #576e65)"/>
        <path d={`M${x+1} 122v${176-i}h2V122Z`} fill={paint("slat-light")} stroke="none"/>
      </g>)}
    </g>
    <WallGallery />

    {/* The light pools on the wall, from the standing lamp just behind the right armrest. */}
    <ellipse className="room-lamp-glow" cx="451" cy="155" rx="120" ry="148" fill={paint("lamp")}/>
    <g stroke="#61474b" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round">
      <ellipse cx="458" cy="383" rx="17" ry="4" fill="#7d5b50"/>
      <path d="M455 153h5v228l-5 1Z" fill="#bb956b"/>
      <path d="m437 108 43-2v66q-24 5-56-5Z" fill="#e3b987"/>
      <path className="room-shade-light" d="m440 111 40-2v58q-24 5-52-3Z" fill="var(--room-lamplight, #f8d99c)" stroke="none"/>
      <path d="m444 116-8 45m18-45-3 46m15-47 2 49" stroke="#cfaa7e" strokeWidth="1.2"/>
      <path d="M447 170v19" strokeWidth="1.4"/><circle cx="447" cy="191" r="2.3" fill="#b68a67"/>
      <g fill="#608675" stroke="#476354">
        <path d="M470 310q-2-31-18-47-3 25 18 47Zm2-7q-3-32 8-44v39Zm1 7q6-21 14-23v27Z"/>
        <path d="m461 314 20-1-2 25-14 1Z" fill="#a56e5d" stroke="#765a52"/>
      </g>
    </g>

    {/* Lower the house lights behind the chair, leaving Geek and the snacks readable. */}
    <rect className="room-lights-down" width="480" height="480" fill="var(--room-shadow, #201b38)" pointerEvents="none"/>
    <WallClock time={time} running={running}/>
    {/* Woven oval rug, oak swivel base and one deep, upholstered seat. */}
    <ellipse cx="266" cy="379" rx="204" ry="61" transform="rotate(-8 266 379)" fill="var(--room-rug, #67516c)" stroke="var(--room-shadow, #493f55)" strokeWidth="3"/>
    <ellipse cx="266" cy="379" rx="190" ry="51" transform="rotate(-8 266 379)" fill="none" stroke="var(--room-weave, #bf9584)" strokeWidth="2"/>
    <ellipse cx="266" cy="379" rx="180" ry="45" transform="rotate(-8 266 379)" fill="none" stroke="var(--room-weave, #a18c76)" strokeWidth="3.5" strokeDasharray="3 8"/>
    <ellipse cx="292" cy="361" rx="103" ry="17" fill="var(--room-shadow, #3a2b43)" opacity=".47"/>
    <g stroke="#492a37" strokeWidth="2.7" strokeLinejoin="round" strokeLinecap="round">
      <path d="m259 330 59-5 4 25-60 7Z" fill="#654840"/>
      <ellipse cx="289" cy="355" rx="65" ry="12" transform="rotate(-4 289 355)" fill="#815d57"/>
      <path d="M228 354q43 10 117-5" fill="none" stroke="#cb9f79" strokeWidth="2.3"/>
      <path d="M193 260q-20-37-14-67 5-27 25-37 23-12 66-13l41 1q35 2 50 24 14 21 16 66l-11 57-158 17Z" fill={paint("velvet-edge")}/>
      <path d="M191 206q-1-30 20-41 23-12 63-13l36 1q33 1 43 26 10 25 10 58l-12 39-144 9Z" fill={paint("velvet")}/>
      <path d="M190 209q-5-31 20-46 32-17 96-13 37 2 48 29" fill="none" stroke="#f2cb8f" strokeWidth="2.8"/>
      <g stroke="#9d3747" fill="none" strokeWidth="2.3">
        <path d="M209 191q-3 28 8 60m8-78q-4 26 6 66m12-72q-3 25 4 47m13-51v38m64-32q17 24 16 66"/>
      </g>
      <path d="M182 245q0-11 12-14 12-2 19 11l16 31 123-12 29 26-23 37-137 16-30-33Z" fill={paint("velvet-edge")}/>
      <path d="m203 276 129-13q20-2 30 11l10 13-17 12-125 15-33-16q-8-8 6-22Z" fill="#d75659"/>
      <path d="m230 311 123-14 19-10-1 13-15 10-126 14-36-16 1-12Z" fill="#a73c4c"/>
      <path d="m228 313 124-15" fill="none" stroke="#efa497" strokeWidth="2"/>
    </g>
    <path d="M191 242q-12-12-19-1-4 7 0 20l8 39q3 10 16 12l12-5-9-49Z" fill="#be4952" stroke="#5a2d3a" strokeWidth="2.5"/>
    <path d="M174 243q5-5 12 1" fill="none" stroke="#eb9081" strokeWidth="2"/>
    <ellipse cx="271" cy="296" rx="59" ry="8" transform="rotate(-6 271 296)" fill="#592939" opacity=".30"/>
    <path className="room-beam" d="m1 272 83-1 256-87 22 110L68 359Z" fill={paint("beam")}/>
    <svg x="174" y="115" width="211" height="198" viewBox="0 0 132 120"><GeekAvatar look={look} lounging /></svg>
    {/* The near arm wraps around the geek, with a ribbed throw folded over it. */}
    <g stroke="#572b39" strokeWidth="2.7" strokeLinejoin="round" strokeLinecap="round">
      <path d="M328 269q7-12 23-17l18-6q12-4 23 4t10 29l-7 37q-2 14-15 19l-39 13-21-12 2-41Z" fill={paint("velvet-edge")}/>
      <path d="m330 268 25-13 17-6q11-3 20 4 7 6 7 14l-45 22-27-5q-4-7 3-16Z" fill="#db5d5e"/>
      <path d="m327 281 26 6 45-21" fill="none" stroke="#f2cb8f" strokeWidth="2.4"/>
      <path d="m323 314 8 4m-7 2 7 4m-7 2 7 4" fill="none" stroke="#d68b83" opacity=".45" strokeWidth="1.5"/>
      <path d="m352 294-4 43" fill="none" stroke="#893849" strokeWidth="2"/>
      <path d="m365 253 13-5 13 4-6 6-16 9-4 35-15 6 4-43Z" fill="#e5ae89" stroke="#a77276" strokeWidth="1.7"/>
      <path d="m356 267 13-7m-14 14 12-6m-13 15 11-5m-12 14 11-5m-11 13 10-4" stroke="#f5d5a6" strokeWidth="2"/>
      <path d="m351 305-1 6m5-8-1 7m6-9-1 7m5-9-1 7" stroke="#d79e80" strokeWidth="1.8"/>
    </g>

    {look === "gladiator" && <g transform="translate(379 333)" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cy="26" rx="22" ry="3.1" fill="#352a2c" opacity=".32" />
      <g transform="scale(1.52)"><ArenaShield resting /></g>
    </g>}

    {/* A low table within reach of the chair. */}
    <g stroke="#5f4548" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round">
      <path d="m109 369 9 3-9 47q-4 2-8 0Zm118 19 10-3 3 45q-4 4-9 1Zm25-25 7-2 4 34-6 2Z" fill="#93624e"/>
      <path d="M80 350q14-20 78-24 74-4 108 15 17 10 8 24-17 22-98 22-77 0-96-22Z" fill="#93614d"/>
      <ellipse cx="176" cy="353" rx="100" ry="28" transform="rotate(-2 176 353)" fill={paint("wood")}/>
      <path d="M97 362q42 16 99 12m-38-24 22 1m49-8 14 1" fill="none" stroke="#c08c69" strokeWidth="1.4"/>
      <FocusRoomSnacks levitate={look === "hogwarts" || look === "jedi"} />
      {look === "wolf" && <BrokerPen onTable />}
    </g>

    {/* We see the back of the foreground TV. The screen faces the armchair. */}
    <g stroke="#272431" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
      <path d="m0 423 80-6 44 15v61L0 508Z" fill="#80584f"/>
      <path d="m0 419 78-6 46 15-86 8-38-7Z" fill="#ad7c63"/>
      <path d="m30 399 12-1-1 14 17 4-2 3-43 1-5-3 21-5Z" fill="#353340"/>
      <path d="m-12 265 91 10q7 1 7 8v124q0 8-6 8l-92-10Z" fill="#697a80"/>
      <path d="m-12 266 87 11q6 1 6 7v120q0 6-5 6l-88-10Z" fill={paint("tv")}/>
      <path d="m-7 296 52 6q8 1 10 9v63q-2 5-8 4l-54-6Z" fill="#343341" stroke="#2b2936" strokeWidth="2"/>
      <path d="m11 311 26 3m-26 3 26 3m-26 3 26 3" stroke="#242330" strokeWidth="2"/>
      <g transform="translate(46 384) rotate(7)">
        <rect width="21" height="14" rx="3" fill="#dfb461" stroke="#544650" strokeWidth="1.3"/>
        <CineGeekFrames x="2" y="-1" width="17" height="16" color="#352f39" aria-hidden="true"/>
      </g>
      <path d="m83 282 1 121" stroke="#748487" strokeWidth="1.8"/>
      <path className="room-tv-rim" d="m83 282 1 121" stroke="#c6f9e3" strokeWidth="2.2"/>
      <circle className="room-tv-power" cx="73" cy="401" r="1.6" stroke="none"/>
    </g>
    <rect width="480" height="480" fill={paint("edge")}/>
    </g>
  </svg>;
}
