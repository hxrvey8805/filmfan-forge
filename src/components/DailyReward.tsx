import {useState} from 'react';
import {useProAccess} from '@/hooks/use-pro-access';
import {accountChanged} from '@/lib/pro-access';
import {tierRpc} from '@/lib/tier-rpc';
import {Button} from './ui/button';
export function DailyReward(){
  const access=useProAccess(),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  async function spin(){if(busy)return;setBusy(true);setMessage('');try{
    const {data,error}=await tierRpc('spin_cinegeek_reward');if(error)throw error;
    const prize=data as {kind:string;xp?:number;packType?:string;badge?:string};
    setMessage(prize.kind==='xp'?`${prize.xp} XP${prize.xp===0?' — your daily XP cap is reached':''}`:prize.kind==='pack'?`An ${prize.packType} pack is waiting in Your collection.`:`Badge: ${prize.badge?.replace(/_/g,' ')}. Duplicate badges stay in your collection.`);accountChanged();
  }catch{setMessage('Could not confirm your spin. Retry to retrieve the same daily reward.');}finally{setBusy(false);}}
  return <section className="play-panel space-y-3"><h2 className="play-section-title">Daily reward</h2><p className="text-sm text-muted-foreground">{access?.plan==='free'?'Pro members earn one reward spin with their first win of the day.':'Your first verified win each day earns one spin.'} XP earnings from wins and spins share a 225 XP daily cap.</p>
    <Button disabled={busy||!access?.spinAvailable} onClick={()=>void spin()}>{busy?'Revealing…':'Reveal today’s reward'}</Button>
    <p role="status" className="text-sm text-primary">{message}</p>
    <details className="text-xs text-muted-foreground"><summary>Reward chances</summary><p className="mt-2">50%: up to 25 XP (subject to your daily cap). 20%: actor pack. 20%: director pack. 10%: collectible badge. One spin daily, resets at midnight UTC. No paid spins or cash prizes.</p></details>
  </section>;
}
