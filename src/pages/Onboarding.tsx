import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Clapperboard, Gamepad2, Heart, MessageCircle, Search, ShieldCheck, Sparkles, Ticket, X } from 'lucide-react';
import { GeekAvatar } from '@/components/GeekAvatar';
import { ContentLoading } from '@/components/ContentLoading';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useViewerSession } from '@/hooks/use-viewer-session';
import { supabase } from '@/integrations/supabase/client';
import { completeOnboarding } from '@/lib/onboarding-service';
import { annualSavingPence, annualSavingPercent, GEEK_DEMO, needsOnboarding, ONBOARDING_PICKS,
  onboardingDraftKey, onboardingSearchResults, pounds, PRO_PREVIEW, readOnboardingDraft, titleIdentity,
  writeOnboardingDraft, type OnboardingDraft, type OnboardingTitle } from '@/lib/onboarding';
import './onboarding.css';

const isDesignPreview = import.meta.env.MODE === 'mobile-preview';

function Poster({ title }: { title: OnboardingTitle }) {
  const [failed, setFailed] = useState(false);
  return title.posterPath && !failed ? <img src={title.posterPath} alt="" onError={() => setFailed(true)} />
    : <span className="onboarding-poster-fallback"><Clapperboard /><span>{title.title}</span></span>;
}

