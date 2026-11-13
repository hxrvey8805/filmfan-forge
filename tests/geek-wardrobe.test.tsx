// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WatchingSpotlight } from '../src/components/WatchingSpotlight';
import { FocusRoom } from '../src/components/FocusRoom';
import { GeekWardrobe } from '../src/components/GeekWardrobe';
import { GeekViewer } from '../src/hooks/use-geek-outfit';

const movie = { id: 17, type: 'movie' as const, title: 'Movie', posterPath: '' };
const series = { ...movie, type: 'tv' as const, title: 'Series' };
function wardrobe(viewer: string) {
  return <GeekViewer.Provider value={viewer}><GeekWardrobe /></GeekViewer.Provider>;
}
function choice(name: string) {
  return screen.getByRole('radio', { name, exact: true }) as HTMLInputElement;
}
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

it('keeps the same personal geek on Home, in a title and in Focus despite old title-specific choices', () => {
  localStorage.setItem('cinegeek.geek.v1.viewer-a', 'jedi');
  localStorage.setItem('cinegeek.geek.v1.viewer-a.movie.17', 'orbit');
  localStorage.setItem('cinegeek.geek.v1.viewer-a.tv.17', 'karate');
  const scenes = (title: string) => <GeekViewer.Provider value="viewer-a">
    <WatchingSpotlight titles={[movie, series]} onOpen={() => {}} onFindTitle={() => {}} />
    <GeekWardrobe compact />
    <FocusRoom title={title} episodeLabel="S1 · E1" active validPosition />
  </GeekViewer.Provider>;
  const view = render(scenes(movie.title));
  function expectAllGeeks(outfit: string) {
    const avatars = view.container.querySelectorAll('.geek-avatar:not([data-still])');
    expect([...avatars].map(el => el.getAttribute('data-outfit'))).toEqual([outfit, outfit, outfit]);
  }
  expectAllGeeks('jedi');
  fireEvent.click(screen.getByRole('button', { name: 'Next currently watching title' }));
  expect(screen.getByRole('button', { name: 'Ask your geek about Series' })).toBeTruthy();
  view.rerender(scenes(series.title));
  expectAllGeeks('jedi');
  fireEvent.click(screen.getByRole('button', { name: 'Outfit' }));
  fireEvent.click(choice('Chucky Geek'));
  expectAllGeeks('chucky');
  view.unmount();
  const profile = render(wardrobe('viewer-a'));
  expect(choice('Chucky Geek').checked).toBe(true);
  profile.rerender(wardrobe('viewer-b'));
  expect(choice('Arcade').checked).toBe(true);
});

it('uses a valid default for old storage and keeps choices usable when device storage is blocked', () => {
  localStorage.setItem('cinegeek.geek.v1.private-viewer', 'unknown');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage disabled'); });
  const view = render(wardrobe('private-viewer'));
  expect(screen.getAllByRole('radio')[0]).toBe(choice('Arcade'));
  expect(choice('Arcade').checked).toBe(true);
  expect(screen.getByText('Default')).toBeTruthy();
  fireEvent.click(choice('Matrix Geek'));
  view.unmount();
  render(wardrobe('private-viewer'));
  expect(choice('Matrix Geek').checked).toBe(true);
});

it('uses the saved profile look, or Arcade if only a retired title override exists', () => {
  localStorage.setItem('cinegeek.geek.v1.returning', 'noir');
  localStorage.setItem('cinegeek.geek.v1.returning.movie.17', 'orbit');
  localStorage.setItem('cinegeek.geek.v1.without-profile.movie.17', 'chucky');
  const view = render(wardrobe('returning'));
  expect(choice('Matrix Geek').checked).toBe(true);
  view.rerender(wardrobe('without-profile'));
  expect(choice('Arcade').checked).toBe(true);
});

it('keeps the room style with the viewer across titles and leaves the watching Geek and running timer intact', () => {
  const room = (viewer: string, title: string, active = false) => <GeekViewer.Provider value={viewer}>
    <FocusRoom key={title} title={title} episodeLabel="Movie" active={active} validPosition />
  </GeekViewer.Provider>;
  localStorage.setItem('cinegeek.geek.v1.viewer-a', 'jedi');
  const view = render(room('viewer-a', 'First movie'));
  view.rerender(room('viewer-a', 'First movie', true));
  fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
  const geek = view.container.querySelector('.room-force-lift');
  expect(geek).toBeTruthy();
  expect(screen.queryByRole('button', {name: /Room style:/})).toBeNull();
  view.rerender(room('viewer-a', 'First movie'));
  fireEvent.click(screen.getByRole('button', { name: 'Room style: Original' }));
  fireEvent.click(screen.getByRole('button', { name: 'Deep Navy' }));
  view.rerender(room('viewer-a', 'First movie', true));
  expect(screen.getByRole('button', { name: 'End focus' })).toBeTruthy();
  expect(view.container.querySelector('.room-force-lift')).toBeTruthy();
  expect(screen.getByRole('img', { name: /watches the glowing TV.*Deep Navy/ })).toBeTruthy();
  view.rerender(room('viewer-a', 'Next movie'));
  expect(screen.getByRole('button', { name: 'Room style: Deep Navy' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Room style: Deep Navy' }));
  fireEvent.click(screen.getByRole('button', { name: 'Original Default' }));
  view.rerender(room('viewer-a', 'Another movie'));
  expect(screen.getByRole('button', { name: 'Room style: Original' })).toBeTruthy();
  localStorage.setItem('cinegeek.room.v1.viewer-b', 'amber');
  view.rerender(room('viewer-b', 'Next movie'));
  expect(screen.getByRole('button', { name: 'Room style: Warm Amber' })).toBeTruthy();
  localStorage.setItem('cinegeek.room.v1.viewer-c', 'twilight');
  view.rerender(room('viewer-c', 'Next movie'));
  expect(screen.getByRole('button', { name: 'Room style: Original' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Room style: Original' }));
  expect(screen.queryByRole('button', { name: 'Twilight Purple' })).toBeNull();
});
