import { useId, useState } from "react";
import { Shirt } from "lucide-react";
import { DEFAULT_OUTFIT, outfits, useGeekOutfit, type Outfit } from "@/hooks/use-geek-outfit";
import { GeekAvatar } from "./GeekAvatar";
import "./geek-wardrobe.css";

export function GeekWardrobe({ compact = false }: { compact?: boolean }) {
  const { look, ready, choose } = useGeekOutfit();
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const optionsVisible = !compact || expanded;
  return <section aria-label={compact ? "Title companion" : "Your geek"} className={compact ? "geek-greeting" : "geek-studio"}>
    <div className="geek-intro">
      <div className="geek-portrait"><GeekAvatar look={look} /></div>
      <div className="geek-copy">
        <p className="eyebrow">{compact ? "Your companion" : "The wardrobe"}</p>
        <h2>{compact ? "Saved you a seat." : "Dress your geek."}</h2>
        {compact
          ? <p className="geek-caption">Set your timestamp. I’m all ears.</p>
          : <p className="geek-caption">Pick the outfit your geek wears whenever you watch together.</p>}
        {compact && <button type="button" className="geek-action" aria-expanded={expanded} aria-controls={id}
              onClick={() => setExpanded(previous => !previous)}><Shirt size={15} />Outfit</button>}
      </div>
    </div>
    <div id={id} hidden={!optionsVisible} className="geek-options">
      {optionsVisible && <fieldset disabled={!ready}>
        <legend>Your geek’s outfit</legend>
        <div className="geek-choices">
          {(Object.keys(outfits) as Outfit[]).map(key => <label className="geek-choice" key={key}>
            <input type="radio" name={id} aria-label={outfits[key].name}
              aria-describedby={key === DEFAULT_OUTFIT ? `${id}-default` : undefined}
              checked={look === key} onChange={() => choose(key)} />
            <span className="geek-swatch"><GeekAvatar look={key} still /></span>
            <span>{outfits[key].name}</span>
            {key === DEFAULT_OUTFIT && <small id={`${id}-default`} className="geek-default-badge">Default</small>}
          </label>)}
        </div>
      </fieldset>}
      <p className="geek-detail" aria-live="polite"><strong>{outfits[look].name}</strong> · {outfits[look].detail}</p>
      <p className="geek-local">{compact ? "This outfit applies to every title." : "Your outfit is saved on this device."}</p>
    </div>
  </section>;
}