function OnboardingFlow({ owner, demo }: { owner: string; demo: boolean }) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<OnboardingDraft>(() => readOnboardingDraft(owner));
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OnboardingTitle[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectionNotice, setSelectionNotice] = useState('');
  const [answerVisible, setAnswerVisible] = useState(false);
  const [planDialog, setPlanDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false), alive = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const { step, titles, plan } = draft;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { writeOnboardingDraft(owner, draft); }, [owner, draft]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); window.scrollTo?.(0, 0); }, [step]);
  useEffect(() => {
    let current = true;
    setSearchError(''); setResults([]);
    if (query.trim().length < 2) { setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('search-content', { body: { query: query.trim(), type: 'both' } });
        if (error) throw error;
        if (current) setResults(onboardingSearchResults(data?.results));
      } catch { if (current) setSearchError('Couldn’t load titles. Try again, or add them later.'); }
      finally { if (current) setSearching(false); }
    }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [query]);
  const go = (step: number) => { setError(''); setDraft(d => ({ ...d, step })); };
  function toggle(title: OnboardingTitle) {
    setSelectionNotice('');
    const selected = titles.some(t => titleIdentity(t) === titleIdentity(title));
    if (!selected && titles.length === 3) { setSelectionNotice('Three is a great start. Remove one to swap it.'); return; }
    setDraft(d => ({ ...d, titles: selected ? d.titles.filter(t => titleIdentity(t) !== titleIdentity(title)) : [...d.titles, title] }));
  }
  async function finish() {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      let account = owner;
      if (demo && isDesignPreview) {
        const result = await supabase.auth.signInWithPassword({ email: 'filmgeek@example.com', password: 'sample-only' });
        if (result.error || !result.data.user) throw Error('Preview session unavailable');
        account = result.data.user.id;
      }
      await completeOnboarding(account, titles);
      try { localStorage.removeItem(onboardingDraftKey(owner)); } catch { /* optional storage */ }
      if (!alive.current) return;
      navigate('/dashboard', { replace: true });
    } catch {
      if (alive.current) { setError('We couldn’t finish setting things up. Your picks are kept here—please try again.'); setBusy(false); }
    } finally { submitting.current = false; }
  }
  const displayed = query.trim().length >= 2 ? results : ONBOARDING_PICKS;
  return <main className="onboarding" data-step={step}>
    <div className="onboarding-shell">
      <header className="onboarding-top">
        {step > 0 ? <button className="onboarding-back" aria-label="Previous step" disabled={busy} onClick={() => go(step - 1)}><ArrowLeft size={20} /></button>
          : <img className="onboarding-mark" src="/cinegeek-mark.svg" alt="CineGeek" />}
        <div className="onboarding-progress" role="progressbar" aria-label="Getting started" aria-valuemin={0} aria-valuemax={4} aria-valuenow={step + 1}>
          {[0, 1, 2, 3].map(i => <span key={i} data-filled={i <= step} />)}
        </div>
        <span className="onboarding-step-count">0{step + 1}<span> / 04</span></span>
      </header>

      <section className="onboarding-page" key={step} aria-labelledby="onboarding-heading">
        {step === 0 && <>
          <div className="onboarding-hero-stage">
            <span className="onboarding-orbit orbit-one" /><span className="onboarding-orbit orbit-two" />
            <span className="onboarding-floating float-ticket"><Ticket size={22} /></span>
            <span className="onboarding-floating float-heart"><Heart size={20} /></span>
            <span className="onboarding-speech">Hey, watch buddy.</span>
            <div className="onboarding-hero-geek"><GeekAvatar look="classic" /></div>
            <span className="onboarding-stage-label"><span /> Your Geek is ready.</span>
          </div>
          <p className="onboarding-eyebrow">For every film. Every episode.</p>
          <h1 ref={heading} tabIndex={-1} id="onboarding-heading">Your next watch<br />has <em>company.</em></h1>
          <p className="onboarding-intro">Meet Geek. Big on movies.<br />Even bigger on keeping the ending to himself.</p>
          <div className="onboarding-benefit-chips"><span><MessageCircle size={14} /> Ask away</span><span><Heart size={14} /> Keep your favourites</span><span><Gamepad2 size={14} /> Play a little</span></div>
        </>}

        {step === 1 && <>
          <p className="onboarding-eyebrow">Let’s make this your place</p>
          <h1 ref={heading} tabIndex={-1} id="onboarding-heading">What’s on<br /><em>your screen?</em></h1>
          <p className="onboarding-intro">Pick up to three films or shows you’re watching.<br />We’ll have them ready on your Home.</p>
          <label className="onboarding-search"><Search size={18} /><input aria-label="Search movies and TV shows" placeholder="Find a film or TV show" value={query} onChange={e => setQuery(e.target.value)} /><button aria-label="Clear search" hidden={!query} onClick={() => setQuery('')}><X size={16} /></button></label>
          <div className="onboarding-picks-label"><span>{query.trim().length >= 2 ? 'Search results' : 'A few familiar faces'}</span><b>{titles.length} / 3 selected</b></div>
          {titles.length > 0 && <div className="onboarding-selected" aria-label="Your selected titles">{titles.map(t => <button key={titleIdentity(t)} aria-label={`Remove ${t.title}`} onClick={() => toggle(t)}>{t.title}<X size={12} /></button>)}</div>}
          <div role="status" className="onboarding-search-status">{selectionNotice || searchError || (searching ? 'Finding your next watch…' : query.trim().length >= 2 && !results.length ? 'No matches yet. Try another title.' : '')}</div>
          {!searching && !searchError && <div className="onboarding-poster-grid">{displayed.map(t => {
            const selected = titles.some(s => titleIdentity(s) === titleIdentity(t));
            return <button key={titleIdentity(t)} className="onboarding-poster" aria-label={`Select ${t.title}`} aria-pressed={selected} onClick={() => toggle(t)}>
              <div className="onboarding-poster-art"><Poster title={t} /><span className="onboarding-poster-check">{selected ? <Check size={14} strokeWidth={3} /> : '+'}</span><span className="onboarding-media-type">{t.type === 'tv' ? 'SERIES' : 'FILM'}</span></div>
              <strong>{t.title}</strong><small>{t.year}</small>
            </button>;
          })}</div>}
        </>}

        {step === 2 && <>
          <p className="onboarding-eyebrow">All the curiosity. None of the spoilers.</p>
          <h1 ref={heading} tabIndex={-1} id="onboarding-heading">A little context.<br /><em>A lot more story.</em></h1>
          <p className="onboarding-intro">Set your watching point. Ask what’s on your mind.<br />Geek stays with you, scene by scene.</p>
          <div className="onboarding-demo">
            <div className="onboarding-demo-film"><span><Clapperboard size={16} /> {GEEK_DEMO.title}</span><b>{GEEK_DEMO.timestamp}</b></div>
            <div className="onboarding-demo-scene"><Ticket size={27} /><p>{GEEK_DEMO.scene}</p></div>
            <p className="onboarding-example-label">Original fictional scene · sample conversation</p>
            {!answerVisible ? <button className="onboarding-question-prompt" onClick={() => setAnswerVisible(true)}><MessageCircle size={17} /><span>{GEEK_DEMO.question}</span><ArrowRight size={18} /></button>
              : <div className="onboarding-conversation"><div className="onboarding-user-bubble">{GEEK_DEMO.question}</div><div className="onboarding-geek-answer"><div className="onboarding-chat-avatar"><GeekAvatar look="classic" still /></div><div><b>Geek <Sparkles size={12} /></b><p>{GEEK_DEMO.answer}</p></div></div></div>}
            <div className="onboarding-boundary"><ShieldCheck size={15} /> This sample stops at {GEEK_DEMO.timestamp}.</div>
          </div>
        </>}

        {step === 3 && <>
          <div className="onboarding-pro-art" aria-hidden="true"><div><GeekAvatar look="jedi" still /></div><div><GeekAvatar look="classic" /></div><div><GeekAvatar look="spider" still /></div><span className="onboarding-pro-pill">CINEGEEK <b>PRO</b></span></div>
          <h1 ref={heading} tabIndex={-1} id="onboarding-heading">Make every watch<br /><em>yours.</em></h1>
          <p className="onboarding-intro">More story. More personality. Your kind of Geek.</p>
          <div className="onboarding-pro-benefits"><span><Check /> {PRO_PREVIEW.questionsPerMonth} Geek questions each month</span><span><Check /> Smart Lists & Geek in your Focus Room</span><span><Check /> Unlimited games. More ways to play.</span></div>
          <fieldset className="onboarding-plans"><legend className="sr-only">Choose a Pro plan</legend>
            <label className="onboarding-plan annual-plan" data-selected={plan === 'annual'}>
              <input type="radio" name="pro-plan" value="annual" checked={plan === 'annual'} onChange={() => setDraft(d => ({ ...d, plan: 'annual' }))} />
              <div className="onboarding-plan-ribbon"><Sparkles size={12} /><span>YOUR GEEK, ALL YEAR</span><b>SAVE ≈{annualSavingPercent}%</b></div>
              <div className="onboarding-plan-body"><div className="onboarding-plan-name">Annual Pro <span className="onboarding-radio">{plan === 'annual' && <Check size={14} strokeWidth={3} />}</span></div>
                <div className="onboarding-price"><strong>{pounds(PRO_PREVIEW.annualPence)}</strong><span> / year</span></div>
                <p className="onboarding-equivalent">Just <b>{pounds(PRO_PREVIEW.annualPence / 12)}/month</b>, billed yearly</p>
                <div className="onboarding-annual-extra"><span>All Geek skins included</span><span>Save {pounds(annualSavingPence)} a year*</span></div>
              </div>
            </label>
            <label className="onboarding-plan monthly-plan" data-selected={plan === 'monthly'}><input type="radio" name="pro-plan" value="monthly" checked={plan === 'monthly'} onChange={() => setDraft(d => ({ ...d, plan: 'monthly' }))} /><div><b>Monthly Pro</b><span>Keep it month to month</span></div><div><strong>{pounds(PRO_PREVIEW.monthlyPence)}</strong><small> / month</small></div><span className="onboarding-radio">{plan === 'monthly' && <Check size={14} strokeWidth={3} />}</span></label>
          </fieldset>
          <p className="onboarding-plan-note">*Compared with 12 monthly payments ({pounds(PRO_PREVIEW.monthlyPence * 12)}).<br />Plan preview · prices and allowances are not yet on sale.</p>
        </>}
      </section>

      <footer className="onboarding-footer">
        {error && <p className="onboarding-error" role="alert">{error}</p>}
        {step === 0 && <><button className="onboarding-primary" onClick={() => go(1)}>Let’s make it yours <ArrowRight size={19} /></button><p>Just a few picks. Then you’re in.</p></>}
        {step === 1 && <><button className="onboarding-primary" onClick={() => go(2)}>{titles.length ? `Continue with ${titles.length} ${titles.length === 1 ? 'pick' : 'picks'}` : 'Continue'}<ArrowRight size={19} /></button>{!titles.length && <button className="onboarding-subtle" onClick={() => go(2)}>I’ll add titles later</button>}</>}
        {step === 2 && <><button className="onboarding-primary" onClick={() => go(3)}>Meet CineGeek Pro <ArrowRight size={19} /></button><p>Your timestamp is always the stopping point.</p></>}
        {step === 3 && <><button className="onboarding-primary" disabled={busy} onClick={() => setPlanDialog(true)}>Choose {plan === 'annual' ? 'Annual' : 'Monthly'} Pro <ArrowRight size={19} /></button><button className="onboarding-subtle free-option" disabled={busy} onClick={finish}>{busy ? 'Getting your Home ready…' : 'Continue with Free'}</button></>}
      </footer>
    </div>
    <Dialog open={planDialog} onOpenChange={setPlanDialog}><DialogContent className="onboarding-plan-dialog"><DialogHeader><DialogTitle>Your {plan === 'annual' ? 'Annual' : 'Monthly'} Pro preview</DialogTitle><DialogDescription>Purchases aren’t enabled yet. No payment will be taken and no subscription will start.</DialogDescription></DialogHeader><p>{plan === 'annual' ? `${pounds(PRO_PREVIEW.annualPence)} billed each year (${pounds(PRO_PREVIEW.annualPence / 12)} per month equivalent).` : `${pounds(PRO_PREVIEW.monthlyPence)} billed each month.`} The proposed plan renews automatically until cancelled. There is no free trial.</p><button className="onboarding-primary" onClick={() => setPlanDialog(false)}>Back to plans</button></DialogContent></Dialog>
  </main>;
}

export default function Onboarding({ demo = false }: { demo?: boolean }) {
  const viewer = useViewerSession();
  if (viewer === undefined) return <ContentLoading />;
  const preview = demo && isDesignPreview;
  if (!viewer && !preview) return <Navigate to="/auth?mode=signup" replace />;
  if (viewer && !preview && !needsOnboarding(viewer)) return <Navigate to="/dashboard" replace />;
  const owner = preview ? 'design-onboarding-tour' : viewer!.id;
  return <OnboardingFlow key={owner} owner={owner} demo={preview} />;
}
