import {useEffect, useRef, useState} from 'react';
import {Clapperboard, Layers3, Sparkles, Star, X, Zap} from 'lucide-react';
import {useProAccess} from '@/hooks/use-pro-access';
import {accountChanged} from '@/lib/pro-access';
import {tierRpc} from '@/lib/tier-rpc';
import {Button} from './ui/button';
import {Dialog, DialogContent, DialogDescription, DialogTitle} from './ui/dialog';
import './daily-reward.css';

type Prize = {kind:'xp';xp:number} | {kind:'pack';packType:'actor'|'director'} | {kind:'badge';badge:string};
export function readDailyPrize(value:unknown):Prize|null {
  if (!value || typeof value !== 'object') return null;
  const p=value as Record<string,unknown>;
  if(p.kind==='xp' && Number.isInteger(p.xp) && Number(p.xp)>=0 && Number(p.xp)<=25) return {kind:'xp',xp:Number(p.xp)};
  if(p.kind==='pack' && (p.packType==='actor'||p.packType==='director')) return {kind:'pack',packType:p.packType};
  if(p.kind==='badge' && ['film_buff','scene_spotter','cast_expert'].includes(String(p.badge))) return {kind:'badge',badge:String(p.badge)};
  return null;
}
export function rewardAngle(prize:Prize){return prize.kind==='xp'?18:prize.kind==='badge'?342:prize.packType==='actor'?198:270;}
const segments=[Zap,Zap,Zap,Zap,Zap,Layers3,Layers3,Clapperboard,Clapperboard,Star];

// Mount only after a server-confirmed win. Eligibility and the actual prize are
// both server-owned; the wheel only animates the already-confirmed result.
export function DailyReward(){
  const access=useProAccess(),[open,setOpen]=useState(false),[phase,setPhase]=useState<'idle'|'requesting'|'spinning'|'done'>('idle');
  const [prize,setPrize]=useState<Prize|null>(null),[error,setError]=useState(''),[rotation,setRotation]=useState(0);
  const offered=useRef(false),busy=useRef(false),alive=useRef(true),timer=useRef<ReturnType<typeof setTimeout>>();
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;clearTimeout(timer.current);};},[]);
  useEffect(()=>{if(access?.plan!=='free'&&access?.spinAvailable&&!offered.current){offered.current=true;setOpen(true);}},[access]);
  async function spin(){
    if(busy.current||phase==='done')return;
    busy.current=true;setPhase('requesting');setError('');
    try{
      const {data,error}=await tierRpc('spin_cinegeek_reward');if(error)throw error;
      const confirmed=readDailyPrize(data);if(!confirmed)throw new Error('Unconfirmed reward');
      if(!alive.current)return;
      setPrize(confirmed);setRotation(1440+360-rewardAngle(confirmed));setPhase('spinning');
      const finish=()=>{if(!alive.current)return;setPhase('done');busy.current=false;accountChanged();};
      if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)finish();
      else timer.current=setTimeout(finish,3400);
    }catch{if(alive.current){setError('Your reward couldn’t be confirmed. Try again to retrieve the same daily spin.');setPhase('idle');busy.current=false;}}
  }
  const working=phase==='requesting'||phase==='spinning';
  const title=phase==='done'&&prize?(prize.kind==='xp'?(prize.xp?`+${prize.xp} XP`:'Daily XP cap reached'):prize.kind==='pack'?`${prize.packType==='actor'?'Actor':'Director'} pack unlocked`:prize.badge.replace(/_/g,' ')):'A win worth a spin.';
  return <>
    {!open&&offered.current&&phase!=='done'&&<Button variant="outline" onClick={()=>setOpen(true)} className="w-full gap-2"><Sparkles size={16}/>Your daily spin is ready</Button>}
    <Dialog open={open} onOpenChange={next=>{if(!busy.current)setOpen(next);}}>
      <DialogContent className="daily-spin-dialog [&>button:last-child]:hidden" onEscapeKeyDown={event=>{if(working)event.preventDefault();}} onPointerDownOutside={event=>{if(working)event.preventDefault();}}>
        {!working&&<button className="daily-spin-close" aria-label="Close daily spin" onClick={()=>setOpen(false)}><X size={19}/></button>}
        <p className="daily-spin-kicker">First win of the day</p>
        <DialogTitle className="daily-spin-title">{title}</DialogTitle>
        <DialogDescription className="daily-spin-description">{phase==='done'?(prize?.kind==='pack'?'Open it in Your collection.':prize?.kind==='badge'?'Saved to your badges. Repeated badges stay collected.':prize?.kind==='xp'&&prize.xp===0?'You’ve earned today’s 225 XP. Come back tomorrow.':'Added to your XP balance.'):'Nice connection. Your bonus is ready.'}</DialogDescription>
        <div className="daily-spin-stage" aria-hidden="true">
          <div className="daily-spin-pointer"/>
          <div className="daily-spin-wheel" style={{transform:`rotate(${rotation}deg)`}}>
            {segments.map((Icon,i)=><span className="daily-spin-segment" key={i} style={{transform:`translate(-50%,-50%) rotate(${18+i*36}deg) translateY(-101px) rotate(${-18-i*36}deg)`}}><Icon size={22}/></span>)}
          </div>
          <div className="daily-spin-hub"><Sparkles size={28}/></div>
        </div>
        <p className="sr-only" role="status">{working?'Revealing your daily reward':phase==='done'?title:''}</p>
        {error&&<p className="daily-spin-error" role="alert">{error}</p>}
        <Button className="daily-spin-button" disabled={working} onClick={phase==='done'?()=>setOpen(false):()=>void spin()}>{phase==='done'?'Nice. Keep playing':working?'Revealing…':error?'Retry daily spin':'Spin my reward'}</Button>
        <details className="daily-spin-odds"><summary>Reward chances</summary><p>50%: up to 25 XP. 20%: actor pack. 20%: director pack. 10%: badge. Wins and spins share a 225 XP daily cap. One Pro spin daily, resetting at midnight UTC. No paid spins or cash prizes.</p></details>
      </DialogContent>
    </Dialog>
  </>;
}
