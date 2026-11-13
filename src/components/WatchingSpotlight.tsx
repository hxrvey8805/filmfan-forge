import { useContext, useId, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { GeekViewer, useGeekOutfit } from "@/hooks/use-geek-outfit";
import { readBookmark } from "@/lib/viewing-bookmark";
import { formatTimestamp } from "../../supabase/functions/_shared/companion";
import { GeekAvatar } from "./GeekAvatar";
import { PosterArtwork } from "./PosterArtwork";

type WatchingTitle = { id: number; type: "movie" | "tv"; title: string; posterPath: string; year?: number };
const keyOf = (item: WatchingTitle) => item.type + ":" + item.id;
const number = (n: number) => String(n).padStart(2, "0");

export function WatchingSpotlight<T extends WatchingTitle>({ titles, onOpen, onFindTitle }: {
  titles: T[]; onOpen: (title: T) => void; onFindTitle: () => void;
}) {
  const viewer = useContext(GeekViewer);
  const placeId = useId();
  const bookmarks = titles.map(title => readBookmark(viewer, title));
  const latest = bookmarks.reduce((best, saved, i) =>
    (saved?.savedAt ?? 0) > (bookmarks[best]?.savedAt ?? 0) ? i : best, 0);
  const latestTime = bookmarks[latest]?.savedAt;
  const [selection, setSelection] = useState<{ key: string; latestTime?: number }>();
  const selectedIndex = selection?.latestTime === latestTime ? titles.findIndex(title => keyOf(title) === selection?.key) : -1;
  const index = selectedIndex >= 0 ? selectedIndex : latest;
  const title = titles[index];
  const resume = bookmarks[index]?.position;
  const { look } = useGeekOutfit();
  const step = (by: number) => setSelection({ key: keyOf(titles[(index + by + titles.length) % titles.length]), latestTime });
  return <section aria-label="Now watching" className="watch-spotlight">
    <div className="spotlight-heading">
      <p className="spotlight-label"><span />Now watching</p>
      {titles.length > 1 && <div className="spotlight-arrows">
        <span className="spotlight-counter" aria-hidden="true">{number(index + 1)} <i>/</i> {number(titles.length)}</span>
        <button onClick={() => step(-1)} aria-label="Previous currently watching title"><ChevronLeft size={18} /></button>
        <button onClick={() => step(1)} aria-label="Next currently watching title"><ChevronRight size={18} /></button>
      </div>}
    </div>
    {title ? <div className="spotlight-body" aria-live="polite" aria-atomic="true">
      <div className="min-w-0">
        <p className="spotlight-meta">{title.type === "tv" ? "TV series" : "Movie"}{title.year ? " · " + title.year : ""}</p>
        <h2>{title.title}</h2>

      </div>
      <div className="spotlight-poster"><PosterArtwork src={title.posterPath} type={title.type} /></div>
    </div> : <div className="spotlight-body spotlight-empty">
      <h2>What are we watching?</h2>
      <p className="spotlight-meta">Pick a movie or show to meet your geek inside the story.</p>
    </div>}
    <button className="spotlight-open" onClick={() => title ? onOpen(title) : onFindTitle()} aria-describedby={resume ? placeId : undefined}
      aria-label={title ? `Ask your geek about ${title.title}` : "Find your first title"}>
      <span className="spotlight-sprite"><GeekAvatar look={look} /></span>
      <span className="spotlight-invite">
        <strong>{title ? "Ask your geek" : "Find your first title"}</strong>
        <small id={placeId}>{resume ? `Resume · ${resume.mediaType === "tv" ? `S${resume.seasonNumber} E${resume.episodeNumber} · ` : ""}${formatTimestamp(resume.seconds)}`
          : title ? "Here when you need me." : "I saved you a seat."}</small>
      </span>
      <span className="spotlight-launch"><ArrowUpRight size={19} aria-hidden="true" /></span>
    </button>
  </section>;
}
