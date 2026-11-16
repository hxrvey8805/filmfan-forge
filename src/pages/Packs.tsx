import {useEffect,useState} from 'react';
import {Package,UserRound} from 'lucide-react';
import PackOpeningModal from '@/components/PackOpeningModal';
import {supabase} from '@/integrations/supabase/client';
import type {Tables} from '@/integrations/supabase/types';
import {Button} from '@/components/ui/button';
export default function Packs({onStore}:{onStore:()=>void;onBalance?:(xp:number)=>void}){
  const [packs,setPacks]=useState<Tables<'user_packs'>[]>([]),[cards,setCards]=useState<Tables<'user_collection'>[]>([]);
  const [shelf,setShelf]=useState('actor'),[pack,setPack]=useState(''),[attempt,setAttempt]=useState(0);
  const [status,setStatus]=useState('loading');
  useEffect(()=>{let active=true;setStatus('loading');(async()=>{try{
    const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error();
    const [inventory,collection]=await Promise.all([supabase.from('user_packs').select('*').eq('user_id',user.id).eq('is_opened',false).order('earned_at',{ascending:true}),supabase.from('user_collection').select('*').eq('user_id',user.id).order('collected_at',{ascending:false})]);
    if(inventory.error||collection.error)throw new Error();if(active){setPacks(inventory.data??[]);setCards(collection.data??[]);setStatus('ready');}
  }catch{if(active)setStatus('error');}})();return()=>{active=false;};},[attempt]);
  const close=()=>{setPack('');setAttempt(n=>n+1);};
  return <div className="space-y-5"><header className="play-subhead"><p className="arcade-kicker">Card counter</p><h1>Your collection</h1><p className="play-muted">Five actors. Five directors. Your dream cast.</p></header>
    {status==='loading'?<p role="status">Loading your collection…</p>:status==='error'?<div role="alert">Couldn’t load your cards. <Button onClick={()=>setAttempt(n=>n+1)}>Try again</Button></div>:<>
      <section className="space-y-3"><h2 className="play-section-title">Your packs</h2>{['actor','director'].map(type=>{const group=packs.filter(p=>p.pack_type===type);return group.length?<div key={type} className="play-panel pack-item"><Package/><div><strong className="capitalize">{type} packs</strong><small>{group.length} ready to reveal or decide</small></div><button className="play-action" onClick={()=>setPack(group[0].id)}>Open pack</button></div>:null;})}
        {!packs.length&&<p className="play-muted">Your next collectible is waiting in the XP store.</p>}<Button variant="outline" onClick={onStore}>Browse XP store</Button></section>
      <section><div className="play-segments" role="group" aria-label="Card shelf">{['actor','director'].map(type=><button key={type} aria-pressed={shelf===type} onClick={()=>setShelf(type)}>{type==='actor'?'Actors':'Directors'} · {cards.filter(c=>c.person_type===type).length}/5</button>)}</div>
      <div className="play-cards">{cards.filter(c=>c.person_type===shelf).map(c=><div key={c.id} className="person-card">{c.profile_path?<img src={`https://image.tmdb.org/t/p/w342${c.profile_path}`} alt="" loading="lazy"/>:<UserRound/>}<strong>{c.person_name}</strong></div>)}</div><p className="text-xs text-muted-foreground mt-4">Cards have no cash or XP resale value. Replace one only when accepting a new reveal.</p></section>
    </>}
    {!!pack&&<PackOpeningModal isOpen packId={pack} onClose={close}/>}</div>;
}
