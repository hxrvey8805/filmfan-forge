import { useId } from "react";
import type { Outfit } from "@/hooks/use-geek-outfit";
import { GeekJacketDetails, GeekHeadwear, SchoolWand } from "./GeekCostume";
import { PulpBriefcase, PulpFace, PulpLensLight } from "./PulpCostume";
import { ArenaShield, MaximusBeard } from "./GladiatorCostume";
import { ScarExpression, ScarGreeting, ScarTrousers, ScarWatch } from "./ScarCostume";
import { BrokerPen, BrokerWatch, FallingBanknotes } from "./WolfCostume";
import { CampusComputer } from "./SocialCostume";
import { GameInvitation, PlayerTrackPants } from "./SquidCostume";
import { Crysknife, PaulCurlsBack, SpiceDrift } from "./DuneCostume";
import { CineGeekFrames } from "./GlassesWithLenses";
import { RangerCloak, RangerCurls, RangerSwordHand } from "./NorthernRanger";
import { LoungingSnackArm } from "./FocusRoomSnacks";
import "./geek-sprite.css";

const waveSparkPath = "M113 39l6-10-4 1 7-10M121 51l7-7-4 1 5-5";

// Shared by Home, the title companion and the wardrobe. Gradient IDs are local
// to each sprite so two differently dressed geeks can be on screen together.
export function GeekAvatar({ look, still = false, lounging = false }: { look: Outfit; still?: boolean; lounging?: boolean }) {
  const id = useId().replace(/:/g, "");
  const ink = "#151331";
  const stripes = look === "chucky" ? `url(#${id}-stripes)` : undefined;
  return <svg className="geek-avatar" data-still={still || undefined} data-lounging={lounging || undefined} data-outfit={look} viewBox="0 0 132 120" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={id + "-shell"} x2=".8" y2="1">
        <stop stopColor="#fff18a" /><stop offset=".45" stopColor="#ffd21d" /><stop offset="1" stopColor="#ffac08" />
      </linearGradient>
      <linearGradient id={id + "-jacket"} x2="1" y2="1">
        <stop stopColor="var(--jacket-light)" /><stop offset="1" stopColor="var(--jacket-dark)" />
      </linearGradient>
      {stripes && <pattern id={id + "-stripes"} width="8" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(10)">
        <rect width="8" height="12" fill="#e85155" /><path d="M0 4h8" stroke="#ffdb75" strokeWidth="2.8" />
        <path d="M0 7h8" stroke="#74d7bb" strokeWidth="2.8" /><path d="M0 10h8" stroke="#6096dd" strokeWidth="2.8" />
      </pattern>}
    </defs>
    {!lounging && <ellipse cx="59" cy="112" rx="28" ry="3" fill="#5decde" opacity=".19" />}
    <g key={lounging ? "seated" : look} className="geek-hover" stroke={ink} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      {look === "wolf" && !still && !lounging && <FallingBanknotes />}
      {lounging ? <g transform="translate(120 0) scale(-1 1)">
        {look === "scar" ? <ScarTrousers seated /> : look === "squid" ? <PlayerTrackPants lounging /> : <path d="M45 94q12 3 18-2l11 10m-8-11q14-4 17-1l13 7" fill="none" strokeWidth="8" />}
        <path d="M68 99q4-5 9-3l8 6 5 1q2 4-2 6l-18-3Zm22-4q4-5 8-3l10 5 4 1q2 4-3 6l-17-2Z" fill="var(--shoe, #f3edff)" />
        <path d="m73 104 12 2m10-6 12 2" stroke="var(--shoe-stripe, #9382bf)" strokeWidth="1.7" />
      </g> : <g>
        {look === "scar" ? <ScarTrousers /> : look === "squid" ? <PlayerTrackPants /> : <path d="m48 91-6 12m26-11 3 11" fill="none" strokeWidth="7" />}
        <path d="M40 99q9-2 12 6l-3 3-20-1q1-6 11-8Zm27 2q4-4 10-2l11 5q1 4-4 5l-18-1Z" fill="var(--shoe, #f3edff)" />
        <path d="M32 106h16m21 1 15-1" fill="none" stroke="var(--shoe-stripe, #9881fe)" strokeWidth="2" />
      </g>}
      {look === "matrix" && <path d="M39 76q15-8 39-2l16 32-18-3-6 4-14-11-17 11-17-3Z" fill="#232e36" />}
      {look === "thrones" && <RangerCloak />}
      {look === "hogwarts" && <g>
        <path d="M38 72q17-9 41-2l7 19 9 14-18 2-9-7-11 4-11-5-13 7-12-2 9-16Z" fill="#282838" />
        <path d="m32 91-7 10 9-1 9-7m37-2 8 11-9-1" fill="#803447" strokeWidth="1.3" />
      </g>}
      {look === "jedi" && <g>
        <path d="M39 73q17-12 39-1l14 33-19-1-10-8-10 9-27-1Z" fill="#684832" />
        {!lounging && <g transform="rotate(-19 23 89)">
          <g className="costume-saber-blade">
            <path d="M23 80V36" stroke="#68ff9e" strokeWidth="8" opacity=".28" />
            <path d="M23 80V36" stroke="#75ff9b" strokeWidth="4.8" />
            <path d="M23 80V36" stroke="#e2ffdf" strokeWidth="2.1" />
          </g>
          <rect x="20" y="79" width="6" height="17" rx="2" fill="#acb7bf" strokeWidth="1.5" />
          <path d="M20 82h6m-5 10h5" strokeWidth="1.5" />
        </g>}
      </g>}
      {!lounging && look !== "pulp" && look !== "social" && <g>
        <path d="M37 75q-9 1-12 13l6 3 12-10Z" fill={stripes ?? "var(--jacket-dark)"} />
        {look === "scar" && <path d="m29 81.5 5.7 4.1-4 5.1-6.2-2.8Z" fill="#ffcb35" strokeWidth="1.6" />}
        {look === "squid" && <path d="M37 77q-7 2-10 10" fill="none" stroke="#efeedd" strokeWidth="2.8" />}
        {look === "hogwarts" && <SchoolWand />}
        {look === "dune" && <Crysknife />}
        {look === "wolf" && <BrokerPen />}
        {look === "gladiator" ? <ArenaShield /> : look !== "thrones" && <path d="M24 86q-6-1-7 5t7 7q6 0 9-8Z" fill="var(--glove, #ffbf17)" />}
      </g>}

      {lounging ? <g>
        <path d="M75 74q11 7 24 2l4 6q-17 11-27 5Z" fill={stripes ?? "var(--jacket-light)"} />
        {look === "squid" && <path d="M79 77q11 5 20 1" fill="none" stroke="#efeedd" strokeWidth="2.8" />}
        {look === "scar" && <path d="M88 78.7q6 .7 12-2.2l3 5q-7.5 4.9-15.2 4.4Z" fill="#ffcb35" strokeWidth="1.7" />}
        {look !== "scar" && <path d="m97 76 5-1 4 6-6 3Z" fill="var(--trim)" />}
        <path d="M102 76q4-4 9-2l6 2q4 3 1 5l-5 1q-3 3-8 0Z" fill="var(--glove, #ffda42)" />
        {look === "scar" && <ScarWatch seated />}
        {look === "wolf" && <BrokerWatch seated />}
        {look === "mha" && !still && <path className="hero-spark hero-spark-rest"
          d="m106 71 4-3-1 3 6-3" fill="none" stroke="#88edb1" strokeWidth="1.25" />}
      </g> : look === "scar" ? <ScarGreeting /> : look !== "pulp" && <g className="geek-wave">
        <path d="M80 77q10 2 16-6l7 6q-9 15-23 12Z" fill={stripes ?? "var(--jacket-light)"} />
        {look === "squid" && <path d="M82 80q9 0 15-7" fill="none" stroke="#efeedd" strokeWidth="2.8" />}
        <path d="m95 72 8 6 5-5-8-8Z" fill="var(--trim)" />
        <path d="M101 69q-4-2-5-7l-1-4q1-4 4-1l3 3-2-10q1-4 4-2l3 9 1-13q2-4 5-1l-1 13 4-9q3-3 5 0l-3 12 4-4q3-2 5 1l-5 10q-4 8-12 9Z" fill="var(--glove, #ffda42)" />
        <path d="M104 62q6-1 8 4" fill="none" stroke="var(--glove-seam, #c7770a)" strokeWidth="2" />
        {look === "wolf" && <BrokerWatch />}
        {look === "spider" && <>
          <circle cx="102" cy="73" r="2" fill="#b7d3df" strokeWidth="1.1" />
          {!still && <path className="spider-wave-web" d="M102 73c8 6 21 3 21-4 0-6-8-7-8-2 0 5 8 5 12-2"
            pathLength="1" fill="none" stroke="#d9efff" strokeWidth="1.55" />}
        </>}
        {look === "mha" && !still && <g className="hero-spark hero-spark-wave" fill="none">
          <path d={waveSparkPath} stroke="#2bff91" strokeWidth="3.6" opacity=".28" />
          <path d={waveSparkPath} stroke="#a5ffc0" strokeWidth="1.65" strokeLinejoin="bevel" />
        </g>}
      </g>}


      <path d="M41 71q15-8 32-2 10 5 13 24l-8 5-37 1-8-5q1-15 8-23Z" fill={`url(#${id}-jacket)`} />
      {look !== "squid" && look !== "dune" && look !== "spider" && look !== "scar" && look !== "gladiator" && look !== "wolf" && <path d="M40 74q18 11 37-2l-6 10-12 4-15-6Z" fill="var(--trim)" />}
      <GeekJacketDetails look={look} lounging={lounging} />

      <g className={lounging ? "room-head" : undefined} transform={lounging ? undefined : "rotate(-5 58 45)"}>
        {look === "thrones" && <RangerCurls />}
        {look === "dune" && <PaulCurlsBack />}
        {look === "trek" ? <path d="m31 45-16-8q1 14 12 21Zm59-2 14-12q3 14-10 22Z" fill="#ffbc18" />
          : <path d="M23 49q-7-2-7 5 1 7 9 7m66-16q9-3 10 4 1 7-7 9" fill="#ffbc18" />}
        <path d="M24 44q1-20 26-24 17-4 30 2 14 6 15 24l-1 11q-2 17-24 21l-19 1q-23-1-27-18Z" fill={`url(#${id}-shell)`} />
        {look !== "breaking" && look !== "chucky" && look !== "mha" && look !== "thrones" && look !== "pulp" && look !== "social" && look !== "squid" && look !== "dune" && look !== "scar" && look !== "gladiator" && look !== "wolf" && <g>
          <path d="M22 38q-1-10 6-16l-4-2q5-6 15-6l-2-5q9 1 16 5Q63 6 75 9l-4 5q14 0 20 11-11-3-19-3l-8 7 1-6q-8 0-14 7l-1-5q-14 3-23 16Z" fill="#302641" />
          <path d="M35 21q9-4 15-2m6-2q6-4 11-4" fill="none" stroke="#766093" strokeWidth="2.2" />
        </g>}
        <path d="m32 64 6 1m46-3 5-1" fill="none" stroke="#f39738" strokeWidth="3" />
        {look === "scar" && <ScarExpression />}
        {look === "gladiator" && <MaximusBeard />}
        {look === "pulp" && <PulpFace />}
        <g className="geek-frames">
          <CineGeekFrames frontOnly={look === "pulp"} x="22" y="7" width="74" height="74" color={ink} aria-hidden="true">
            {look === "pulp" && !lounging && <PulpLensLight />}
            <g className={lounging ? "room-gaze" : look === "wolf" ? "broker-glance" : undefined} transform={look === "scar" && !lounging ? "translate(-1 .1)" : undefined}><g className="geek-blink" stroke="none">
              <ellipse cx="6.65" cy="15.15" rx="1.2" ry="1.7" fill={ink} />
              <circle cx="6.95" cy="14.5" r=".43" fill="white" />
              <g className={look === "chucky" ? "costume-wink" : undefined}>
                <ellipse cx="18.65" cy="15.15" rx="1.2" ry="1.7" fill={ink} />
                <circle cx="18.95" cy="14.5" r=".43" fill="white" />
              </g>
            </g></g>
            {look === "scar" && <g stroke="none">
              <path d="M3.1 14.3a3 3 0 0 1 5.9.5q-3.1.1-5.9-.5Z" fill="#39684f" />
              <path d="M15 14.9a3 3 0 0 1 5.8-.9q-2.3-.1-5.8.9Z" fill="#236a80" />
            </g>}
          </CineGeekFrames>
        </g>
        {look === "scar" ? <g fill="none">
          <path d={lounging ? "M50 69q4.8-2.3 9.8.4 3.2 1 7.9-1" : "M48.7 70.8q1.5-4 5.4-3.2l6 1.6q4.3.9 8.6-2"} strokeWidth="2.35" />
          <path d="M57.4 73.4q4.1 1.6 7.5-.5" stroke="#d58835" strokeWidth="1.25" />
        </g> : look === "pulp" ? <path d="M53 71q6 3 14-1" strokeWidth="2.3" fill="none" />
          : lounging ? <path d="M53 69q7 6 15-2" strokeWidth="2.7" fill="none" /> : <g>
          <path d="M51 68q8 4 18-2-2 9-10 9-6-1-8-7Z" fill={ink} strokeWidth="1.4" />
          <path d="M56 72q4-4 10-3-3 5-10 3Z" fill="#ff8bb9" stroke="none" />
        </g>}
        <GeekHeadwear look={look} />
      </g>
      {look === "pulp" && <PulpBriefcase lounging={lounging} />}
      {look === "social" && <CampusComputer lounging={lounging} />}
      {look === "squid" && <GameInvitation lounging={lounging} />}
      {look === "dune" && !lounging && !still && <SpiceDrift />}
      {look === "dune" && lounging && <Crysknife lounging />}
      {look === "thrones" && <RangerSwordHand lounging={lounging} />}
      {lounging && (look === "hogwarts" ? <g>
        <path d="M40 74q-7 0-15 5l-8 2 1 7q12 1 24-7l3-5Z" fill="var(--jacket-dark)" />
        <SchoolWand lounging />
        <path d="M18 79q-6-2-9 2-3 5 2 8l7 1 5-6Z" fill="#ffcd38" />
        <path d="m20 78 6 2-4 9-6-2Z" fill="var(--trim)" strokeWidth="1.7" />
      </g> : <LoungingSnackArm sleeve={stripes ?? "var(--jacket-dark)"} look={look} />)}
    </g>
  </svg>;
}
