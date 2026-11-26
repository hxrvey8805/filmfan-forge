import { useProAccess } from "@/hooks/use-pro-access";
import { canWear } from "@/lib/pro-access";
import { useId, useState } from "react";
import { Check, Shirt } from "lucide-react";
import { DEFAULT_OUTFIT, outfits, useGeekOutfit, type Outfit } from "@/hooks/use-geek-outfit";
import { GeekAvatar } from "./GeekAvatar";
import {RandomSkinShop} from "./RandomSkinShop";
import "./geek-wardrobe.css";

export function GeekWardrobe({ compact = false }: { compact?: boolean }) {
  const { look, ready, choose } = useGeekOutfit();
  const access=useProAccess();
  const proWardrobe = access?.plan === 'monthly' || access?.plan === 'annual';
  // Every picker is a wardrobe of wearable outfits. Optional XP browsing lives
  // separately so a Monthly collection never looks like a wall of locked skins.
  const allOutfits = Object.keys(outfits) as Outfit[];
  const visibleOutfits = allOutfits.filter(key => canWear(access,key));
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
          : <p className="geek-caption">{outfits[look].name} <span className="geek-wearing">· Wearing</span></p>}
        {compact && <button type="button" className="geek-action" aria-expanded={expanded} aria-controls={id}
              onClick={() => setExpanded(previous => !previous)}><Shirt size={15} />Outfit</button>}
      </div>
    </div>
    <div id={id} hidden={!optionsVisible} className="geek-options">
      {optionsVisible && <fieldset disabled={!ready}>
        <legend>{proWardrobe ? `Your skins · ${visibleOutfits.length}` : 'Your geek’s outfit'}</legend>
        <div className="geek-choices">
          {visibleOutfits.map(key => <label className="geek-choice" key={key}>
            <input type="radio" name={id} aria-label={outfits[key].name}
              aria-describedby={key === DEFAULT_OUTFIT ? `${id}-default` : undefined}
              checked={look === key} onChange={() => choose(key)} />
            <span className="geek-swatch"><GeekAvatar look={key} still /></span>
            <span>{outfits[key].name}</span>
            {look === key && <Check size={13} className="geek-selected" aria-hidden="true"/>}
            {key === DEFAULT_OUTFIT && <small id={`${id}-default`} className="geek-default-badge">Default</small>}
          </label>)}
        </div>
      </fieldset>}
      <p className="sr-only" aria-live="polite">Wearing {outfits[look].name}</p>
      <RandomSkinShop compact/>
    </div>
  </section>;
}
