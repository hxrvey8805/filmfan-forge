import { ArrowRight, ChevronRight, Clapperboard, Coins, Layers3, ShoppingBag, Timer } from "lucide-react";
import { GeekAvatar } from "./GeekAvatar";
import { useGeekOutfit } from "@/hooks/use-geek-outfit";
import "@/pages/play.css";

export type PlayView = "game" | "packs" | "store";

export function PlayHome({ onOpen }: { onOpen: (view: PlayView) => void }) {
  const { look } = useGeekOutfit();
  return <div className="arcade-page arcade-home">
    <header className="arcade-heading"><p className="arcade-kicker"><i />CineGeek Arcade</p><h1>Play</h1></header>
    <section className="game-ticket" aria-labelledby="featured-game">
      <div className="ticket-face">
        <div className="ticket-copy"><span className="ticket-label"><Clapperboard size={14} aria-hidden="true" /> Featured game</span>
          <h2 id="featured-game">Actor<br />Connect</h2>
          <p>Link two actors through the movies and shows they share.</p></div>
        <div className="ticket-art" aria-hidden="true"><div className="ticket-orbit" /><span className="ticket-spark spark-one">✦</span><span className="ticket-spark spark-two">✦</span><GeekAvatar look={look} /></div>
      </div>
      <div className="ticket-stub"><div className="ticket-terms"><span><Timer />2 min</span><span><Coins />75 coin prize</span></div>
        <button className="ticket-start" data-play-link="game" onClick={() => onOpen("game")} aria-label="Play Actor Connect">Play now <ArrowRight size={18} /></button></div>
    </section>
    <section aria-labelledby="counter-title" className="arcade-counter"><h2 id="counter-title">Card counter</h2>
      <button className="arcade-row" data-play-link="packs" onClick={() => onOpen("packs")}><span className="counter-icon mint"><Layers3 /></span><span><strong>Your collection</strong><small>Open packs and see your cast.</small></span><ChevronRight /></button>
      <button className="arcade-row" data-play-link="store" onClick={() => onOpen("store")}><span className="counter-icon coral"><ShoppingBag /></span><span><strong>The store</strong><small>Find card packs and extras.</small></span><ChevronRight /></button>
    </section>
  </div>;
}
