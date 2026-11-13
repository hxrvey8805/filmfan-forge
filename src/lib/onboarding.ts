export const ONBOARDING_KEY = 'cinegeek_onboarding_version';
export const ONBOARDING_VERSION = 1;
export const needsOnboarding = (user: { user_metadata?: Record<string, unknown> } | null | undefined) =>
  user?.user_metadata?.[ONBOARDING_KEY] === 0;

// Design prices only. StoreKit products and entitlements must be connected and
// verified before enabling purchases. This config never grants Pro access.
export const PRO_PREVIEW = { monthlyPence: 899, annualPence: 7999, questionsPerMonth: 15, purchasesEnabled: false } as const;
export const pounds = (pence: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
export const annualSavingPence = PRO_PREVIEW.monthlyPence * 12 - PRO_PREVIEW.annualPence;
export const annualSavingPercent = Math.round(annualSavingPence / (PRO_PREVIEW.monthlyPence * 12) * 100);

export type OnboardingTitle = { id: number; type: 'tv' | 'movie'; title: string; year?: number; posterPath: string };
export type OnboardingDraft = { step: number; titles: OnboardingTitle[]; plan: 'annual' | 'monthly' };
export const titleIdentity = (title: Pick<OnboardingTitle, 'id' | 'type'>) => `${title.type}:${title.id}`;
const poster = (path: string) => `https://image.tmdb.org/t/p/w500/${path}.jpg`;
export const ONBOARDING_PICKS: OnboardingTitle[] = [
  { id: 60574, type: 'tv', title: 'Peaky Blinders', year: 2013, posterPath: poster('vUUqzWa2LnHIVqkaKVlVGkVcZIW') },
  { id: 414906, type: 'movie', title: 'The Batman', year: 2022, posterPath: poster('74xTEgt7R36Fpooo50r9T25onhq') },
  { id: 98, type: 'movie', title: 'Gladiator', year: 2000, posterPath: poster('ty8TGRuvJLPUmAR1H1nRIsgwvim') },
  { id: 335984, type: 'movie', title: 'Blade Runner 2049', year: 2017, posterPath: poster('gajva2L0rPYkEWjzgFlBXCAVBE5') },
  { id: 1399, type: 'tv', title: 'Game of Thrones', year: 2011, posterPath: poster('37sTgAG9QardbdzCq51FoUw1Ijb') },
  { id: 37799, type: 'movie', title: 'The Social Network', year: 2010, posterPath: poster('n0ybibhJtQ5icDqTp8eRytcIHJx') },
];
export function validOnboardingTitle(value: unknown): value is OnboardingTitle {
  if (!value || typeof value !== 'object') return false;
  const t = value as OnboardingTitle;
  return Number.isSafeInteger(t.id) && t.id > 0 && ['movie', 'tv'].includes(t.type) &&
    typeof t.title === 'string' && t.title.length > 0 && t.title.length <= 300 &&
    typeof t.posterPath === 'string' && (t.posterPath === '' || /^https:\/\/image\.tmdb\.org\/t\/p\/[\w/-]+\.(?:jpg|png)$/.test(t.posterPath)) &&
    (t.year == null || Number.isInteger(t.year));
}
export function onboardingSearchResults(results: unknown): OnboardingTitle[] {
  if (!Array.isArray(results)) return [];
  // Catalogue entries without artwork are still selectable. Do not load an
  // arbitrary placeholder URL supplied by a result or a stored draft.
  const titles = results.map(value => {
    if (!value || typeof value !== 'object') return null;
    const posterPath = typeof value.posterPath === 'string' && /^https:\/\/image\.tmdb\.org\/t\/p\/[\w/-]+\.(?:jpg|png)$/.test(value.posterPath) ? value.posterPath : '';
    return { id: value.id, type: value.type, title: value.title, year: value.year, posterPath };
  }).filter(validOnboardingTitle);
  return [...new Map(titles.map(title => [titleIdentity(title), title])).values()];
}
export const onboardingDraftKey = (owner: string) => `cinegeek.onboarding.v1.${owner}`;
export function readOnboardingDraft(owner: string): OnboardingDraft {
  const empty: OnboardingDraft = { step: 0, titles: [], plan: 'annual' };
  try {
    const saved = JSON.parse(localStorage.getItem(onboardingDraftKey(owner)) ?? 'null');
    if (!saved || !Number.isInteger(saved.step) || saved.step < 0 || saved.step > 3) return empty;
    const titles: OnboardingTitle[] = Array.isArray(saved.titles) ? saved.titles.filter(validOnboardingTitle) : [];
    return { step: saved.step, plan: saved.plan === 'monthly' ? 'monthly' : 'annual',
      titles: [...new Map(titles.map(t => [titleIdentity(t), t])).values()].slice(0, 3) };
  } catch { return empty; }
}
export function writeOnboardingDraft(owner: string, draft: OnboardingDraft) {
  try { localStorage.setItem(onboardingDraftKey(owner), JSON.stringify(draft)); } catch { /* Session still works without storage. */ }
}

// An original fictional micro-scene: no real title's plot or future events are
// exposed during signup. The same fixed example is shown to every viewer.
export const GEEK_DEMO = {
  title: 'The Last Screening', timestamp: '04:12',
  scene: 'Maya finds two tickets tucked inside a photo of her and her dad. She pockets both, then texts her brother: “Meet me at the old cinema?”',
  question: 'Why does Maya keep the second ticket?',
  answer: 'That little ticket feels like an invitation. She finds it in a photo with her dad, then reaches out to her brother—so my read is that this cinema trip means something to their family. We’ve seen her keep both tickets, but she hasn’t said who the second one is for. What do you make of it?',
};
