import type { Outfit } from "@/hooks/use-geek-outfit";
import { RangerArmour, RangerFace } from "./NorthernRanger";
import { CampusHoodie, SocialHair } from "./SocialCostume";
import { PlayerHair, PlayerTracksuit } from "./SquidCostume";
import { ArenaArmour, MaximusCrop } from "./GladiatorCostume";
import { MontanaCrop, ScarShirt } from "./ScarCostume";
import { BrokerHair, BrokerSuit } from "./WolfCostume";
import { PaulFringe, Stillsuit } from "./DuneCostume";

const hoodieWebStitch = "M1 9 0 0 4.8 8 M0 0 9 4.2 M.55 4.95Q1.8 5.1 2.64 4.4q1.5-.1 2.31-2.09 M1 9q2.5.2 3.8-1 2.8-.6 4.2-3.8";

export function SchoolWand({ lounging = false }: { lounging?: boolean }) {
  return <g className="school-wand" transform={lounging ? "translate(15 84) rotate(158) scale(.74)" : "translate(23 92) rotate(-20)"}>
    <g className={lounging ? "room-wand-lift" : undefined}>
      <path d="M-1.8 5q-2-1-1.4-4l.9-7 1.1-13L1-34l1 1-1.2 27 1 8q.2 3-3.6 3Z" fill="#a8744d" strokeWidth="1.4" />
      <path d="m-2.5-4 3.7 1m-3.7 2 3.8 1" fill="none" stroke="#edc786" strokeWidth="1.1" />
      <g className={lounging ? "room-wand-glint" : "costume-cue wand-spark"} stroke="none">
        <path d="m1-40 1.6 4.1 3.8 1.5-3.8 1.4L1-29l-1.3-4-4.1-1.4 4-1.5Z" fill="#ffe2a2" />
        {!lounging && <path d="m7-44 1 2.4 2.3.8-2.2 1L7-37.6l-.8-2.2-2.3-.9 2.3-.9Z" fill="#f5ba70" />}
      </g>
    </g>
  </g>;
}

