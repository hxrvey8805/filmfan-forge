import {useEffect,useRef,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {supabase} from '@/integrations/supabase/client';
import {tierRpc} from '@/lib/tier-rpc';
import type {Tables} from '@/integrations/supabase/types';
import {accountChanged} from '@/lib/pro-access';
import {X} from 'lucide-react';
import {CollectibleCard} from './CollectibleCard';
import {PackOdds} from './PackOdds';
import {COLLECTION_LIMIT,isRarity,type PackType} from '../../supabase/functions/_shared/pack-catalogue';
import './collectibles.css';
type Reveal={id:number;name:string;profile_path:string|null;rarity?:unknown};
export default function PackOpeningModal({isOpen,onClose,packId,onPackOpened}:{isOpen:boolean;onClose:()=>void;packId:string;onPackOpened?:()=>void}){
  const [person,setPerson]=useState<Reveal|null>(null),[type,setType]=useState<PackType>('actor'),[revealed,setRevealed]=useState(false);
  const [cards,setCards]=useState<Tables<'user_collection'>[]>([]);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0),[replace,setReplace]=useState('');
  const [uncertain,setUncertain]=useState<{keep:boolean;replace:string|null}|null>(null);
  const deciding=useRef(false);
  useEffect(()=>{
    if(!isOpen||!packId)return;let active=true;
    setPerson(null);setError('');setReplace('');setUncertain(null);setRevealed(false);
    (async()=>{try{
      const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Please sign in again.');
      const [reveal,collection]=await Promise.all([supabase.functions.invoke('open-pack',{body:{packId}}),supabase.from('user_collection').select('*').eq('user_id',user.id)]);
      if(reveal.error||reveal.data?.error||collection.error)throw new Error(reveal.data?.error??'Your pack is safe. Try again shortly.');
      if(!Number.isSafeInteger(reveal.data?.person?.id)||reveal.data.person.id<=0||!reveal.data.person.name||!['actor','director'].includes(reveal.data.packType))throw new Error('Could not confirm this reveal.');
      if(active){setPerson(reveal.data.person);setType(reveal.data.packType);setCards(collection.data??[]);}
    }catch(e){if(active)setError(e instanceof Error?e.message:'Could not load your pack.');}})();
    return()=>{active=false;};
  },[isOpen,packId,attempt]);
  const shelf=cards.filter(c=>c.person_type===type),full=shelf.length>=COLLECTION_LIMIT;
  const duplicate=cards.some(c=>c.person_id===person?.id);
  async function decide(keep:boolean){
    if(deciding.current||!person||!revealed)return;const choice=uncertain??{keep,replace:keep&&full?replace:null};
    if(choice.keep&&(duplicate||(full&&!choice.replace)))return;
    deciding.current=true;setBusy(true);setError('');setUncertain(choice);
    try{const {error}=await tierRpc('decide_cinegeek_pack',{p_pack:packId,p_keep:choice.keep,p_replace:choice.replace});
      if(error){
        // A transport failure can arrive after commit. Keep the original choice for an idempotent retry.
        if(error.code==='P0001'||error.code==='42501'||error.code?.startsWith('23'))setUncertain(null);
        throw new Error(error.message);
      }
      accountChanged();onPackOpened?.();onClose();
    }catch(e){setError(e instanceof Error?e.message:'Could not confirm your choice. Retry the same decision.');}
    finally{deciding.current=false;setBusy(false);}
  }
  const close=()=>{if(!deciding.current)onClose();};
  return <Dialog open={isOpen} onOpenChange={open=>{if(!open)close();}}>
    <DialogContent hideClose className="pack-reveal-dialog" onEscapeKeyDown={e=>{if(deciding.current)e.preventDefault();}} onPointerDownOutside={e=>{if(deciding.current)e.preventDefault();}}>
      <button className="pack-close" aria-label="Close" disabled={busy} onClick={close}><X size={18}/></button>
      <p className="pack-kicker">CineGeek collection</p>
      <DialogTitle className="pack-heading">{revealed?(type==='actor'?'One for your cast.':'Behind the camera.'):'Your next collectible.'}</DialogTitle>
      <DialogDescription className="pack-subtitle">{revealed?'Make room for a favourite.':person?`${type==='actor'?'Actor':'Director'} pack · one collectible`:'Getting your pack ready…'}</DialogDescription>
      <div className="pack-stage">
        {revealed&&person?<CollectibleCard name={person.name} photo={person.profile_path} type={type} rarity={person.rarity}/>:
          <div className={`pack-envelope${!person&&!error?' pack-envelope-loading':''}`} aria-hidden="true">
            <img src="/cinegeek-mark.svg" alt=""/><strong>CineGeek</strong><small>{person?(type==='actor'?'The cast collection':'The director collection'):'The collection'}</small><span>ONE COLLECTIBLE</span>
          </div>}
      </div>
      <p className="sr-only" role="status">{revealed&&person?`${person.name}, ${type}`:!person&&!error?'Preparing your collectible':''}</p>
      {!revealed&&<Button className="pack-reveal-action" disabled={!person} onClick={()=>setRevealed(true)}>{person?'Reveal card':'Preparing pack…'}</Button>}
      {revealed&&person&&<>
        {duplicate?<p className="pack-duplicate">Already in your collection.<br/>Skip this card to finish.</p>:full?<fieldset className="pack-replace" disabled={busy||!!uncertain}>
          <legend>Six spots filled. Choose a card to replace.</legend>
          <div className="pack-replacements">{shelf.map(card=><label className="pack-replacement" data-selected={replace===card.id} key={card.id}>
            <input type="radio" name="replace-card" aria-label={card.person_name} checked={replace===card.id} onChange={()=>setReplace(card.id)}/>
            <CollectibleCard name={card.person_name} photo={card.profile_path} type={type} compact/>
          </label>)}</div><p className="pack-replace-note">The selected card will leave your collection.</p>
        </fieldset>:<p className="pack-space-count"><span className="pack-space-dots" aria-hidden="true">{Array.from({length:COLLECTION_LIMIT},(_,i)=><i key={i} data-filled={i<shelf.length}/>)}</span>{shelf.length} of {COLLECTION_LIMIT} {type} spots filled</p>}
        {uncertain?<Button className="pack-reveal-action" disabled={busy} onClick={()=>void decide(uncertain.keep)}>{busy?'Saving…':`Retry ${uncertain.keep?'keep':'skip'} decision`}</Button>:<div className="pack-decisions">
          <Button variant="outline" className="pack-skip" disabled={busy} onClick={()=>void decide(false)}>Skip card</Button>
          <Button disabled={busy||duplicate||(full&&!replace)} onClick={()=>void decide(true)}>{full&&!duplicate?'Replace & keep':'Keep card'}</Button>
        </div>}
      </>}
      {error&&<div className="pack-error" role="alert">{error}{!person&&<Button variant="outline" onClick={()=>setAttempt(n=>n+1)}>Try again</Button>}</div>}
      <p className="pack-later">Close to decide later.</p>
      <PackOdds type={person?type:undefined} legacy={!!person&&!isRarity(person.rarity)}/>
    </DialogContent>
  </Dialog>;
}
