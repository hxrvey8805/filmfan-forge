// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Index from '../src/pages/Index';
import { WatchingSpotlight } from '../src/components/WatchingSpotlight';
import { GeekViewer } from '../src/hooks/use-geek-outfit';
import { supabase as preview } from '../src/preview/client';
import { supabase } from '@/integrations/supabase/client';
import { COMPANION_VERSION } from '../supabase/functions/_shared/companion';

vi.mock('@/integrations/supabase/client', async () => import('../src/preview/client'));
// The carousel's geometry comes from a browser. Exercise the real shelf and poster controls here.
vi.mock('@/components/ui/carousel', () => {
  const Wrapper = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return { Carousel: Wrapper, CarouselContent: Wrapper, CarouselItem: Wrapper };
});
beforeEach(async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  await preview.auth.signInWithPassword();
});
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await preview.auth.signOut();
  localStorage.clear();
  vi.unstubAllGlobals();
});

it('switches shelves without losing the title’s library action', async () => {
  render(<MemoryRouter><Index /></MemoryRouter>);
  const shelves = await screen.findByRole('tablist', { name: 'Library shelves' });
  expect(within(screen.getByRole('tabpanel')).getByRole('button', { name: 'Open Blade Runner 2049' })).toBeTruthy();
  fireEvent.mouseDown(within(shelves).getByRole('tab', { name: 'Watching' }), { button: 0 });
  const panel = screen.getByRole('tabpanel', { name: 'Watching' });
  expect(within(panel).queryByRole('button', { name: 'Open Blade Runner 2049' })).toBeNull();
  fireEvent.click(within(panel).getByRole('button', { name: 'Open Gladiator' }));
  const companion = await screen.findByRole('dialog', { name: 'Gladiator' });
  const options = within(companion).getByRole('button', { name: 'Title options' });
  fireEvent.keyDown(options, { key: 'Enter' });
  expect(await screen.findByRole('menuitem', { name: 'Mark as watched' })).toBeTruthy();
});

const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', {name}));
const chat = () => tap('Open chat history');
const enterChat = () => { tap('Enter room'); chat(); };
it('keeps Focus watching and sends the chosen cutoff after ten minutes and a question in Ask', async () => {
  const { data: { user } } = await preview.auth.getUser();
  const title = 60574;
  const saved = { id: 'focus-replay', user_id: user!.id, title_id: title, media_type: 'tv', season_number: 1,
    episode_number: 1, position_seconds: 907, timestamp: '00:15:07', context: 'S1E1',
    companion_version: COMPANION_VERSION, question: 'What did we just hear?', answer: 'A meeting was proposed.',
    answer_status: 'answered', evidence: [], created_at: '2026-11-03T12:00:00Z' };
  try {
    render(<MemoryRouter><GeekViewer.Provider value={user!.id}><Index /></GeekViewer.Provider></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask your geek about Peaky Blinders' }));
    await act(async () => {}); // Let the title's companion restore its signed-in session.
    const position = screen.getByLabelText('Your position') as HTMLInputElement;
    fireEvent.change(position, { target: { value: '15:07' } });
    tap('Enter room');
    const start = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
    clock.mockReturnValue(start + 600_000);
    // Replay just the answer service. The question button, history query and Focus timer are real.
    const endpoint = vi.spyOn(supabase.functions, 'invoke').mockImplementationOnce(async () => {
      await preview.from('ai_conversations').insert(saved);
      return { data: { conversation: saved }, error: null };
    });
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: saved.question } });
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
    expect(endpoint).toHaveBeenCalledWith('spoiler-free-companion', { body: expect.objectContaining({
      tmdbId: title, mediaType: 'tv', seasonNumber: 1, episodeNumber: 1, seconds: 907,
      timestamp: '00:15:07', question: saved.question,
    }) });
    const reply = await screen.findByRole('article', {name:'Geek’s reply'});
    expect(within(reply).getByText(saved.answer)).toBeTruthy();
    expect(screen.queryByRole('button', {name:'Collapse chat'})).toBeNull();
    tap('Dismiss reply');
    expect(screen.queryByText(saved.answer)).toBeNull();
    expect(await screen.findByText('10:00', {}, {timeout: 2500})).toBeTruthy();
    expect(screen.getByRole('button', { name: 'End focus' })).toBeTruthy();
    expect(screen.getByRole('img', { name: /Your geek watches the glowing TV/ })).toBeTruthy();
    chat();
    expect(screen.getByText(saved.answer)).toBeTruthy();
    tap('Watching at 15:07');
    tap('Rewind 10 seconds');
    tap('Set time');
    expect(screen.queryByText(saved.question)).toBeNull();
    expect(screen.queryByText(saved.answer)).toBeNull();
  } finally {
    await preview.from('ai_conversations').delete().eq('id', saved.id);
  }
});

