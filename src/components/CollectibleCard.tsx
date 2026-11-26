import {useState} from 'react';
import './collectibles.css';
export function CollectibleCard({name,photo,type,compact=false}:{name:string;photo?:string|null;type:string;compact?:boolean}){
  const [failed,setFailed]=useState<string>();
  const src=photo&&/^\/[A-Za-z0-9_-]+\.(jpg|png)$/.test(photo)?`https://image.tmdb.org/t/p/w342${photo}`:undefined;
  return <figure className={`collectible-card${compact?' collectible-card-compact':''}`}>
    <div className="collectible-photo">
      <span className="collectible-initials" aria-hidden="true">{name.split(/\s+/).filter(Boolean).filter((_,i,parts)=>i===0||i===parts.length-1).map(p=>p[0]).join('')}</span>
      {src&&src!==failed&&<img src={src} alt="" onError={()=>setFailed(src)}/>}
    </div>
    <figcaption>{!compact&&<span className="collectible-role">{type==='director'?'Director':'Actor'}</span>}<strong>{name}</strong></figcaption>
  </figure>;
}
