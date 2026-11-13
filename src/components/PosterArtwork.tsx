import { useState } from "react";
import { Clapperboard, Tv } from "lucide-react";

export function PosterArtwork({ src, type, lazy = false }: { src?: string; type: "movie" | "tv"; lazy?: boolean }) {
  const [failed, setFailed] = useState<string>();
  const Icon = type === "tv" ? Tv : Clapperboard;
  return <span className="poster-artwork" aria-hidden="true">
    <Icon className="poster-placeholder-icon" strokeWidth={1.4} />
    {src && src !== failed && <img src={src} alt="" loading={lazy ? "lazy" : undefined}
      onError={() => setFailed(src)} />}
  </span>;
}