export function GeekJacketDetails({ look, lounging = false }: { look: Outfit; lounging?: boolean }) {
  switch (look) {
    case "wolf":
      return <BrokerSuit />;
    case "gladiator":
      return <ArenaArmour />;
    case "scar":
      return <ScarShirt />;
    case "dune":
      return <Stillsuit lounging={lounging} />;
    case "squid":
      return <PlayerTracksuit />;
    case "social":
      return <CampusHoodie />;
    case "pulp":
      return <g>
        <path d="m43 73 32-3 6 25-14 5-8-5-10 6-13-5Z" fill="#282732" />
        <path d="m46 73 28-2-13 22Z" fill="#fff3df" strokeWidth="1.3" />
        <path d="m55 75 9-.5-3 5 2 9-2.5 4.3-3.8-4.2.7-9.3Z" fill="#201e27" strokeWidth="1.15" />
        <path d="m41 73 6-.8 9.7 20.5-17-10 5-3Zm36-2-5 1-8.5 21 16.5-13-6-2Z" fill="#41404a" strokeWidth="1.55" />
        <path d="m71 87 6-1-1.5-2-2 1Z" fill="#fff4df" stroke="none" />
        <path d="m69 88 10-1" stroke="#141522" strokeWidth="1.4" />
        <circle cx="60" cy="95" r="1.15" fill="#aaa5a5" stroke="none" />
      </g>;
    case "thrones":
      return <RangerArmour />;
    case "hogwarts":
      return <g>
        <path d="m40 74 12-3 9 12 9-13 9 1-7 26-29 2Z" fill="#706879" strokeWidth="1.5" />
        <path d="m50 74 19-2-8 14Z" fill="#f5e4cc" strokeWidth="1.2" />
        <path d="m39 74 7-2 12 23-19-12 5-3Zm38-2-5-1-10 23 18-14-6-2Z" fill="#333342" strokeWidth="1.5" />
        <path d="M36 72q21 8 42-3l3 8q-12 7-31 8l-12-5Z" fill="#a7394c" strokeWidth="1.8" />
        <path d="m47 77 1 6m5-5 1 6m14-9 2 6" stroke="#f5c65f" strokeWidth="2.6" />
        <path d="m45 79 10 3-5 20-12-3Z" fill="#b13d51" strokeWidth="1.6" />
        <path d="m43 87 9 3m-11.5 5 9 3" fill="none" stroke="#f3c362" strokeWidth="2.9" />
        <path d="m39 99-1 3m4-2-1 3m5-2-1 3m4-2-1 3" stroke="#dba95d" strokeWidth="1.4" />
        <path d="m69 84 8-1 .7 5q-1 3-4 5-4-1-5-4Z" fill="#b14c50" stroke="#e4c37c" strokeWidth="1.2" />
        <path d="m71 86 .5 4m3-4 .5 4m-3.6-2 3.3-.4" fill="none" stroke="#ffe2a2" strokeWidth=".95" />
      </g>;
    case "spider":
      return <g>
        <path d="M31 71q3-8 13-8l30-2q10 0 14 6l-3 8q-12 4-26 5-16 1-27-4Z" fill="#d54154" strokeWidth="1.8" />
        <path d="M34 69q12 1 25 0l25-4-1 5q-10 6-24 8-15 1-25-5Z" fill="#263953" strokeWidth="1.3" />
        <g fill="none" stroke="#972e48" strokeWidth="1">
          <path d={hoodieWebStitch} transform="translate(38 82)" />
          <path d={hoodieWebStitch} transform="translate(80 81) scale(-1 1)" />
        </g>
        <path d="m47.5 79.9 .7 4.4m22.4-5.8-.7 4.5" fill="none" stroke="#f7c3bc" strokeWidth="1.3" />
        <g transform="translate(59 89)" fill="#17283e">
          <path d="M-1.2-2.1-4.2-3.5-5.7-5.8 M1.2-2.1 4.2-3.5 5.7-5.8
                   M-1.4-1-5.8-2-8.2-4 M1.4-1 5.8-2 8.2-4
                   M-1.7.8-6.1 1.7-8.1 4 M1.7.8 6.1 1.7 8.1 4
                   M-1.3 2.7-4 4-5.1 6.3 M1.3 2.7 4 4 5.1 6.3"
            stroke="#17283e" strokeWidth="1.35" fill="none" />
          <path d="M-1.25-2.1q-1-2.2 1.25-2.2t1.25 2.2q2.2 1.8 1 4.3L0 4.7l-2.2-2.5q-1.2-2.5.95-4.3Z" stroke="none" />
        </g>
        <path d="m43 94.8 4.4-2.5m25-.7 4.5 2.1" fill="none" stroke="#9b3148" strokeWidth="1.35" />
      </g>;
    case "peaky":
      return <g>
        <path d="m44 74 30-2 4 22-10 4-8-3-6 4-13-4Z" fill="#8c7d6c" strokeWidth="1.6" />
        <path d="m49 75 20-2-9 15Z" fill="#f1e5cd" strokeWidth="1.4" />
        <path d="m55 76 8-.6-2.6 4.1 1.2 5-2.8 3-3.5-3 1.7-5Z" fill="#823e48" strokeWidth="1" />
        <path d="m40 73 7-.5 8 21-15-11 4-3Zm38-2-7 1-8 19 17-12-6-2Z" fill="#414b57" strokeWidth="1.5" />
        <path d="m44 86 3 2 3-1m-8 3 3 2 3-1m16 2 4-1" fill="none" stroke="#c6af8f" strokeWidth="1" />
        <circle cx="59" cy="91" r="1.2" fill="#423a36" stroke="none" />
        <g className="costume-tilt watch-fob">
          <path d="M73 83q4 6-2 9" fill="none" stroke="#eed293" strokeWidth="1.8" />
          <circle cx="70.5" cy="94" r="3.8" fill="#efd395" stroke="#604a39" strokeWidth="1.4" />
          <path d="m70.5 92-.3 2 1.6.5" fill="none" stroke="#685042" strokeWidth=".95" />
        </g>
      </g>;
    case "classic":
      return <g>
        <path d="m47 80 2 8m12-6v7" fill="none" stroke="#faf4ff" strokeWidth="2" />
        <g transform="rotate(-10 71 88)" strokeWidth="1.1">
          <rect x="65" y="86" width="12" height="6" rx="1.4" fill="#ffd12d" />
          <g className="costume-tilt clapper-lid">
            <rect x="65" y="83" width="12" height="3.3" rx=".8" fill="#ffdc65" />
            <path d="m69 83-2 3m7-3-2 3" fill="none" />
          </g>
        </g>
      </g>;
    case "matrix":
      return <g>
        <path d="m34 70 16 4 11 22-19-13 2-5Z" fill="#425052" />
        <path d="m85 69-15 5-9 22 19-14-4-4Z" fill="#323f43" />
        <path d="M47 87v5m0 3v3m6-12v3m0 3v4m17-9v5m5-4v3" stroke="#70f6a1" strokeWidth="1.8" />
        {!lounging && <path d="M16 60v5m0 4v2m5-16v4m0 4v4m-9 0v2" stroke="#7dff98" strokeWidth="1.6" />}
        <path className="costume-code" d={lounging ? "M48 85v3m5-4v2m19 0v3" : "M16 59v4m5-9v3m-9 8v2m9-5v3"}
          fill="none" stroke="#bdffd3" strokeWidth="1.9" />
      </g>;
    case "jurassic":
      return <g>
        <path d="m39 73 16 2 19-4 4 7-15 7-5 7-6-10-13-6Z" fill="#e6523b" />
        <path d="m66 79 12 8-2 5-13-10Z" fill="#c73f30" />
        <path d="m40 85 12 1-2 6-8-1Z" fill="#7096a5" strokeWidth="1.3" />
        <g transform="rotate(14 72 91)" fill="#f3db99" stroke="none">
          <DinoTrack />
          {lounging && <g className="costume-cue" fill="#fff7cf"><DinoTrack /></g>}
        </g>
        {!lounging && <g fill="#f3d58a" stroke="none">
          <g transform="translate(14 80) rotate(-18) scale(.73) translate(-72 -90)"><g className="costume-cue"><DinoTrack /></g></g>
          <g transform="translate(18 70) rotate(14) scale(.66) translate(-72 -90)"><g className="costume-cue track-next"><DinoTrack /></g></g>
        </g>}
      </g>;
    case "jedi":
      return <g>
        <path d="m40 74 12 1 16 18-10 2-17-14Z" fill="#d7c09b" />
        <path d="m78 73-10 2-19 21 10 1 23-18Z" fill="#f2dfb6" />
        <path d="m37 90 46-3 1 7-47 4Z" fill="#574037" />
        <rect x="57" y="89" width="9" height="5" rx="1" fill="#c7ad7d" strokeWidth="1.2" />
        {lounging && <g transform="rotate(18 78 91)" strokeWidth="1.2">
          <rect x="75" y="83" width="5" height="16" rx="1.5" fill="#9ba7ac" />
          <path d="M75 86h5m-5 9h5" fill="none" />
          <circle cx="77.5" cy="89" r="1.5" fill="#376952" stroke="none" />
          <circle className="costume-cue" cx="77.5" cy="89" r="2" fill="#9bffad" stroke="none" />
        </g>}
      </g>;
    case "chucky":
      return <g>
        <path d="m39 74 7-1 4 10 17-1 3-10 7 2-4 12 5 9-37 3 2-12Z" fill="#517bc9" />
        <circle cx="47" cy="83" r="2.2" fill="#ffd555" strokeWidth="1" />
        <circle cx="70" cy="82" r="2.2" fill="#ffd555" strokeWidth="1" />
        <path d="m51 87 14-1-1 6-6 3-6-2Z" fill="#7fa5eb" strokeWidth="1.4" />
        <path d="m54 89 8-1" stroke="#ffcf89" strokeWidth="1.3" />
      </g>;
    case "karate":
      return <g>
        <path d="m43 72 9 1 22 21-9 2-23-19Z" fill="#f2ead9" />
        <path d="m77 72-8 1-25 23 10 1 25-20Z" fill="#fffaf0" />
        <path d="m36 90 47-2 1 7-48 3Z" fill="#242331" />
        <path d="m59 93 5-2 10 11-4 2-8-8-7 7-4-2Z" fill="#302d3b" />
        <path d="m68 100 3-2" stroke="#e6ba69" strokeWidth="1.5" />
      </g>;
    case "mha":
      return <g>
        <path d="m38 79 8 3 5 10-7 3-8-11Zm42-3-7 5-3 10 8 2 5-9Z" fill="#233d48" strokeWidth="1.6" />
        <path d="M40 74q17 8 38-3l-3 10q-5 6-16 8-11-1-17-6Z" fill="#bdcfcd" strokeWidth="1.9" />
        <path d="m48 80 1 3m6-2 1 4m6-4v3.5m6-5 1 3" fill="none" stroke="#435761" strokeWidth="2.1" />
        <path d="M36 92q22 3 47-3l1 6q-25 7-48 3Z" fill="#b83c49" strokeWidth="1.5" />
        <rect x="53" y="92.5" width="11" height="5.5" rx="1.5" fill="#e4e1c7" strokeWidth="1.4" />
        <path d="m42 93 4 .3m26-1 5-1" stroke="#fa8071" strokeWidth="1.6" />
      </g>;
    case "breaking":
      return <g>
        <path d="m43 74 10 4 6 18-14-9 3-4Z" fill="#b99e73" />
        <path d="m79 73-11 4-8 19 17-12-4-3Z" fill="#d4be91" />
        <path d="m59 96 5-16" stroke="#e6deaf" strokeWidth="1.5" />
        <path d="m70 89 8-2" stroke="#564938" strokeWidth="2" />
      </g>;
    case "stranger":
      return <g>
        <path d="m38 80 15 1 12 7 18-5 1 5-19 6-13-8-16-1Z" fill="#7aedcf" stroke="none" />
        <path d="m39 77 15 1 12 7 16-5" fill="none" stroke="#ffe175" strokeWidth="3" />
        <path d="m59 80 2 16" stroke="#dceafa" strokeWidth="1.7" />
        <g transform={lounging ? "translate(62 34) scale(.64)" : "rotate(-11 24 87)"}>
          <path d="M21 84V73" stroke="#93b5cc" strokeWidth="3" />
          <rect x="17" y="81" width="12" height="17" rx="3" fill="#30344a" strokeWidth="1.8" />
          <path d="M20 86h6" stroke="#7aedcf" strokeWidth="2" />
          <path d="M20 92h5m-5 3h5" stroke="#91a7b8" strokeWidth="1.2" />
          {lounging ? <path className="costume-cue" d="M20 86h6" stroke="#cbfff1" strokeWidth="2.6" />
            : <path className="costume-cue" d="M17 77q-3-3 0-6m-4 8q-5-5-1-11" fill="none" stroke="#9ef9df" strokeWidth="1.7" />}
        </g>
      </g>;
    case "trek":
      return <g>
        <path d="M40 75q16 6 35-2l6 4 2 5-12 2-4-3-9 5-11-5-10 3Z" fill="#25283a" />
        <path d="m71 91 3-8 4 6-3-1Z" fill="#ffdc69" strokeWidth="1" />
        <path className="costume-cue" d={lounging ? "m72 88 2-4 1 2" : "M79 86q3 2 2 5m1-8q5 3 4 9"}
          fill="none" stroke="#ffe8a2" strokeWidth="1.6" />
        <path d="m44 82 1 2m3-3 1 2" stroke="#ffdc69" strokeWidth="1.7" />
      </g>;
  }
}

