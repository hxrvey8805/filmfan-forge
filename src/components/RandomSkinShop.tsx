import {useEffect,useRef,useState} from 'react';
import {Sparkles} from 'lucide-react';
import {useProAccess} from '@/hooks/use-pro-access';
import {outfits} from '@/hooks/use-geek-outfit';
import type {ProAccess} from '@/lib/pro-access';
import {hasPendingXp,redeemXp} from '@/lib/xp-redemption';
import {RANDOM_SKIN_ITEM,RANDOM_SKIN_PRICE,requireRandomSkinResult,unlockableSkins,type RandomSkinResult} from '@/lib/random-skin';
import {GeekAvatar} from './GeekAvatar';
import {Button} from './ui/button';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from './ui/dialog';
import './random-skin.css';

type Props={compact?:boolean;onBalance?:(xp:number)=>void};
export function RandomSkinShop(props:Props){
  const access=useProAccess();
  return access?.plan==='monthly'?<MonthlySkinShop key={access.userId} {...props} access={access}/>:null;
}
function MonthlySkinShop({access,compact=false,onBalance}:Props&{access:ProAccess}){
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [result,setResult]=useState<RandomSkinResult|null>(null);
  const [pending,setPending]=useState(()=>hasPendingXp(access.userId,RANDOM_SKIN_ITEM));
  const working=useRef(false),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const remaining=unlockableSkins.filter(key=>!access.unlockedSkins.includes(key));
  const complete=remaining.length===0;
  const disabled=busy||(!pending&&(complete||access.xp<RANDOM_SKIN_PRICE));
  const price=RANDOM_SKIN_PRICE.toLocaleString('en-GB');
  async function unlock(){
    if(working.current||disabled||result)return;
    working.current=true;setBusy(true);setError('');
    try{
      const confirmed=await redeemXp(access.userId,RANDOM_SKIN_ITEM,requireRandomSkinResult);
      if(!alive.current)return;
      setResult(confirmed);setPending(false);onBalance?.(confirmed.xpBalance);
    }catch(e){
      if(alive.current){setPending(hasPendingXp(access.userId,RANDOM_SKIN_ITEM));setError(e instanceof Error?e.message:'Could not confirm the unlock. Retry the same purchase.');}
    }finally{working.current=false;if(alive.current)setBusy(false);}
  }
  function begin(){setResult(null);setError('');setPending(hasPendingXp(access.userId,RANDOM_SKIN_ITEM));setOpen(true);}
  return <>
    {compact?<button type="button" className="geek-unlock-link" disabled={complete&&!pending} onClick={begin}>
      <Sparkles size={14}/>{pending?'Check pending unlock':complete?'Every skin unlocked':'Unlock with XP'}
    </button>:<section className="destination-card random-skin-store">
      <div className="random-skin-icon" aria-hidden="true"><Sparkles size={23}/></div>
      <div><h2>Random Geek skin</h2><p>{complete?'Every skin is in your wardrobe.':'A new look. No duplicates.'}</p></div>
      <strong>{price} XP</strong>
      <Button disabled={disabled} onClick={begin}>{pending?'Check pending unlock':complete?'All skins unlocked':'Unlock a random skin'}</Button>
      {!complete&&!pending&&access.xp<RANDOM_SKIN_PRICE&&<small>{(RANDOM_SKIN_PRICE-access.xp).toLocaleString('en-GB')} more XP needed</small>}
    </section>}
    <Dialog open={open} onOpenChange={next=>{if(!working.current)setOpen(next);}}>
      <DialogContent className="random-skin-dialog" hideClose={busy}
        onEscapeKeyDown={e=>{if(busy)e.preventDefault();}} onPointerDownOutside={e=>{if(busy)e.preventDefault();}}>
        <p className="eyebrow">Your Geek, a new look.</p>
        <DialogTitle>{result?`${outfits[result.skin].name} unlocked`:'A surprise for your Geek.'}</DialogTitle>
        <DialogDescription>{result?'Added to your wardrobe. Choose it whenever you like.':pending?'Check the original purchase. It won’t charge twice or draw again.':`${price} XP · one skin you don’t own.`}</DialogDescription>
        <div className="random-skin-reveal" aria-hidden="true">{result?<GeekAvatar look={result.skin}/>:<Sparkles size={54}/>}</div>
        {error&&<p className="random-skin-error" role="alert">{error}</p>}
        {result?<Button onClick={()=>setOpen(false)}>Done</Button>:<Button disabled={disabled} onClick={()=>void unlock()}>
          {busy?'Unlocking…':pending?'Retry same unlock':complete?'All skins unlocked':`Unlock for ${price} XP`}
        </Button>}
        {!result&&<details className="random-skin-odds"><summary>How it works</summary>
          <p>Every skin you don’t own has an equal chance. No duplicates, including skins won from daily spins. The default Geek is excluded.</p>
          <p>{remaining.length} skins left{remaining.length>0?` · approximately ${(100/remaining.length).toFixed(2)}% each.`:'.'}</p>
          <p>The skin is added directly to your wardrobe. There’s no skip, reroll, selling or XP refund.</p>
        </details>}
      </DialogContent>
    </Dialog>
  </>;
}
