import type { ReactNode } from 'react';
import { Check, ChevronDown, Crown, Glasses, MessageCircle } from 'lucide-react';
import type { ProAccess } from '@/lib/pro-access';
import type { QuestionAllowance } from '@/lib/question-allowance';
import { PRO_PREVIEW, pounds, annualSavingPercent } from '@/lib/onboarding';
import './your-plan.css';

export function PlanSummary({ access, allowance }: { access: ProAccess | null; allowance?: QuestionAllowance }) {
  const pro = access && access.plan !== 'free';
  const name = !access ? 'Checking your plan…' : access.plan === 'annual' ? 'Annual Pro' : access.plan === 'monthly' ? 'Monthly Pro' : 'Free';
  const balance = allowance?.mode === 'monthly' ? allowance : null;
  const total = balance ? balance.included + balance.purchased : null;
  const benefits = !access ? [] : pro ? [
    '10 AI questions each month', 'Smart Lists', 'Unlimited actor games',
    'Daily spin after your first eligible win',
    access.plan === 'annual' ? 'All Geek skins, including new releases' : 'Unlock Geek skins with XP or reward spins',
  ] : ['Manual movie & TV lists', 'Focus with Arcade Geek', 'One actor game each day', 'Earn XP for collectibles'];
  return <>
    <h2 id="your-plan-heading" className="plan-page-title">Your Plan</h2>
    <section className={`plan-membership${pro ? ' plan-membership-pro' : ''}`} aria-label="Current membership">
      <div className="plan-membership-top">
        <div><p className="plan-eyebrow">Current membership</p><h3>{name}</h3></div>
        <span className="plan-emblem" aria-hidden="true">{pro ? <Crown /> : <Glasses />}</span>
      </div>
      {access && <p className="plan-membership-caption">{access.plan === 'annual' ? 'The full Geek wardrobe is yours.' : access.plan === 'monthly' ? 'More ways to watch, play and discover.' : 'Your lists. Your Geek. Your next watch.'}</p>}
      {!access && <p role="status" className="plan-muted">Your plan is unavailable right now. Paid features stay locked until it’s confirmed.</p>}
      <div className="plan-question-balance" aria-labelledby="plan-questions-heading">
        <div className="plan-balance-heading"><h3 id="plan-questions-heading">AI questions</h3><MessageCircle size={17} aria-hidden="true" /></div>
        {balance ? <>
          <p className="plan-balance-total"><strong>{total}</strong><span>remaining</span></p>
          {balance.limit > 0 && <>
            <div className="plan-allowance-track" role="meter" aria-label="Included questions remaining" aria-valuemin={0} aria-valuemax={balance.limit} aria-valuenow={balance.included}><span style={{ width: `${balance.included / balance.limit * 100}%` }} /></div>
            <p className="plan-balance-breakdown">{balance.included} of {balance.limit} included{balance.purchased > 0 && <span> · {balance.purchased} purchased</span>}</p>
          </>}
          {balance.limit === 0 && <p className="plan-balance-breakdown">{balance.purchased > 0 ? `${balance.purchased} purchased · none included on Free` : 'No AI questions included on Free.'}</p>}
          {balance.renewsAt && <p className="plan-allowance-date">Allowance ends {new Date(balance.renewsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
        </> : <p role="status" className="plan-muted">{allowance?.mode === 'beta' ? 'Private beta access. Monthly allowances aren’t active yet.' : 'Your question balance is temporarily unavailable.'}</p>}
      </div>
    </section>
    <div className="plan-details-group">
      {access && <details className="plan-disclosure">
        <summary>Plan benefits<ChevronDown size={17} aria-hidden="true" /></summary>
        <div className="plan-disclosure-body">
          <ul className="plan-benefits">{benefits.map(benefit => <li key={benefit}><Check size={15} aria-hidden="true" /><span>{benefit}</span></li>)}</ul>
          {access.badges.length > 0 && <div className="plan-badges" aria-label="Your badges">{access.badges.map(badge => <span key={badge}>{badge.replace(/_/g, ' ')}</span>)}</div>}
        </div>
      </details>}
      <details className="plan-disclosure">
        <summary>How questions work<ChevronDown size={17} aria-hidden="true" /></summary>
        <div className="plan-disclosure-body plan-question-rules">
          <p>Monthly and Annual Pro include 10 questions each subscription month. Unused included questions don’t roll over.</p>
          <p>Purchased questions work on any plan and are used after your included questions.</p>
          <p>XP is for skins and collectibles, separate from AI questions.</p>
        </div>
      </details>
    </div>
  </>;
}

export function PlanComparison({ access, children }: { access: ProAccess | null; children: ReactNode }) {
  return <details key={access?.plan ?? 'unknown'} className="plan-comparison plan-disclosure" open={!access || access.plan === 'free'}>
    <summary>{access?.plan === 'free' ? 'Explore Pro' : 'Compare plans'}<ChevronDown size={17} aria-hidden="true" /></summary>
    <div className="plan-comparison-body"><p className="plan-comparison-intro">Both plans include 10 AI questions a month, Smart Lists and unlimited games.</p>{children}</div>
  </details>;
}

export function PlanPrices({ monthlyAction, annualAction, monthlyPrice, annualPrice, annualMonthlyPrice, showSaving = true }: {
  monthlyAction: ReactNode; annualAction: ReactNode; monthlyPrice?: string; annualPrice?: string; annualMonthlyPrice?: string; showSaving?: boolean;
}) {
  return <div className="plan-options">
    <section className="plan-option plan-option-annual" aria-label="Annual Pro option">
      <div className="plan-option-heading"><h3>Annual Pro</h3><span>{showSaving ? `SAVE ${annualSavingPercent}%` : 'ALL SKINS'}</span></div>
      <p className="plan-price"><strong>{annualMonthlyPrice ?? pounds(PRO_PREVIEW.annualPence / 12)}</strong><span>/ month</span></p>
      <p className="plan-price-note">Monthly equivalent · <strong>{annualPrice ?? pounds(PRO_PREVIEW.annualPence)} billed yearly</strong></p>
      <p className="plan-option-extra">Every Geek skin while subscribed, including new releases.</p>
      {annualAction}
    </section>
    <section className="plan-option" aria-label="Monthly Pro option">
      <div className="plan-option-heading"><h3>Monthly Pro</h3></div>
      <p className="plan-price"><strong>{monthlyPrice ?? '£8.99'}</strong><span>/ month</span></p>
      <p className="plan-price-note">Billed monthly</p>
      <p className="plan-option-extra">Unlock Geek skins as you play.</p>
      {monthlyAction}
    </section>
  </div>;
}
