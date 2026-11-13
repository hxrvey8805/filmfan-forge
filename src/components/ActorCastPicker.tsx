import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, Search } from "lucide-react";
import { Input } from "./ui/input";
import type { GameCastMember } from "../../supabase/functions/_shared/actor-cast";

export function CastArt({ path, name, size, className }: { path: string; name: string; size: string; className: string }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const url = path ? `https://image.tmdb.org/t/p/${size}${path}` : undefined;
  if (url && url !== failedUrl) {
    return <img src={url} alt={name} className={className} onError={() => setFailedUrl(url)} />;
  }
  return <span aria-hidden="true" className={`grid place-items-center bg-gradient-to-br from-primary/20 to-secondary text-primary font-semibold ${className}`}>
    {name.split(/\s+/).slice(0, 2).map(word => word[0]).join('')}
  </span>;
}
export function ActorCastPicker({ cast, title, currentId, targetId, error, onSelect, onBack }: {
  cast: GameCastMember[]; title: string; currentId?: number; targetId?: number; error: boolean;
  onSelect: (actor: GameCastMember) => void; onBack: () => void;
}) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(24);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const node = heading.current;
    if (!node) return;
    node.focus({ preventScroll: true });
    const headerBottom = document.querySelector(".app-header")?.getBoundingClientRect().bottom ?? 0;
    if (node.getBoundingClientRect().top < headerBottom) node.scrollIntoView({ block: "start" });
  }, []);
  const term = query.trim().toLowerCase();
  const sections = useMemo(() => {
    const visible = cast.filter(actor => !term || [actor.name, actor.character].some(value => value?.toLowerCase().includes(term)));
    const main = (actor: GameCastMember) => actor.order != null && actor.order < 10;
    return [
      { label: "Main cast", portraits: true, people: visible.filter(main) },
      { label: cast.some(main) ? "Supporting cast" : "Cast", portraits: false, people: visible.filter(actor => !main(actor)) },
    ].filter(section => section.people.length);
  }, [cast, term]);
  return <div className="cast-picker">
    <button className="cast-back" type="button" onClick={onBack}><ArrowLeft size={15} aria-hidden="true" /> Back to credits</button>
    <h2 ref={heading} tabIndex={-1} className="play-section-title">Cast of {title}</h2>
    {cast.length > 0 && <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <Input type="search" aria-label="Search cast" placeholder="Search actor or character…" value={query}
        onChange={event => { setQuery(event.target.value); setLimit(24); }} className="pl-9 bg-secondary" />
    </div>}
    {sections.map(({ label, portraits, people }) => <section key={label}>
      <h3 className="cast-group">{label}</h3>
      <div className={portraits ? "cast-portraits" : "cast-rows"}>
        {people.slice(0, limit).map(actor => {
          const current = actor.id === currentId;
          const target = actor.id === targetId;
          return <button key={actor.id} className="cast-choice" type="button" disabled={current}
            data-target={target || undefined} onClick={() => onSelect(actor)}>
            <CastArt path={actor.profilePath} name={actor.name} size={portraits ? "w342" : "w185"} className="cast-photo" />
            <span className="cast-person"><strong>{actor.name}</strong>
              {actor.character && actor.character !== "Unknown" && <small>{actor.character}</small>}
            </span>
            {current || target ? <span className="cast-status">{current ? "Current" : "Target"}</span>
              : !portraits && <ChevronRight size={16} aria-hidden="true" />}
          </button>;
        })}
      </div>
      {people.length > limit && <button className="cast-more" type="button"
        onClick={() => setLimit(count => count + 24)}>Show more cast · {people.length - limit} left</button>}
    </section>)}
    {sections.length === 0 && <p role="status" className="cast-empty">
      {error ? "This cast couldn’t load. Go back to credits to try again." : term ? "No matches. Try an actor or character name." : "No cast is listed for this title. Try another credit."}
    </p>}
  </div>;
}
