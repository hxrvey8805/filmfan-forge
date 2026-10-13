// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCompanion, type CompanionMessage } from '../src/hooks/use-companion';
import type { ViewingPosition } from '../supabase/functions/_shared/companion';

const mock = vi.hoisted(() => ({
  invoke: vi.fn(), load: vi.fn(), authChange: null as null | ((event: string, session: unknown) => void),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: {
    getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }),
    onAuthStateChange: (callback: typeof mock.authChange) => {
      mock.authChange = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    },
  },
  from: () => {
    const filters: Record<string, unknown> = {};
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      lte: (key: string, value: unknown) => { filters[`${key}<=`] = value; return query; },
      order: () => query,
      limit: () => mock.load(filters),
    };
    return query;
  },
  functions: { invoke: mock.invoke },
} }));

const position: ViewingPosition = { tmdbId: 1, mediaType: 'tv', seasonNumber: 1, episodeNumber: 2, seconds: 60 };
const row = (overrides = {}): CompanionMessage => ({
  id: 'safe', title_id: 1, media_type: 'tv', season_number: 1, episode_number: 2,
  position_seconds: 20, companion_version: 2, question: 'What is he holding?', answer: 'A letter.',
  context: 'S1E2', timestamp: '00:00:20', created_at: '2026-10-13T12:00:00Z', evidence: [], answer_status: 'answered', ...overrides,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(200); });
const mount = async (initial = position) => {
  const hook = renderHook(({ position, enabled }) => useCompanion(position, enabled), { initialProps: { position: initial, enabled: true } });
  await act(async () => {}); // Resolve initial authentication before starting the history debounce.
  await flush();
  return hook;
};
beforeEach(() => {
  vi.useFakeTimers();
  mock.invoke.mockReset();
  mock.load.mockReset().mockResolvedValue({ data: [], error: null });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('companion history and in-flight responses', () => {
  it('applies title/episode/cutoff in the query and filters later rows again in the browser', async () => {
    mock.load.mockResolvedValue({ data: [row(), row({ id: 'future', position_seconds: 61 })], error: null });
    const hook = await mount();
    expect(mock.load).toHaveBeenCalledWith({ user_id: 'user-1', title_id: 1, media_type: 'tv',
      companion_version: 2, season_number: 1, episode_number: 2, 'position_seconds<=': 60 });
    expect(hook.result.current.messages.map(item => item.id)).toEqual(['safe']);
  });
  it('hides later answers immediately on rewind, before the new history request resolves', async () => {
    mock.load.mockResolvedValue({ data: [row(), row({ id: 'later', position_seconds: 50 })], error: null });
    const hook = await mount();
    expect(hook.result.current.messages).toHaveLength(2);
    mock.load.mockReturnValue(new Promise(() => {}));
    hook.rerender({ position: { ...position, seconds: 30 }, enabled: true });
    expect(hook.result.current.messages.map(item => item.id)).toEqual(['safe']);
    hook.rerender({ position: { ...position, seconds: 0 }, enabled: true });
    expect(hook.result.current.messages).toEqual([]);
  });
  it('does not apply an old episode history response after switching to an earlier episode', async () => {
    const old = deferred<unknown>();
    mock.load.mockReturnValueOnce(old.promise);
    const hook = await mount();
    mock.load.mockResolvedValue({ data: [row({ id: 'episode-one', episode_number: 1 })], error: null });
    hook.rerender({ position: { ...position, episodeNumber: 1 }, enabled: true });
    expect(hook.result.current.messages).toEqual([]);
    await flush();
    expect(hook.result.current.messages.map(item => item.id)).toEqual(['episode-one']);
    await act(async () => { old.resolve({ data: [row({ answer: 'LATER_EPISODE_REVEAL' })], error: null }); });
    expect(hook.result.current.messages.map(item => item.id)).toEqual(['episode-one']);
  });
  it.each(['rewind', 'episode', 'season', 'title', 'close', 'account', 'unmount'])(
    'discards a delayed answer after a %s change', async change => {
      const pending = deferred<unknown>();
      mock.invoke.mockReturnValue(pending.promise);
      const hook = await mount();
      let request!: ReturnType<typeof hook.result.current.ask>;
      act(() => { request = hook.result.current.ask('Why?', '00:01:00'); });
      if (change === 'unmount') {
        hook.unmount();
      } else if (change === 'account') {
        act(() => { mock.authChange?.('SIGNED_IN', { user: { id: 'user-2' } }); });
      } else {
        hook.rerender({ enabled: change !== 'close', position: { ...position,
          ...(change === 'rewind' ? { seconds: 10 } : {}),
          ...(change === 'episode' ? { episodeNumber: 1 } : {}),
          ...(change === 'season' ? { seasonNumber: 0 } : {}),
          ...(change === 'title' ? { tmdbId: 2 } : {}),
        } });
      }
      await act(async () => {
        pending.resolve({ data: { conversation: row({ position_seconds: 60, answer: 'LATE_REVEAL' }) }, error: null });
        expect((await request).stale).toBe(true);
      });
      expect(hook.result.current.messages).toEqual([]);
      await flush();
      expect(hook.result.current.messages).toEqual([]);
    });
  it('uses server history, saves an answer once, and retries a failed request with the same ID', async () => {
    const hook = await mount();
    mock.invoke.mockResolvedValueOnce({ data: null, error: {} });
    await act(async () => { await expect(hook.result.current.ask(' Why? ', '00:01:00')).rejects.toThrow(); });
    mock.invoke.mockResolvedValueOnce({ data: { conversation: row(), usedCoins: 0 }, error: null });
    await act(async () => { expect((await hook.result.current.ask('Why?', '00:01:00')).stale).toBe(false); });
    const firstBody = mock.invoke.mock.calls[0][1].body;
    const retryBody = mock.invoke.mock.calls[1][1].body;
    expect(firstBody.requestId).toBe(retryBody.requestId);
    expect(retryBody).not.toHaveProperty('previousQA');
    expect(retryBody).toMatchObject({ timestamp: '00:01:00', seconds: 60, episodeNumber: 2, question: 'Why?' });
    expect(hook.result.current.messages.map(item => item.id)).toEqual(['safe']);
  });
  it('refreshes a second companion view from the same saved history', async () => {
    const page = await mount();
    const modal = await mount();
    mock.invoke.mockImplementation(async () => {
      mock.load.mockResolvedValue({ data: [row()], error: null });
      return { data: { conversation: row() }, error: null };
    });
    await act(async () => { await page.result.current.ask('Why?', '00:01:00'); });
    await flush();
    expect(modal.result.current.messages).toEqual(page.result.current.messages);
    expect(modal.result.current.messages).toHaveLength(1);
  });
});
