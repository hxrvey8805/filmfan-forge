// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompanionTimestamp } from '../src/components/CompanionTimestamp';
import { CompanionAnswer } from '../src/components/CompanionAnswer';
import TitleDetailModal from '../src/components/TitleDetailModal';
import { GeekViewer } from '../src/hooks/use-geek-outfit';

const mock = vi.hoisted(() => ({ invoke: vi.fn(), useCompanion: vi.fn(() => ({ ask: vi.fn(), messages: [], isLoading: false, historyError: null })) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: null } }) },
  functions: { invoke: mock.invoke },
} }));
vi.mock('@/hooks/use-companion', () => ({ useCompanion: mock.useCompanion }));
// Exercise the app's state and input behaviour without Radix portal/pointer internals.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/slider', () => ({ Slider: () => <div /> }));
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: { children: React.ReactNode; value: string; onValueChange: (value: string) => void }) =>
    <select value={value} onChange={event => onValueChange(event.target.value)}><option value="" />{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <option value={value}>{children}</option>,
}));
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

function Timer({ maxMinutes = 120 }) {
  const [time, setTime] = useState([0]);
  const [valid, setValid] = useState(true);
  return <>
    <CompanionTimestamp minutes={time[0]} maxMinutes={maxMinutes} onChange={setTime} onValidityChange={setValid} />
    <output>{Math.round(time[0] * 60)}</output><button disabled={!valid}>Ask</button>
  </>;
}
function pendingRuntime() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const movie = { id: 1, type: 'movie' as const, title: 'First Film', posterPath: '' };
const modal = (title = movie) => <MemoryRouter><TitleDetailModal title={title} open onOpenChange={() => {}} /></MemoryRouter>;

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const enterChat = () => { click('Enter room'); click('Open chat history'); };

