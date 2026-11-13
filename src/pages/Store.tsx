import {redeemXp} from "@/lib/xp-redemption";
import {useState} from 'react';
import {useProAccess} from '@/hooks/use-pro-access';
import {Button} from '@/components/ui/button';
import {toast} from 'sonner';
const Store=({onBalance}:{onBalance?:(n:number)=>void})=>{
  const access=useProAccess();const [busy,setBusy]=useState(false);
  async function redeem(type:string){
    if(busy||!access)return;setBusy(true);
    const item=`pack:${type}`;
    try{await redeemXp(access.userId,item);onBalance?.(access.xp-150);toast.success('Pack added to Your collection');
    }catch(e){toast.error(e instanceof Error?e.message:'Could not confirm the pack. Retry to check the same purchase.');}
    finally{setBusy(false);}
  }
  return <div className="max-w-2xl mx-auto space-y-6"><header><p className="eyebrow">Earn it. Collect it.</p><h1 className="screen-heading">XP store</h1><p className="text-primary mt-3">{access?.xp.toLocaleString()??'—'} XP available</p></header>
    <p className="text-sm text-muted-foreground">Keep your favourite five actors and five directors. Every pack reveals one person. Keep, skip, or replace a card when full. No selling or XP refunds.</p>
    <div className="grid grid-cols-2 gap-3">{['actor','director'].map(type=><section className="destination-card" key={type}><h2 className="text-lg font-semibold capitalize">{type} pack</h2><p className="text-2xl font-bold my-4">150 XP</p><p className="text-xs text-muted-foreground mb-4">One collectible. A duplicate can be skipped.</p><Button className="w-full" disabled={busy||!access||access.xp<150} onClick={()=>void redeem(type)}>Get pack</Button></section>)}</div>
    <a className="block destination-card text-primary" href="/dashboard?tab=profile">Visit the Geek wardrobe →</a>
    <section className="destination-card space-y-3"><h2 className="text-lg font-semibold">Extra AI questions</h2><p className="text-sm text-muted-foreground">Separate from XP. Question packs will be available to Free and Pro members when payments launch.</p><Button disabled>Question purchases coming soon</Button><p className="text-xs text-muted-foreground">XP and subscriptions cannot be bought in this build.</p></section>
  </div>;
};export default Store;
