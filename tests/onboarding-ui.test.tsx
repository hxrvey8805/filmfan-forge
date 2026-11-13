// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Onboarding from '../src/pages/Onboarding';
import { NewAccountGate } from '../src/components/NewAccountGate';
import { GEEK_DEMO, ONBOARDING_KEY, ONBOARDING_PICKS, writeOnboardingDraft } from '../src/lib/onboarding';
const state = vi.hoisted(() => ({ viewer: { id: 'owner', user_metadata: {} as Record<string, unknown> }, invoke: vi.fn(), complete: vi.fn() }));
vi.mock('@/hooks/use-viewer-session', () => ({ useViewerSession: () => state.viewer }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: state.invoke } } }));
vi.mock('@/lib/onboarding-service', () => ({ completeOnboarding: state.complete }));
vi.mock('@/components/GeekAvatar', () => ({ GeekAvatar: () => <span aria-label="Geek mascot" /> }));
function open(path = '/onboarding') {
  return render(<MemoryRouter initialEntries={[path]}><NewAccountGate><Routes>
    <Route path="/onboarding" element={<Onboarding />} />
    <Route path="/dashboard" element={<p>Watching library</p>} />
  </Routes></NewAccountGate></MemoryRouter>);
}
beforeEach(() => {
  localStorage.clear(); vi.resetAllMocks(); window.scrollTo = vi.fn();
  state.viewer = { id: 'owner', user_metadata: { [ONBOARDING_KEY]: 0 } };
  state.complete.mockImplementation(async () => { state.viewer.user_metadata = { [ONBOARDING_KEY]: 1 }; });
});
afterEach(cleanup);
it('routes new sign-ins to onboarding while existing accounts keep their Home', () => {
  open('/dashboard'); expect(screen.getByRole('heading', { name: /Your next watch/ })).toBeTruthy();
  cleanup(); state.viewer.user_metadata = {}; open('/dashboard');
  expect(screen.getByText('Watching library')).toBeTruthy();
});
it('keeps three picks on back navigation and explains the sample without any AI call', () => {
  open(); fireEvent.click(screen.getByRole('button', { name: /Let’s make it yours/ }));
  for (const t of ONBOARDING_PICKS.slice(0, 4)) fireEvent.click(screen.getByRole('button', { name: `Select ${t.title}` }));
  expect(screen.getByRole('status').textContent).toMatch(/Three is a great start/);
  fireEvent.click(screen.getByRole('button', { name: /Continue with 3 picks/ }));
  fireEvent.click(screen.getByRole('button', { name: GEEK_DEMO.question }));
  expect(screen.getByText(GEEK_DEMO.answer)).toBeTruthy();
  expect(state.invoke).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Previous step' }));
  expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(3);
});
it('shows the featured annual price, lets the user compare, and never charges from the preview', () => {
  writeOnboardingDraft('owner', { step: 3, titles: [], plan: 'annual' }); open();
  expect((screen.getByRole('radio', { name: /Annual Pro/ }) as HTMLInputElement).checked).toBe(true);
  expect(screen.getByText('£79.99')).toBeTruthy();
  expect(screen.getByText('£6.67/month')).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: /Monthly Pro/ }));
  fireEvent.click(screen.getByRole('button', { name: /Choose Monthly Pro/ }));
  expect(screen.getByRole('dialog').textContent).toMatch(/No payment will be taken/);
  expect(state.invoke).not.toHaveBeenCalled(); expect(state.complete).not.toHaveBeenCalled();
});
it('preserves selections after a save error and completes through the Free path on retry', async () => {
  writeOnboardingDraft('owner', { step: 3, titles: [ONBOARDING_PICKS[0]], plan: 'annual' });
  state.complete.mockRejectedValueOnce(Error('offline')); open();
  fireEvent.click(screen.getByRole('button', { name: 'Continue with Free' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Continue with Free' }));
  expect(await screen.findByText('Watching library')).toBeTruthy();
  expect(state.complete).toHaveBeenLastCalledWith('owner', [ONBOARDING_PICKS[0]]);
});
it('ignores stale catalogue responses when the search changes', async () => {
  writeOnboardingDraft('owner', { step: 1, titles: [], plan: 'annual' });
  let resolveOld!: (value: unknown) => void;
  state.invoke.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
  state.invoke.mockResolvedValueOnce({ data: { results: [ONBOARDING_PICKS[2]] }, error: null }); open();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Batman' } });
  await waitFor(() => expect(state.invoke).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Gladiator' } });
  expect(await screen.findByRole('button', { name: 'Select Gladiator' })).toBeTruthy();
  resolveOld({ data: { results: [ONBOARDING_PICKS[1]] }, error: null });
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Select The Batman' })).toBeNull());
});
