import {useState} from 'react';
import {Clapperboard,Star} from 'lucide-react';
import {isRarity,PACK_ODDS} from '../../supabase/functions/_shared/pack-catalogue';
import './collectibles.css';
export function CollectibleCard({name,photo,type,rarity,compact=false}:{name:string;photo?:string|null;type:string;rarity?:unknown;compact?:boolean}){
  const [failed,setFailed]=useState<string>();
  const src=photo&&/^\/[A-Za-z0-9_-]+\.(jpg|png)$/.test(photo)?`https://image.tmdb.org/t/p/w342${photo}`:undefined;
  const tier=isRarity(rarity)?PACK_ODDS.find(t=>t.id===rarity):null;
  return <figure className={`collectible-card${compact?' collectible-card-compact':''}`} data-rarity={tier?.id??'legacy'}>
    <div className="collectible-photo">
      <span className="collectible-initials" aria-hidden="true">{name.split(/\s+/).filter(Boolean).filter((_,i,parts)=>i===0||i===parts.length-1).map(p=>p[0]).join('')}</span>
      {src&&src!==failed&&<img src={src} alt="" onError={()=>setFailed(src)}/>}
    </div>
    {!compact&&tier&&<span className="collectible-rarity"><Star size={10} aria-hidden="true"/>{tier.label}</span>}
    <figcaption>{!compact&&<span className="collectible-role"><Clapperboard size={11} aria-hidden="true"/>{type==='director'?'Director':'Actor'}</span>}<strong>{name}</strong></figcaption>
  </figure>;
}
