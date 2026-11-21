import { useLayoutEffect, type ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronRight, ShieldCheck, Smartphone, LogOut, Crown, Shirt, LifeBuoy, Layers3, Zap, MessageCircle } from "lucide-react";
import { YourPlan } from "./YourPlan";
import { GeekWardrobe } from "./GeekWardrobe";
import { GeekAvatar } from "./GeekAvatar";
import { useGeekOutfit, outfits } from "@/hooks/use-geek-outfit";
import { useProAccess } from "@/hooks/use-pro-access";
import { type QuestionAllowance } from '@/lib/question-allowance';
import "./profile-home.css";

function Row({ icon, title, detail }: { icon: ReactNode; title: string; detail?: string }) {
  return <><span className="profile-row-icon">{icon}</span><span className="profile-row-copy"><strong>{title}</strong>{detail && <small>{detail}</small>}</span><ChevronRight size={17} aria-hidden="true" /></>;
}

export function ProfileHome({ email, onLogout, onInstall, allowance }: {
  email: string; onLogout: () => void; onInstall: () => void; allowance?: QuestionAllowance;
}) {
  const access = useProAccess(), { look } = useGeekOutfit();
  const [params] = useSearchParams(), location = useLocation();
  const view = params.get('view') ?? (location.hash === '#your-plan' ? 'plan' : null);
  const plan = !access ? 'Checking plan…' : access.plan === 'annual' ? 'Annual Pro' : access.plan === 'monthly' ? 'Monthly Pro' : 'Free';
  const href = (tab: string, next?: string) => {
    const p = new URLSearchParams(params); p.set('tab', tab); p.delete('view');
    if (next) p.set('view', next);
    return `/dashboard?${p}`;
  };
  useLayoutEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [view]);
  if (view === 'plan' || view === 'wardrobe') return <div className="profile-page profile-detail">
    <Link className="profile-back" to={href('profile')}><ArrowLeft size={18} />Profile</Link>
    {view === 'plan' ? <YourPlan allowance={allowance} /> : <GeekWardrobe />}
  </div>;
  return <div className="profile-page animate-fade-in">
    <h1 className="screen-heading">Profile</h1>
    <section className="profile-membership" aria-label="Your membership">
      <Link to={href('profile', 'wardrobe')} className="profile-geek" aria-label="Dress your Geek"><GeekAvatar look={look} /></Link>
      <div className="profile-identity"><span className="profile-plan-tag">{access?.plan !== 'free' && access && <Crown size={13} />}{plan}</span><h2>Your CineGeek</h2><p>{email}</p><span className="profile-level">{access ? `Level ${1 + Math.floor(access.lifetimeXp / 1000)}` : 'Loading progress…'}</span></div>
      <div className="profile-stats">
        <Link to={href('play', 'store')}><Zap size={16} /><span><strong>{access ? access.xp.toLocaleString() : '—'}</strong><small>XP to spend</small></span></Link>
        <Link to={href('profile', 'plan')}><MessageCircle size={16} /><span><strong>{allowance?.mode === 'monthly' ? allowance.included + allowance.purchased : '—'}</strong><small>Questions left</small></span></Link>
      </div>
    </section>
    <section className="profile-menu" aria-label="Your CineGeek settings">
      <Link to={href('profile', 'plan')} className="profile-row"><Row icon={<Crown />} title="Your Plan" detail={access?.plan === 'free' ? 'Explore Pro' : 'Membership & questions'} /></Link>
      <Link to={href('profile', 'wardrobe')} className="profile-row"><Row icon={<Shirt />} title="Dress your Geek" detail={outfits[look].name} /></Link>
      <Link to={href('play', 'packs')} className="profile-row"><Row icon={<Layers3 />} title="Your collection" detail="Cards & packs" /></Link>
    </section>
    <section className="profile-menu" aria-label="Account settings">
      <Link to="/account" className="profile-row"><Row icon={<ShieldCheck />} title="Account & privacy" /></Link>
      <Link to="/support" className="profile-row"><Row icon={<LifeBuoy />} title="Help & support" /></Link>
      {import.meta.env.MODE !== 'native' && <button onClick={onInstall} className="profile-row"><Row icon={<Smartphone />} title="Add to home screen" /></button>}
    </section>
    <div className="profile-footer"><button onClick={onLogout}><LogOut size={15} />Sign out</button><Link to="/privacy">Privacy notice</Link></div>
  </div>;
}
