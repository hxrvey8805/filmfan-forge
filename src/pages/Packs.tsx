import {useEffect,useState} from 'react';
import {Package,Plus} from 'lucide-react';
import PackOpeningModal from '@/components/PackOpeningModal';
import {supabase} from '@/integrations/supabase/client';
import type {Tables} from '@/integrations/supabase/types';
import {Button} from '@/components/ui/button';
import {CollectibleCard} from '@/components/CollectibleCard';
import {COLLECTION_LIMIT} from '../../supabase/functions/_shared/pack-catalogue';
type CollectionCard=Tables<'user_collection'>&{card_rarity?:unknown};
export default function Packs({onStore}:{onStore:()=>void;onBalance?:(xp:number)=>void}){
  const [packs,setPacks]=useState<Tables<'user_packs'>[]>([]),[cards,setCards]=useState<CollectionCard[]>([]);
  const [shelf,setShelf]=useState('actor'),[pack,setPack]=useState(''),[attempt,setAttempt]=useState(0);
  const [status,setStatus]=useState('loading');
  useEffect(()=>{let active=true;setStatus('loading');(async()=>{try{
    const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error();
    const [inventory,collection]=await Promise.all([supabase.from('user_packs').select('*').eq('user_id',user.id).eq('is_opened',false).order('earned_at',{ascending:true}),supabase.from('user_collection').select('*').eq('user_id',user.id).order('collected_at',{ascending:false})]);
    if(inventory.error||collection.error)throw new Error();if(active){setPacks(inventory.data??[]);setCards(collection.data??[]);setStatus('ready');}
  }catch{if(active)setStatus('error');}})();return()=>{active=false;};},[attempt]);
  const close=()=>{setPack('');setAttempt(n=>n+1);};
  const collection=cards.filter(c=>c.person_type===shelf);
  return <div className="space-y-5"><header className="play-subhead"><p className="arcade-kicker">Card counter</p><h1>Your collection</h1><p className="play-muted">Six actors. Six directors. Your dream cast.</p></header>
    {status==='loading'?<p role="status">Loading your collection…</p>:status==='error'?<div role="alert">Couldn’t load your cards. <Button onClick={()=>setAttempt(n=>n+1)}>Try again</Button></div>:<>
      <section className="space-y-3"><h2 className="play-section-title">Your packs</h2>{['actor','director'].map(type=>{const group=packs.filter(p=>p.pack_type===type);return group.length?<div key={type} className="play-panel pack-item"><Package/><div><strong className="capitalize">{type} packs</strong><small>{group.length} ready to reveal or decide</small></div><button className="play-action" onClick={()=>setPack(group[0].id)}>Open pack</button></div>:null;})}
        {!packs.length&&<p className="play-muted">Your next collectible is waiting in the XP store.</p>}<Button variant="outline" onClick={onStore}>Browse XP store</Button></section>
      <section><div className="play-segments" role="group" aria-label="Card shelf">{['actor','director'].map(type=><button key={type} aria-pressed={shelf===type} onClick={()=>setShelf(type)}>{type==='actor'?'Actors':'Directors'} · {cards.filter(c=>c.person_type===type).length}/{COLLECTION_LIMIT}</button>)}</div>
      <div className="collection-grid">{collection.map(c=><CollectibleCard key={c.id} name={c.person_name} photo={c.profile_path} type={c.person_type} rarity={c.card_rarity}/>)}
        {Array.from({length:Math.max(0,COLLECTION_LIMIT-collection.length)},(_,i)=><div className="collection-slot" key={'empty-'+i} aria-label="Empty collection spot"><Plus size={16}/><span>Your next pick</span></div>)}
      </div></section>
    </>}
    {!!pack&&<PackOpeningModal isOpen packId={pack} onClose={close}/>}</div>;
}
