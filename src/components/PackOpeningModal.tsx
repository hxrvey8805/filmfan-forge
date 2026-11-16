import {useEffect,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {supabase} from '@/integrations/supabase/client';
import {tierRpc} from '@/lib/tier-rpc';
import type {Tables} from '@/integrations/supabase/types';
import {accountChanged} from '@/lib/pro-access';
import {Loader2,UserRound} from 'lucide-react';
type Reveal={id:number;name:string;profile_path:string|null};
export default function PackOpeningModal({isOpen,onClose,packId,onPackOpened}:{isOpen:boolean;onClose:()=>void;packId:string;onPackOpened?:()=>void}){
  const [person,setPerson]=useState<Reveal|null>(null),[type,setType]=useState('actor');
  const [cards,setCards]=useState<Tables<'user_collection'>[]>([]);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0),[replace,setReplace]=useState('');
  const [uncertain,setUncertain]=useState<{keep:boolean;replace:string|null}|null>(null);
  useEffect(()=>{
    if(!isOpen||!packId)return;let active=true;
    setPerson(null);setError('');setReplace('');setUncertain(null);
    (async()=>{try{
      const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Please sign in again.');
      const [reveal,collection]=await Promise.all([supabase.functions.invoke('open-pack',{body:{packId}}),supabase.from('user_collection').select('*').eq('user_id',user.id)]);
      if(reveal.error||reveal.data?.error||collection.error)throw new Error(reveal.data?.error??'Your pack is safe. Try again shortly.');
      if(!reveal.data?.person?.id || !['actor','director'].includes(reveal.data.packType))throw new Error('Could not confirm this reveal.');
      if(active){setPerson(reveal.data.person);setType(reveal.data.packType);setCards(collection.data??[]);}
    }catch(e){if(active)setError(e instanceof Error?e.message:'Could not load your pack.');}})();
    return()=>{active=false;};
  },[isOpen,packId,attempt]);
  const shelf=cards.filter(c=>c.person_type===type),full=shelf.length>=5;
  const duplicate=cards.some(c=>c.person_id===person?.id);
  async function decide(keep:boolean){
    if(busy||!person)return;const choice=uncertain??{keep,replace:keep&&full?replace:null};
    if(choice.keep&&full&&!choice.replace)return;
    setBusy(true);setError('');setUncertain(choice);
    try{const {error}=await tierRpc('decide_cinegeek_pack',{p_pack:packId,p_keep:choice.keep,p_replace:choice.replace});
      if(error){setUncertain(null);throw new Error(error.message);}
      accountChanged();onPackOpened?.();onClose();
    }catch(e){setError(e instanceof Error?e.message:'Could not confirm your choice. Retry the same decision.');}
    finally{setBusy(false);}
  }
  return <Dialog open={isOpen} onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl">
    <DialogTitle>{person?'Meet your new collectible':'Opening your pack'}</DialogTitle>
    <DialogDescription>Keep up to five actors and five directors. No selling, refunds or rerolls. Close to decide later.</DialogDescription>
    {!person&&!error&&<div role="status" className="py-20 flex justify-center"><Loader2 className="animate-spin text-primary" aria-label="Revealing your card"/></div>}
    {person&&<><div className="mx-auto w-44 rounded-2xl overflow-hidden border border-primary/40 bg-primary/5 motion-safe:animate-fade-in">
      {person.profile_path?<img src={`https://image.tmdb.org/t/p/w342${person.profile_path}`} alt="" className="w-full aspect-[2/3] object-cover"/>:<UserRound className="w-full h-44 p-10"/>}
      <div className="p-3 text-center"><p className="text-xs uppercase text-primary">{type}</p><h3 className="text-lg font-semibold">{person.name}</h3></div></div>
      {duplicate?<p>You already have this person. Skip to finish opening this pack.</p>:full?<fieldset disabled={busy||!!uncertain}><legend className="font-semibold mb-2">Your {type} collection is full. Choose one to replace:</legend><div className="grid grid-cols-2 gap-2">{shelf.map(card=><label key={card.id} className={`border rounded-xl p-3 text-sm ${replace===card.id?'border-primary bg-primary/10':'border-border'}`}><input type="radio" name="replace-card" checked={replace===card.id} onChange={()=>setReplace(card.id)} className="mr-2"/>{card.person_name}</label>)}</div><p className="text-xs text-muted-foreground mt-2">The replaced card leaves your collection. No XP is returned.</p></fieldset>:<p className="text-center text-sm">{shelf.length} / 5 {type} spaces filled</p>}
      {uncertain?<Button disabled={busy} onClick={()=>void decide(uncertain.keep)}>Retry {uncertain.keep?'keep':'skip'} decision</Button>:<div className="flex gap-3"><Button variant="outline" className="flex-1" disabled={busy} onClick={()=>void decide(false)}>Skip card</Button><Button className="flex-1" disabled={busy||duplicate||(full&&!replace)} onClick={()=>void decide(true)}>{full?'Replace & keep':'Keep card'}</Button></div>}
    </>}
    {error&&<div role="alert" className="text-sm text-destructive">{error}{!person&&<Button variant="outline" className="ml-2" onClick={()=>setAttempt(n=>n+1)}>Try again</Button>}</div>}
  </DialogContent></Dialog>;
}
