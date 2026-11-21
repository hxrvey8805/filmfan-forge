import {redeemXp} from "@/lib/xp-redemption";
import { useProAccess } from "@/hooks/use-pro-access";
import { canWear } from "@/lib/pro-access";
import { toast } from "sonner";
import { useId, useState } from "react";
import { Check, Shirt, Sparkles } from "lucide-react";
import { DEFAULT_OUTFIT, outfits, useGeekOutfit, type Outfit } from "@/hooks/use-geek-outfit";
import { GeekAvatar } from "./GeekAvatar";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import "./geek-wardrobe.css";

export function GeekWardrobe({ compact = false }: { compact?: boolean }) {
  const { look, ready, choose } = useGeekOutfit();
  const access=useProAccess();
  const proWardrobe = access?.plan === 'monthly' || access?.plan === 'annual';
  // Every picker is a wardrobe of wearable outfits. Optional XP browsing lives
  // separately so a Monthly collection never looks like a wall of locked skins.
  const allOutfits = Object.keys(outfits) as Outfit[];
  const visibleOutfits = allOutfits.filter(key => canWear(access,key));
  const lockedOutfits = allOutfits.filter(key => !canWear(access,key));
  const [shopOpen,setShopOpen]=useState(false);
  const [unlocking,setUnlocking]=useState(false);
  async function unlock(key:Outfit){
    if(access?.plan!=='monthly'||canWear(access,key)||unlocking)return;
    setUnlocking(true);
    try{await redeemXp(access.userId,`skin:${key}`);toast.success('Skin unlocked. Select it to wear it.');
    }catch(e){toast.error(e instanceof Error?e.message:'Could not confirm the unlock. Try again.');}finally{setUnlocking(false);}
  }
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
      {optionsVisible && <fieldset disabled={!ready||unlocking}>
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
      {access?.plan==='monthly' && lockedOutfits.length>0 &&
        <button type="button" className="geek-unlock-link" onClick={()=>setShopOpen(true)}><Sparkles size={14}/>Unlock with XP</button>}
    </div>
    {access?.plan==='monthly' && <Dialog open={shopOpen} onOpenChange={setShopOpen}>
      <DialogContent className="geek-unlock-dialog">
        <DialogTitle>Make it your Geek.</DialogTitle>
        <DialogDescription>{access.xp.toLocaleString()} XP available · 1,500 XP per skin</DialogDescription>
        <div className="geek-unlock-grid">
          {lockedOutfits.map(key=><button key={key} type="button" disabled={unlocking||!ready||access.xp<1500}
            onClick={()=>void unlock(key)} aria-label={`Unlock ${outfits[key].name} for 1,500 XP`}>
            <GeekAvatar look={key} still/><strong>{outfits[key].name}</strong><span>1,500 XP</span>
          </button>)}
          {!lockedOutfits.length && <p>Every skin is in your wardrobe.</p>}
        </div>
      </DialogContent>
    </Dialog>}
  </section>;
}