function DinoTrack() {
  return <>
    <path d="m69 93 1-4 3-1 3 4-3 2Z" />
    <ellipse cx="68" cy="88" rx="1.2" ry="2" /><ellipse cx="72" cy="86" rx="1.2" ry="2.2" /><ellipse cx="76" cy="87" rx="1.2" ry="2" />
  </>;
}

export function GeekHeadwear({ look }: { look: Outfit }) {
  switch (look) {
    case "wolf":
      return <BrokerHair />;
    case "gladiator":
      return <MaximusCrop />;
    case "scar":
      return <MontanaCrop />;
    case "dune":
      return <PaulFringe />;
    case "squid":
      return <PlayerHair />;
    case "social":
      return <SocialHair />;
    case "thrones":
      return <RangerFace />;
    case "peaky":
      return <g>
        <path d="M19 29q9-17 32-22 19-4 33 2 11 5 12 16l-5 8-29-3-33 5Z" fill="#738287" />
        <path d="M23 27q12-13 29-17m14-2q-11 6-19 17m25-16q12 5 15 15" fill="none" stroke="#4c5c63" strokeWidth="1.8" />
        <path d="m35 20 3-2 3 1m5-4 3-2 3 1m3 4 3-2 3 1m5-4 3-2 3 1m4 6 3-2 3 1" fill="none" stroke="#adbbb5" strokeWidth="1.3" />
        <path d="M21 27q28-7 62-4l12 2-4 7q-27-6-62 3Z" fill="#47565c" strokeWidth="1.8" />
        <path d="M14 31q17-7 47-7l23 1q-15 3-30 4l-31 7q-10 2-14-1Z" fill="#626f73" strokeWidth="2" />
        <path d="M15 33q15-5 34-7" fill="none" stroke="#c4c7b7" strokeWidth="1.4" />
      </g>;
    case "mha":
      return <g>
        <path d="M22 48 18 38l-6 2 6-13-8-2 14-7-5-5 14-1 1-7 11 5 9-8 3 7 14-7-1 7 15-4-4 8 14 1-6 6 12 6-8 3 6 10-7-2-2 10-6-11-1-9-7 5-1-7-12 10 2-10-11 7-2-5-11 9 1-6-9 8-4-3Z" fill="#194e49" />
        <path d="m22 26 12-9-2 5 13-7-2 6 11-7-1 5-10 8 2-6-9 7 1-4-10 8Z" fill="#39a472" stroke="none" />
        <path d="m55 18 12-9-2 7 9-4-5 7 10-3-7 7 1-4-10 6 2-7-9 5Z" fill="#59cd8c" stroke="none" />
        <path d="m82 20 6 2-3 2 6 3" fill="none" stroke="#308569" strokeWidth="1.8" />
        <g fill="#99543c" stroke="none">
          <circle cx="32" cy="65" r="1.35" /><circle cx="37" cy="66.5" r="1.25" /><circle cx="34.5" cy="69" r="1.1" />
          <circle cx="81" cy="64" r="1.35" /><circle cx="86" cy="63" r="1.25" /><circle cx="84" cy="67" r="1.1" />
        </g>
      </g>;
    case "breaking":
      return <g>
        <g className="costume-tilt hat-tip">
          <path d="M29 29 32 12q0-5 6-6 17-3 34-1 6 0 8 5l6 18Z" fill="#302e36" />
          <path d="M38 10q16-4 33-2" fill="none" stroke="#77717b" strokeWidth="2.2" />
          <path d="m30 22 53-2 3 8-57 2Z" fill="#68616b" strokeWidth="1.4" />
          <path d="M17 28q8 0 14-2l52-2 11-4q4-1 3 3-3 8-14 9l-53 4q-12 0-15-4-1-3 2-4Z" fill="#37343a" />
          <path d="m18 29 13 1 49-3 13-4" fill="none" stroke="#9a9095" strokeWidth="1.4" />
        </g>
        <path d="M48 64q6-2 11 1 4-3 10-2l5 5-2 8q-4 6-12 6-9 0-14-6l-1-7Z
                 M49 70q2 9 11 9 9-1 10-11-5-2-10 1-5-2-11 1Z" fill="#604039" fillRule="evenodd" stroke="none" />
      </g>;
    case "stranger":
      return <g>
        <path d="M25 28q0-16 15-21 17-5 34 1 10 3 12 15l-10 3-43 7Z" fill="#e95753" />
        <path d="M42 27q0-12 10-22 13-3 22 3 9 6 11 14Z" fill="#fff1c6" strokeWidth="1.8" />
        <path d="M25 28q25-6 55-8l17-2q6 0 6 4-2 4-18 6l-56 6Z" fill="#47bfc2" />
        <path d="m59 17 5-6 6 4" fill="none" stroke="#e95753" strokeWidth="2.4" />
        <path d="m30 17 4-3m-5 7 6-4" stroke="#ffc1a3" strokeWidth="1.6" />
      </g>;
    case "matrix":
      return <g>
        <path d="M90 44q8 0 7 9l-3 6q-3 7 1 11" fill="none" stroke="#586969" strokeWidth="2.4" />
        <rect x="91" y="47" width="7" height="10" rx="3" fill="#293538" strokeWidth="1.5" />
        <path d="M94 50v3" stroke="#77ff9f" strokeWidth="2" />
      </g>;
    case "jurassic":
      return <g>
        <path d="m30 26 7-15q2-5 9-5l9 3 13-3q7-1 11 5l8 14Z" fill="#c0a375" />
        <path d="m40 12 10-2 6 3 10-3" stroke="#e7d3a5" strokeWidth="2.3" fill="none" />
        <path d="m32 21 52-1 3 6-57 3Z" fill="#785436" strokeWidth="1.5" />
        <path d="M12 23q13 4 24 2l45-3 15-5q6-1 5 3-3 7-13 10l-49 6q-19 1-26-6-5-5-1-7Z" fill="#d9bd88" />
        <path d="M16 27q10 5 23 4l46-5 11-5" fill="none" stroke="#f5dfaa" strokeWidth="1.5" />
      </g>;
    case "chucky":
      return <g>
        <path d="M22 51q-4-6-1-15l-7 4q1-11 9-18l-8 1q5-9 18-12l-5-4q12-4 25 0l8-5 2 5q16-6 26 1l-5 2q11 3 16 13l-6-2q6 10 4 23l-5-5 2 13-7-6-3-15q-8-4-14-12l-1 9-11-8q-10 10-21 13l5-9q-13 6-20 21l-2-6Z" fill="#cc592e" />
        <path d="M26 26q9-11 22-12m1 8 11-9m6-1q12 2 19 12" fill="none" stroke="#ffb16a" strokeWidth="2.6" />
        <g fill="#975141" stroke="none">
          <circle cx="34" cy="64" r="1.5" /><circle cx="39" cy="66" r="1.3" />
          <circle cx="81" cy="62" r="1.6" /><circle cx="85" cy="65" r="1.3" />
        </g>
      </g>;
    case "karate":
      return <g>
        <path className="costume-tilt headband-tail" d="m28 31-7 3-11-3 6 7 11 1-13 8 12-1 9-10Z" fill="#eee6d4" />
        <path d="M23 28q31-5 65-3l3 8q-33-2-67 4Z" fill="#fff8e8" />
        <circle cx="59" cy="29.5" r="4.5" fill="#c84242" stroke="none" />
        <path d="m34 30 9-1m31 0 8 1" stroke="#3a3542" strokeWidth="1.4" />
      </g>;
    default:
      return null;
  }
}
