import {useEffect,useRef,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {supabase} from '@/integrations/supabase/client';
import {tierRpc} from '@/lib/tier-rpc';
import type {Tables} from '@/integrations/supabase/types';
import {accountChanged} from '@/lib/pro-access';
import {CARD_REPLACEMENT_PRICE,pendingPackChoice,savePackChoice,requirePackDecision,type PackChoice} from '@/lib/pack-decision';
import {CollectibleCard} from './CollectibleCard';
import {PackOdds} from './PackOdds';
import {COLLECTION_LIMIT,type PackType} from '../../supabase/functions/_shared/pack-catalogue';
import './collectibles.css';
type Reveal={id:number;name:string;profile_path:string|null;catalogue_version?:unknown};
export default function PackOpeningModal({isOpen,onClose,packId,onPackOpened}:{isOpen:boolean;onClose:()=>void;packId:string;onPackOpened?:()=>void}){
  const [person,setPerson]=useState<Reveal|null>(null),[type,setType]=useState<PackType>('actor'),[revealed,setRevealed]=useState(false);
  const [cards,setCards]=useState<Tables<'user_collection'>[]>([]);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0),[replace,setReplace]=useState('');
  const [uncertain,setUncertain]=useState<PackChoice|null>(null);
  const [owner,setOwner]=useState('');
  const deciding=useRef(false);
  useEffect(()=>{
    if(!isOpen||!packId)return;let active=true;
    setPerson(null);setError('');setReplace('');setUncertain(null);setRevealed(false);setOwner('');
    (async()=>{try{
      const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Please sign in again.');
      if(!active)return;setOwner(user.id);
      const pending=pendingPackChoice(user.id,packId);
      // The server may already have consumed the pack after a lost response.
      // Recover that exact decision before attempting to reveal it again.
      if(pending){setUncertain(pending);return;}
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
    if(deciding.current||!owner||(!uncertain&&(!person||!revealed)))return;
    const choice=uncertain??{keep,replace:keep&&full?replace:null,cost:keep&&full?CARD_REPLACEMENT_PRICE:0};
    if(!uncertain&&choice.keep&&(duplicate||(full&&!choice.replace)))return;
    deciding.current=true;setBusy(true);setError('');setUncertain(choice);
    try{
      const {data:{user}}=await supabase.auth.getUser();
      if(user?.id!==owner)throw new Error('Please reopen this pack on the account that owns it.');
      savePackChoice(owner,packId,choice);
      const {data,error}=await tierRpc('decide_cinegeek_pack_v2',{p_pack:packId,p_keep:choice.keep,p_replace:choice.replace,p_expected_cost:choice.cost});
      if(error){
        // A transport failure can arrive after commit. Keep the original choice for an idempotent retry.
        if(error.code==='P0001'||error.code==='42501'||error.code?.startsWith('23')){
          savePackChoice(owner,packId,null);setUncertain(null);
          if(!person)setAttempt(n=>n+1);
        }
        throw new Error(error.message);
      }
      requirePackDecision(data,choice);savePackChoice(owner,packId,null);
      accountChanged();onPackOpened?.();onClose();
    }catch(e){setError(e instanceof Error?e.message:'Could not confirm your choice. Retry the same decision.');}
    finally{deciding.current=false;setBusy(false);}
  }
  const close=()=>{if(!deciding.current)onClose();};
  return <Dialog open={isOpen} onOpenChange={open=>{if(!open)close();}}>
    <DialogContent closeDisabled={busy} className="pack-reveal-dialog" onEscapeKeyDown={e=>{if(deciding.current)e.preventDefault();}} onPointerDownOutside={e=>{if(deciding.current)e.preventDefault();}}>
      <p className="pack-kicker">The CineGeek collection</p>
      <DialogTitle className="pack-heading">{person?(type==='actor'?'Actor pack':'Director pack'):'Your pack'}</DialogTitle>
      <DialogDescription className="sr-only">{revealed?'Keep this card, skip it, or close to decide later.':person?'Reveal your collectible.':'Getting your pack ready…'}</DialogDescription>
      <div className="pack-stage">
        {revealed&&person?<CollectibleCard name={person.name} photo={person.profile_path} type={type}/>:
          <div className={`pack-envelope${!person&&!error?' pack-envelope-loading':''}`} aria-hidden="true">
            <span className="pack-edition">{person?(type==='actor'?'Actors':'Directors'):'Collection'}</span><img src="/cinegeek-glasses.svg" alt=""/><strong>cinegeek<span>.</span></strong>
          </div>}
      </div>
      <p className="sr-only" role="status">{revealed&&person?`${person.name}, ${type}`:!person&&!error?'Preparing your collectible':''}</p>
      {!revealed&&!uncertain&&<Button className="pack-reveal-action" disabled={!person} onClick={()=>setRevealed(true)}>{person?'Reveal card':'Preparing pack…'}</Button>}
      {revealed&&person&&<>
        {duplicate?<p className="pack-duplicate">Already in your collection.<br/>Skip this card to finish.</p>:full?<fieldset className="pack-replace" disabled={busy||!!uncertain}>
          <legend>Six spots filled. Choose a card to replace.</legend>
          <div className="pack-replacements">{shelf.map(card=><label className="pack-replacement" data-selected={replace===card.id} key={card.id}>
            <input type="radio" name="replace-card" aria-label={card.person_name} checked={replace===card.id} onChange={()=>setReplace(card.id)}/>
            <CollectibleCard name={card.person_name} photo={card.profile_path} type={type} compact/>
          </label>)}</div><p className="pack-replace-note">{CARD_REPLACEMENT_PRICE} XP to replace. The selected card leaves permanently.</p>
        </fieldset>:<p className="pack-space-count"><span className="pack-space-dots" aria-hidden="true">{Array.from({length:COLLECTION_LIMIT},(_,i)=><i key={i} data-filled={i<shelf.length}/>)}</span>{shelf.length} of {COLLECTION_LIMIT} {type} spots filled</p>}
        {!uncertain&&<div className="pack-decisions">
          <Button variant="outline" className="pack-skip" disabled={busy} onClick={()=>void decide(false)}>Skip card</Button>
          <Button disabled={busy||duplicate||(full&&!replace)} onClick={()=>void decide(true)}>{full&&!duplicate?`Replace · ${CARD_REPLACEMENT_PRICE} XP`:'Keep card'}</Button>
        </div>}
      </>}
      {uncertain&&<><p className="pack-later">{uncertain.cost?`Your ${uncertain.cost} XP replacement`:'Your choice'} needs confirmation. Retrying won’t charge twice.</p><Button className="pack-reveal-action" disabled={busy} onClick={()=>void decide(uncertain.keep)}>{busy?'Saving…':`Retry ${uncertain.keep?'keep':'skip'} decision`}</Button></>}
      {error&&<div className="pack-error" role="alert">{error}{!person&&<Button variant="outline" onClick={()=>setAttempt(n=>n+1)}>Try again</Button>}</div>}
      {revealed&&<p className="pack-later">Not sure? You can decide later.</p>}
      <PackOdds type={person?type:undefined} drawn={!!person} version={person?.catalogue_version}/>
    </DialogContent>
  </Dialog>;
}