describe('timestamp-only controls and title changes', () => {
  it('shows limited caption context as literal text with no question or coin charge', () => {
    const answer = 'I couldn’t verify a full explanation.\n[00:04:57] <script>Fictional dialogue</script>';
    const view = render(<CompanionAnswer message={{ id: 'limited', question: 'What is happening?', answer,
      context: '', timestamp: '00:05:00', position_seconds: 300, companion_version: 3, title_id: 1,
      media_type: 'movie', season_number: null, episode_number: null, created_at: '2026-10-16T10:00:00Z',
      answer_status: 'insufficient_evidence', evidence: [{ id: 'recent', label: '00:04:57–00:04:59', start: 297, end: 299 }] }} />);
    expect(view.container.querySelector('script')).toBeNull();
    expect(view.container.textContent).toContain('<script>Fictional dialogue</script>');
    expect(screen.getByText('No question or coins used.')).toBeTruthy();
    expect(screen.getByText('Sources')).toBeTruthy();
  });
  it('retains exact seconds, rewinds to zero, and prevents submitting malformed times', () => {
    render(<Timer />);
    const input = screen.getByLabelText('Your position');
    fireEvent.change(input, { target: { value: '23:17' } });
    expect(screen.getByRole('status').textContent).toBe('1397');
    fireEvent.change(input, { target: { value: '00:00:00' } });
    expect(screen.getByRole('status').textContent).toBe('0');
    fireEvent.change(input, { target: { value: '00:99' } });
    expect((screen.getByText('Ask') as HTMLButtonElement).disabled).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });
  it('clamps ten-second adjustments to the runtime and disables them during invalid edits', () => {
    render(<Timer maxMinutes={1} />);
    const input = screen.getByLabelText('Your position') as HTMLInputElement;
    const rewind = screen.getByRole('button', { name: 'Rewind 10 seconds' }) as HTMLButtonElement;
    const advance = screen.getByRole('button', { name: 'Advance 10 seconds' }) as HTMLButtonElement;
    fireEvent.change(input, { target: { value: '00:05' } });
    fireEvent.click(rewind);
    expect(input.value).toBe('00:00:00');
    expect(rewind.disabled).toBe(true);
    fireEvent.change(input, { target: { value: '00:55' } });
    fireEvent.click(advance);
    expect(input.value).toBe('00:01:00');
    expect(advance.disabled).toBe(true);
    fireEvent.change(input, { target: { value: '00:99' } });
    expect(rewind.disabled && advance.disabled).toBe(true);
  });

  it('fills a question shortcut without sending it or changing the timestamp', async () => {
    const ask = vi.fn();
    await mock.useCompanion.withImplementation(() => ({ ask, messages: [], isLoading: false, historyError: null }), async () => {
      mock.invoke.mockResolvedValue({ data: { runtime: 95 }, error: null });
      await act(async () => { render(modal()); });
      fireEvent.change(screen.getByLabelText('Your position'), { target: { value: '15:07' } });
      enterChat();
      fireEvent.click(screen.getByRole('button', { name: 'Use prompt: What has happened so far?' }));
      expect((screen.getByLabelText('Your question') as HTMLTextAreaElement).value).toBe('What has happened so far?');
      expect(mock.useCompanion).toHaveBeenLastCalledWith({ tmdbId: 1, mediaType: 'movie', seconds: 907 }, true);
      expect(ask).not.toHaveBeenCalled();
    });
  });

  it('times a focus session independently of the story cutoff and preserves drafts and invalid edits', async () => {
    vi.useFakeTimers();
    try {
      mock.invoke.mockResolvedValue({ data: { runtime: 90 }, error: null });
      await act(async () => { render(modal()); });
      fireEvent.change(screen.getByLabelText('Your position'), { target: { value: '12:18' } });
      enterChat();
      fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Why did she say that?' } });
      click('Start focus');
      act(() => { vi.advanceTimersByTime(12000); });
      expect(screen.getByText('00:12')).toBeTruthy();
      click('Collapse chat');
      expect((screen.getByLabelText('Your question') as HTMLTextAreaElement).value).toBe('Why did she say that?');
      click('Open chat history');
      expect((screen.getByLabelText('Your question') as HTMLTextAreaElement).value).toBe('Why did she say that?');
      click('Watching at 12:18');
      fireEvent.change(screen.getByLabelText('Your position'), { target: { value: '00:99' } });
      expect((screen.getByRole('button', {name:'Set time'}) as HTMLButtonElement).disabled).toBe(true);
      click('Cancel');
      act(() => { vi.advanceTimersByTime(3000); });
      click('End focus');
      expect(screen.getByText('00:15')).toBeTruthy();
      expect(mock.useCompanion).toHaveBeenLastCalledWith({ tmdbId: 1, mediaType: 'movie', seconds: 738 }, true);
    } finally { vi.useRealTimers(); }
  });

  it('keeps an invalid edit invalid if runtime metadata arrives later', () => {
    const view = render(<Timer />);
    fireEvent.change(screen.getByLabelText('Your position'), { target: { value: 'not a time' } });
    view.rerender(<Timer maxMinutes={90} />);
    expect((screen.getByText('Ask') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Your position') as HTMLInputElement).value).toBe('not a time');
  });
  it('requires correction if a late runtime is shorter than the entered position', () => {
    const view = render(<Timer />);
    fireEvent.change(screen.getByLabelText('Your position'), { target: { value: '01:00:00' } });
    view.rerender(<Timer maxMinutes={45} />);
    expect((screen.getByText('Ask') as HTMLButtonElement).disabled).toBe(true);
  });
  it('does not reset an entered viewing point when the runtime request completes', async () => {
    const runtime = pendingRuntime();
    mock.invoke.mockReturnValue(runtime.promise);
    render(modal());
    fireEvent.change(screen.getByLabelText('Your position'), { target: { value: '00:23:17' } });
    await act(async () => { runtime.resolve({ data: { runtime: 95 }, error: null }); });
    expect((screen.getByLabelText('Your position') as HTMLInputElement).value).toBe('00:23:17');
    expect(mock.useCompanion).toHaveBeenLastCalledWith({ tmdbId: 1, mediaType: 'movie', seconds: 1397 }, true);
  });
  it('starts a switched title at zero and ignores the previous title’s delayed runtime', async () => {
    const old = pendingRuntime();
    const current = pendingRuntime();
    mock.invoke.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const view = render(modal());
    fireEvent.change(screen.getByLabelText('Your position'), { target: { value: '00:23:17' } });
    view.rerender(modal({ ...movie, id: 2, title: 'Second Film' }));
    expect((screen.getByLabelText('Your position') as HTMLInputElement).value).toBe('00:00:00');
    expect(mock.useCompanion).toHaveBeenLastCalledWith({ tmdbId: 2, mediaType: 'movie', seconds: 0 }, true);
    fireEvent.change(screen.getByLabelText('Your position'), { target: { value: '00:05:00' } });
    await act(async () => { current.resolve({ data: { runtime: 90 }, error: null }); });
    await act(async () => { old.resolve({ data: { runtime: 1 }, error: null }); });
    expect((screen.getByLabelText('Your position') as HTMLInputElement).value).toBe('00:05:00');
    enterChat();
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'What is happening?' } });
    expect((screen.getByRole('button',{name:'Send question'}) as HTMLButtonElement).disabled).toBe(false);
  });
  it('resets the viewing point on episode changes and requires a new episode on season changes', async () => {
    const oldRuntime = pendingRuntime();
    mock.invoke.mockImplementation((_name, { body }) => {
      if (body.episodeNumber === 1) return oldRuntime.promise;
      return Promise.resolve({ data: { runtime: 90,
        seasons: [{ seasonNumber: 1, name: 'Season 1' }, { seasonNumber: 2, name: 'Season 2' }],
        episodes: [{ episodeNumber: 1, name: 'First' }, { episodeNumber: 2, name: 'Second' }],
      }, error: null });
    });
    await act(async () => {
      render(<MemoryRouter><TitleDetailModal title={{ ...movie, type: 'tv' }} open onOpenChange={() => {}} /></MemoryRouter>);
    });
    fireEvent.change(screen.getByLabelText('Your position'), { target: { value: '00:30:00' } });
    enterChat();
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'A draft about episode one' } });
    click('Back to viewing setup');
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '2' } });
    enterChat();
    expect((screen.getByLabelText('Your question') as HTMLTextAreaElement).value).toBe('');
    click('Back to viewing setup');
    expect(screen.queryByText('Second')).toBeNull();
    expect((screen.getByLabelText('Your position') as HTMLInputElement).value).toBe('00:00:00');
    expect(mock.useCompanion).toHaveBeenLastCalledWith({ tmdbId: 1, mediaType: 'tv', seasonNumber: 1, episodeNumber: 2, seconds: 0 }, true);
    fireEvent.change(screen.getByLabelText('Your position'), { target: { value: '00:05:00' } });
    await act(async () => { oldRuntime.resolve({ data: { runtime: 1 }, error: null }); });
    enterChat();
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'What is happening?' } });
    expect((screen.getByRole('button',{name:'Send question'}) as HTMLButtonElement).disabled).toBe(false);
    click('Back to viewing setup');
    await act(async () => { fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '2' } }); });
    expect(mock.useCompanion).toHaveBeenLastCalledWith(null, true);
    expect((screen.getByRole('button',{name:'Enter room'}) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getAllByRole('combobox')[1] as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('Your position') as HTMLInputElement).value).toBe('00:00:00');
  });

  it('restores the last complete episode and exact second only for the same title and viewer', async () => {
    mock.invoke.mockResolvedValue({ data: { runtime: 90,
      seasons: [1, 2].map(seasonNumber => ({ seasonNumber, name: `Season ${seasonNumber}` })),
      episodes: [1, 3].map(episodeNumber => ({ episodeNumber, name: `Episode ${episodeNumber}` })),
    }, error: null });
    const title = { ...movie, type: 'tv' as const };
    const show = (viewer: string, type: 'movie' | 'tv' = 'tv') =>
      <GeekViewer.Provider value={viewer}><MemoryRouter><TitleDetailModal title={{ ...title, type }} open
        onOpenChange={() => {}} /></MemoryRouter></GeekViewer.Provider>;
    const page = render(show('viewer-a'));
    await act(async () => {});
    const pick = (index: number, value: string) => fireEvent.change(screen.getAllByRole('combobox')[index], { target: { value } });
    await act(async () => { pick(0, '2'); });
    pick(1, '3');
    const input = () => screen.getByLabelText('Your position') as HTMLInputElement;
    fireEvent.change(input(), { target: { value: '15:07' } });
    fireEvent.change(input(), { target: { value: '08:99' } });
    await act(async () => { pick(0, '1'); });
    expect(input().disabled).toBe(true);
    await act(async () => { page.rerender(show('viewer-b')); });
    expect(mock.useCompanion).toHaveBeenLastCalledWith({ tmdbId: 1, mediaType: 'tv', seasonNumber: 1, episodeNumber: 1, seconds: 0 }, true);
    await act(async () => { page.rerender(show('viewer-a', 'movie')); });
    expect(input().value).toBe('00:00:00');
    await act(async () => { page.rerender(show('viewer-a')); });
    expect(mock.useCompanion).toHaveBeenLastCalledWith({ tmdbId: 1, mediaType: 'tv', seasonNumber: 2, episodeNumber: 3, seconds: 907 }, true);
    expect(input().value).toBe('00:15:07');
    pick(1, '1');
    expect(input().value).toBe('00:00:00');
    expect(mock.useCompanion).toHaveBeenLastCalledWith({ tmdbId: 1, mediaType: 'tv', seasonNumber: 2, episodeNumber: 1, seconds: 0 }, true);
  });
});
