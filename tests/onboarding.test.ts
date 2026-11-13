// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { annualSavingPence, needsOnboarding, ONBOARDING_KEY, ONBOARDING_PICKS, onboardingSearchResults,
  pounds, PRO_PREVIEW, readOnboardingDraft, writeOnboardingDraft } from '../src/lib/onboarding';
import { completeOnboarding } from '../src/lib/onboarding-service';

const api = vi.hoisted(() => ({ getUser: vi.fn(), updateUser: vi.fn(), from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: api, from: api.from } }));
let rows: Record<string, unknown>[], inserts: Record<string, unknown>[], failInsert: boolean;
beforeEach(() => {
  localStorage.clear(); vi.resetAllMocks(); rows = []; inserts = []; failInsert = false;
  api.getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
  api.updateUser.mockResolvedValue({ error: null });
  api.from.mockImplementation(() => {
    const filters: [string, unknown][] = [];
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
      then: (resolve: (value: unknown) => void) => Promise.resolve({ data: rows.filter(row => filters.every(([key, value]) => row[key] === value)), error: null }).then(resolve),
      insert: async (row: Record<string, unknown>) => {
        inserts.push(row);
        if (failInsert) return { error: { code: 'offline' } };
        rows.push(row); return { error: null };
      },
    }; return query;
  });
});
it('only enrolls explicitly new accounts, never existing users or anonymous visitors', () => {
  expect(needsOnboarding({ user_metadata: { [ONBOARDING_KEY]: 0 } })).toBe(true);
  for (const user of [null, undefined, {}, { user_metadata: {} }, { user_metadata: { [ONBOARDING_KEY]: 1 } }]) expect(needsOnboarding(user)).toBe(false);
});
it('keeps drafts account scoped and handles corrupt local storage', () => {
  writeOnboardingDraft('one', { step: 3, titles: ONBOARDING_PICKS.slice(0, 2), plan: 'monthly' });
  expect(readOnboardingDraft('one')).toMatchObject({ step: 3, plan: 'monthly', titles: ONBOARDING_PICKS.slice(0, 2) });
  expect(readOnboardingDraft('two').titles).toEqual([]);
  localStorage.setItem('cinegeek.onboarding.v1.one', 'broken');
  expect(readOnboardingDraft('one').step).toBe(0);
});
it('preserves valid films without posters and distinct film/show IDs; rejects malformed results', () => {
  expect(onboardingSearchResults([
    { id: 12, title: 'Film', type: 'movie', year: null, posterPath: 'https://via.placeholder.com/no-poster' },
    { id: 12, title: 'Series', type: 'tv', posterPath: null },
    { id: 12, title: 'Film', type: 'movie', posterPath: '' },
    { id: -1, type: 'movie', title: 'Invalid' },
  ])).toHaveLength(2);
  expect(onboardingSearchResults([{ id: 12, type: 'movie', title: 'Film', posterPath: 'https://unknown.test/x.png' }])[0].posterPath).toBe('');
});
it('uses the exact annual price and honest savings without enabling purchases', () => {
  expect(pounds(PRO_PREVIEW.annualPence)).toBe('£79.99');
  expect(pounds(PRO_PREVIEW.annualPence / 12)).toBe('£6.67');
  expect(pounds(annualSavingPence)).toBe('£27.89');
  expect(PRO_PREVIEW.purchasesEnabled).toBe(false);
});
it('adds Watching picks without changing progress or removing other lists; retry creates no duplicates', async () => {
  rows.push({ user_id: 'owner', title_id: 98, type: 'movie', list_type: 'favourites', current_timestamp: 600 });
  await completeOnboarding('owner', [ONBOARDING_PICKS[2]]);
  await completeOnboarding('owner', [ONBOARDING_PICKS[2]]);
  expect(inserts).toHaveLength(1);
  expect(inserts[0]).toMatchObject({ list_type: 'watching', title_id: 98, user_id: 'owner' });
  expect(inserts[0]).not.toHaveProperty('current_timestamp');
  expect(rows[0].current_timestamp).toBe(600);
  expect(api.updateUser).toHaveBeenLastCalledWith({ data: { [ONBOARDING_KEY]: 1 } });
});
it('does not mark onboarding complete when a pick fails to save', async () => {
  failInsert = true;
  await expect(completeOnboarding('owner', [ONBOARDING_PICKS[0]])).rejects.toEqual({ code: 'offline' });
  expect(api.updateUser).not.toHaveBeenCalled();
});
it('rejects a changed account before writes or completion', async () => {
  api.getUser.mockResolvedValueOnce({ data: { user: { id: 'another' } } });
  await expect(completeOnboarding('owner', [ONBOARDING_PICKS[0]])).rejects.toThrow(/session changed/);
  expect(inserts).toHaveLength(0);
  api.getUser.mockResolvedValueOnce({ data: { user: { id: 'owner' } } }).mockResolvedValueOnce({ data: { user: { id: 'another' } } });
  await expect(completeOnboarding('owner', [])).rejects.toThrow(/session changed/);
  expect(api.updateUser).not.toHaveBeenCalled();
});