it('restores a rewound bookmark from Home and only shows eligible saved answers', async ({ onTestFinished }) => {
  // jsdom has no scrolling layout. Radix scrolls the selected option into view when opening.
  if (!HTMLElement.prototype.scrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: () => {} });
    onTestFinished(() => Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView'));
  }
  const { data: { user } } = await preview.auth.getUser();
  const viewer = user!.id;
  const title = 1399;
  const rows = [
    { position_seconds: 200, episode_number: 1, answer: 'Already seen in episode one.' },
    { position_seconds: 500, episode_number: 1, answer: 'Later in this episode.' },
    { position_seconds: 1, episode_number: 2, answer: 'Only in episode two.' },
  ].map((row, i) => ({ ...row, user_id: viewer, title_id: title, media_type: 'tv', season_number: 1,
    companion_version: COMPANION_VERSION, question: `Saved question ${i}`, answer_status: 'answered',
    evidence: [], context: '', created_at: '2026-11-03T12:00:00Z' }));
  await preview.from('ai_conversations').insert(rows);
  try {
    const home = () => render(<MemoryRouter><GeekViewer.Provider value={viewer}><Index /></GeekViewer.Provider></MemoryRouter>);
    const page = home();
    fireEvent.click(await screen.findByRole('button', { name: 'Next currently watching title' }));
    const open = () => screen.getByRole('button', { name: 'Ask your geek about Game of Thrones' });
    fireEvent.click(open());
    const edit = (value: string) => fireEvent.change(screen.getByLabelText('Your position'), { target: { value } });
    edit('10:00'); enterChat();
    expect(await screen.findByText('Later in this episode.')).toBeTruthy();
    tap('Watching at 10:00'); edit('04:12'); tap('Set time');
    tap('Watching at 04:12'); edit('10:00'); tap('Cancel');
    expect(screen.queryByText('Later in this episode.')).toBeNull();
    expect(screen.queryByText('Only in episode two.')).toBeNull();
    tap('Back to viewing setup'); tap('Back to your titles');
    expect(await screen.findByText('Resume · S1 E1 · 00:04:12')).toBeTruthy();
    page.unmount();
    home();
    await screen.findByText('Resume · S1 E1 · 00:04:12');
    fireEvent.click(open());
    expect((screen.getByLabelText('Your position') as HTMLInputElement).value).toBe('00:04:12');
    enterChat();
    expect(await screen.findByText('Already seen in episode one.')).toBeTruthy();
    expect(screen.queryByText('Later in this episode.')).toBeNull();
    expect(screen.queryByText('Only in episode two.')).toBeNull();
    const selectEpisode = async (n: number) => {
      tap('Back to viewing setup');
      fireEvent.keyDown(screen.getByRole('combobox', { name: 'Episode' }), { key: 'ArrowDown' });
      fireEvent.keyDown(await screen.findByRole('option', { name: `Episode ${n}` }), { key: 'Enter' });
    };
    await selectEpisode(2);
    expect((screen.getByLabelText('Your position') as HTMLInputElement).value).toBe('00:00:00');
    expect(screen.queryByText('Already seen in episode one.')).toBeNull();
    expect(screen.queryByText('Only in episode two.')).toBeNull();
    edit('00:01'); enterChat();
    expect(await screen.findByText('Only in episode two.')).toBeTruthy();
    expect(screen.queryByText('Already seen in episode one.')).toBeNull();
    await selectEpisode(1);
    expect(screen.queryByText('Only in episode two.')).toBeNull();
    edit('04:12');
    enterChat();
    expect(await screen.findByText('Already seen in episode one.')).toBeTruthy();
    expect(screen.queryByText('Later in this episode.')).toBeNull();
    expect(screen.queryByText('Only in episode two.')).toBeNull();
  } finally {
    await preview.from('ai_conversations').delete().eq('user_id', viewer).eq('title_id', title);
  }
});

it('opens the selected media type even if a show and a movie share an ID', () => {
  const film = { id: 5, type: 'movie' as const, title: 'Film', posterPath: '' };
  const series = { ...film, type: 'tv' as const, title: 'Series' };
  const onOpen = vi.fn();
  const onFindTitle = vi.fn();
  const view = render(<WatchingSpotlight titles={[film, series]} onOpen={onOpen} onFindTitle={onFindTitle} />);
  fireEvent.click(screen.getByRole('button', { name: /Previous currently watching/ }));
  view.rerender(<WatchingSpotlight titles={[series, film]} onOpen={onOpen} onFindTitle={onFindTitle} />);
  fireEvent.click(screen.getByRole('button', { name: 'Ask your geek about Series' }));
  expect(onOpen).toHaveBeenLastCalledWith(series);
  view.rerender(<WatchingSpotlight titles={[film]} onOpen={onOpen} onFindTitle={onFindTitle} />);
  expect(screen.queryByRole('button', { name: /Next currently watching/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Ask your geek about Film' }));
  expect(onOpen).toHaveBeenLastCalledWith(film);
  view.rerender(<WatchingSpotlight titles={[]} onOpen={onOpen} onFindTitle={onFindTitle} />);
  fireEvent.click(screen.getByRole('button', { name: 'Find your first title' }));
  expect(onFindTitle).toHaveBeenCalledOnce();
});
