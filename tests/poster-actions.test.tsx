// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import PosterRow from '../src/components/PosterRow';

vi.mock('@/components/ui/carousel', () => ({
  Carousel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CarouselContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CarouselItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
afterEach(cleanup);
const item = { id: 1, title: 'A film', type: 'movie' as const, posterPath: '' };
it('opens a title directly, without an invisible remove action over its poster', () => {
  const open = vi.fn(); const remove = vi.fn();
  render(<PosterRow title="Watch List" items={[item]} onPosterClick={open} onDeleteClick={remove} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open A film' }));
  expect(open).toHaveBeenCalledWith(item);
  expect(remove).not.toHaveBeenCalled();
  expect(screen.queryByText('Remove from Watch List')).toBeNull();
  expect(screen.getByRole('button', { name: 'Options for A film' })).toBeTruthy();
});
it('does not display a percentage for unknown or malformed progress', () => {
  const { container, rerender } = render(<PosterRow title="Watching" items={[{ ...item, progress: null as unknown as number }]} onPosterClick={() => {}} />);
  expect(container.textContent).not.toContain('%');
  rerender(<PosterRow title="Watching" items={[{ ...item, progress: Number.NaN }]} onPosterClick={() => {}} />);
  expect(container.textContent).not.toContain('%');
  rerender(<PosterRow title="Watching" items={[{ ...item, progress: 0 }]} onPosterClick={() => {}} />);
  expect(container.textContent).toContain('0%');
});
