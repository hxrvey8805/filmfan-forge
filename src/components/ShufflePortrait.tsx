import { useEffect, useRef, useState } from "react";

export function ShufflePortrait({ path, name }: { path: string; name: string }) {
  const [mode, setMode] = useState<"analyse" | "original" | "missing">("analyse");
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!photo || mode !== "analyse") return;
    let active = true;
    import("@/lib/shuffle-portrait").then(({ shuffleCrop }) => {
      if (!active || !canvas.current) return;
      const crop = shuffleCrop(photo);
      const output = canvas.current;
      if (!crop) return;
      output.width = crop.w;
      output.height = crop.h;
      const context = output.getContext("2d");
      if (!context) return;
      context.drawImage(photo, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
      setZoomed(true);
    }).catch(() => { /* If pixels cannot be analysed, the original photo stays visible. */ });
    return () => { active = false; };
  }, [photo, mode]);

  return <div className="game-portrait">
    {path && mode !== "missing" ? <>
      <img key={mode} alt={name} className={zoomed ? "zoom-source" : undefined}
        crossOrigin={mode === "analyse" ? "anonymous" : undefined}
        src={`https://image.tmdb.org/t/p/h632${path}`}
        onLoad={event => setPhoto(event.currentTarget)}
        onError={() => { setZoomed(false); setMode(mode === "analyse" ? "original" : "missing"); }} />
      <canvas ref={canvas} hidden={!zoomed} aria-hidden="true" />
    </> : <span aria-hidden="true">{name.split(/\s+/).slice(0, 2).map(word => word[0]).join("")}</span>}
  </div>;
}
