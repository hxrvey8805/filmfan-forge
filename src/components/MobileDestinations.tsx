import {Link} from "react-router-dom";
import { YourPlan } from "./YourPlan";
import { ChevronRight, ShieldCheck, Smartphone, LogOut, UserRound } from "lucide-react";
import { GeekWardrobe } from "./GeekWardrobe";
import { Button } from "@/components/ui/button";
import { type QuestionAllowance } from '@/lib/question-allowance';

export function ProfileHome({ email, onLogout, onInstall, allowance }: {
  email: string; onLogout: () => void; onInstall: () => void;
  allowance?: QuestionAllowance;
}) {
  return <div className="max-w-2xl mx-auto space-y-7 animate-fade-in">
    <div><p className="eyebrow">Your little corner of cinema</p><h1 className="screen-heading mt-2">Profile</h1></div>
    <div className="flex items-center gap-4 py-2"><span className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center"><UserRound className="w-7 h-7 text-primary" /></span><div className="min-w-0"><h2 className="text-lg font-semibold">A fellow film geek</h2><p className="text-sm text-muted-foreground break-all mt-1">{email}</p></div></div>
    <YourPlan allowance={allowance}/>
    <GeekWardrobe/>
    <div className="rounded-2xl border border-white/10 overflow-hidden">
      <div className="flex gap-3 p-5"><ShieldCheck className="w-5 h-5 shrink-0 text-primary mt-0.5" /><div><h3 className="text-sm font-medium">Your place in the story</h3><p className="text-xs text-muted-foreground mt-2 leading-relaxed">Open a title, choose your episode and set your timestamp. Your companion and conversation stay within that point.</p></div></div>
      {import.meta.env.MODE !== "native" && <button onClick={onInstall} className="w-full border-t border-white/10 p-5 flex items-center gap-3 text-left hover:bg-white/5"><Smartphone className="w-5 h-5 text-muted-foreground" /><span className="flex-1 text-sm">Add CineGeek to your home screen</span><ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" /></button>}
    </div>
    <Button variant="outline" asChild className="w-full rounded-xl"><Link to="/account">Account & privacy</Link></Button>
    <p className="text-center text-sm"><Link to="/support" className="text-primary">Support</Link> · <Link to="/privacy" className="text-primary">Privacy notice</Link></p>
    <Button variant="outline" onClick={onLogout} className="w-full rounded-xl gap-2 bg-transparent text-muted-foreground"><LogOut className="w-4 h-4" />Sign out</Button>
    <p className="text-center text-[11px] text-muted-foreground">Made for the “wait, what just happened?” moments.</p>
  </div>;
}
