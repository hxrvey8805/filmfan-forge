import {PRO_PREVIEW,pounds,annualSavingPercent} from "@/lib/onboarding";
import { useProAccess } from '@/hooks/use-pro-access';
import type { QuestionAllowance } from '@/lib/question-allowance';
import { Button } from './ui/button';
export function YourPlan({allowance}:{allowance?:QuestionAllowance}){
  const access=useProAccess();
  const name=access?.plan==='annual'?'Annual Pro':access?.plan==='monthly'?'Monthly Pro':'Free';
  return <section id="your-plan" className="destination-card space-y-5 scroll-mt-24" aria-labelledby="your-plan-heading">
    <div className="flex justify-between items-center gap-3"><h2 id="your-plan-heading" className="text-xl font-semibold">Your Plan</h2><span className="rounded-full bg-primary/15 text-primary px-3 py-1 text-sm">{access?name:'Checking…'}</span></div>
    {!access && <p role="status" className="text-sm text-muted-foreground">We couldn’t confirm your plan yet. Paid features stay locked until it’s confirmed.</p>}
    {access && <><p className="text-sm text-muted-foreground">{access.plan==='free'?'Manual lists, Arcade Geek in Focus, one game a day and XP collectibles.':'Smart Lists, unlimited games and a daily reward spin after your first win.'}</p>
      <div className="grid grid-cols-2 gap-3">
        <div><strong className="text-2xl">{access.xp.toLocaleString()} XP</strong><p className="text-xs text-muted-foreground">Available to spend</p></div>
        <div><strong className="text-2xl">Level {1+Math.floor(access.lifetimeXp/1000)}</strong><p className="text-xs text-muted-foreground">{access.lifetimeXp.toLocaleString()} lifetime XP</p></div>
      </div>
      {(access.plan==='annual'||access.badges.length>0)&&<div className="flex flex-wrap gap-2" aria-label="Your badges">{access.plan==='annual'&&<span className="rounded-full bg-primary/15 text-primary px-3 py-1 text-xs">Annual film buff</span>}{access.badges.map(badge=><span key={badge} className="rounded-full bg-secondary px-3 py-1 text-xs capitalize">{badge.replace(/_/g,' ')}</span>)}</div>}
      <p className="text-xs text-muted-foreground">{access.xpToday} / {access.xpDailyCap} XP earned today · resets at midnight UTC. Spending XP never lowers your level.</p></>}
    <div className="border-t border-border pt-4 space-y-2"><h3 className="font-semibold">AI questions</h3>
      {allowance?.mode==='monthly'?<>
        <p>{allowance.included} included remaining{allowance.limit?` of ${allowance.limit} this month`:''} · {allowance.purchased} purchased</p>
        {allowance.renewsAt&&<p className="text-xs text-muted-foreground">This allowance ends {new Date(allowance.renewsAt).toLocaleDateString('en-GB')}. No rollover.</p>}
      </>:<p className="text-sm text-muted-foreground">{allowance?.mode==='beta'?'Private beta accounting is still active. Subscription allowances have not been activated.':'Your question balance is temporarily unavailable.'}</p>}
      <p className="text-xs text-muted-foreground">Free includes no AI questions. Both Pro plans include 15 each subscription month. Purchased questions work on any plan and are used after your included questions. XP cannot buy AI questions.</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-border p-4"><h3 className="font-semibold">Monthly Pro</h3><p className="text-2xl font-bold my-2">£8.99<span className="text-sm font-normal"> / month</span></p><p className="text-xs text-muted-foreground">15 questions each month. Unlock Geek skins with XP.</p><Button disabled className="w-full mt-4">Purchases coming soon</Button></div>
      <div className="rounded-xl border border-primary bg-primary/5 p-4"><span className="text-xs font-bold text-primary">SAVE {annualSavingPercent}% · ALL GEEK SKINS</span><h3 className="font-semibold mt-1">Annual Pro</h3><p className="text-4xl font-extrabold tracking-tight mt-3">{pounds(PRO_PREVIEW.annualPence/12)}<span className="text-base font-normal tracking-normal"> / month</span></p><p className="text-xs text-muted-foreground mt-1">Monthly equivalent</p><p className="text-sm font-semibold mt-2">{pounds(PRO_PREVIEW.annualPence)} billed yearly</p><p className="text-xs text-muted-foreground mt-2">15 questions each month. Existing and new Geek skins included while subscribed.</p><Button disabled className="w-full mt-4">Purchases coming soon</Button></div>
    </div>
    <p className="text-xs text-muted-foreground">Purchases are disabled. Choosing or viewing a plan does not start a subscription or free trial.</p>
  </section>;
}
