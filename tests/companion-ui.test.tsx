// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompanionTimestamp } from '../src/components/CompanionTimestamp';
import TitleDetailModal from '../src/components/TitleDetailModal';

const mock = vi.hoisted(() => ({ invoke: vi.fn(), useCompanion: vi.fn(() => ({ ask: vi.fn(), messages: [], isLoading: false, historyError: null })) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: null } }) },
  functions: { invoke: mock.invoke },
} }));
vi.mock('@/hooks/use-companion', () => ({ useCompanion: mock.useCompanion }));
// Exercise the app's state and input behaviour without Radix portal/pointer internals.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
afterEach(() => { cleanup(); vi.clearAllMocks(); });

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

describe('timestamp-only controls and title changes', () => {
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
    expect((screen.getByText('Ask Question') as HTMLButtonElement).disabled).toBe(false);
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
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '2' } });
    expect((screen.getByLabelText('Your position') as HTMLInputElement).value).toBe('00:00:00');
    expect(mock.useCompanion).toHaveBeenLastCalledWith({ tmdbId: 1, mediaType: 'tv', seasonNumber: 1, episodeNumber: 2, seconds: 0 }, true);
    fireEvent.change(screen.getByLabelText('Your position'), { target: { value: '00:05:00' } });
    await act(async () => { oldRuntime.resolve({ data: { runtime: 1 }, error: null }); });
    expect((screen.getByText('Ask Question') as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '2' } }); });
    expect(mock.useCompanion).toHaveBeenLastCalledWith(null, true);
    expect((screen.getAllByRole('combobox')[1] as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('Your position') as HTMLInputElement).value).toBe('00:00:00');
  });
});
