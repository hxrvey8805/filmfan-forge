// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from '../src/pages/Dashboard';
import { supabase as preview } from '../src/preview/client';

vi.mock('@/integrations/supabase/client', async () => import('../src/preview/client'));
vi.mock('@/pages/Index', () => ({ default: () => <div>Watching library</div> }));
vi.mock('@/pages/Packs', () => ({ default: () => <div>Card collection</div> }));
vi.mock('@/pages/Store', () => ({ default: () => <div>Pack store</div> }));
vi.mock('@/pages/DailyPuzzle', () => ({ default: () => <div>Actor Connect game<button onClick={() => window.dispatchEvent(new CustomEvent('gameStateChange', { detail: 'playing' }))}>Begin game</button></div> }));
beforeEach(async () => {
  await preview.auth.signInWithPassword();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function open(path = '/dashboard') {
  await act(async () => { render(<MemoryRouter initialEntries={[path]}><Dashboard /></MemoryRouter>); });
}

describe('mobile destinations', () => {
  it('opens games, collection and store under Play and returns to the library', async () => {
    await open();
    expect(screen.getByText('Watching library')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Companion', exact: true })).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play', exact: true })); });
    fireEvent.click(screen.getByRole('button', { name: /Your collection/ }));
    expect(screen.getByText('Card collection')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Play' }));
    fireEvent.click(screen.getByRole('button', { name: /The store/ }));
    expect(screen.getByText('Pack store')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Home', exact: true })); });
    expect(screen.getByText('Watching library')).toBeTruthy();
  });
  it('shows account and allowance under Profile and supports direct store links', async () => {
    await open('/dashboard?tab=play&view=store');
    expect(screen.getByText('Pack store')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Profile', exact: true })); });
    expect(screen.getByText('filmgeek@example.com')).toBeTruthy();
    expect(screen.getByText('Free questions left today')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Profile', exact: true }).getAttribute('aria-current')).toBe('page');
  });
  it('keeps the game mounted and prevents destination changes until it finishes', async () => {
    await open('/dashboard?tab=play&view=game');
    fireEvent.click(screen.getByRole('button', { name: 'Begin game' }));
    for (const name of ['Home', 'Profile', 'Back to Play', 'CineGeek home', 'Open store']) {
      expect((screen.getByRole('button', { name, exact: true }) as HTMLButtonElement).disabled).toBe(true);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Play', exact: true }));
    expect(screen.getByText('Actor Connect game')).toBeTruthy();
    await act(async () => { window.dispatchEvent(new CustomEvent('gameStateChange', { detail: 'won' })); });
    expect((screen.getByRole('button', { name: 'Home', exact: true }) as HTMLButtonElement).disabled).toBe(false);
  });
});
