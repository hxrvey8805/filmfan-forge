// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LampPullCord } from '../src/components/LampPullCord';
import { GeekViewer } from '../src/hooks/use-viewer-preference';

beforeEach(() => {
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    pointerId: number;
    isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.isPrimary = init.isPrimary ?? true;
    }
  });
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });
function setup(enabled = true) {
  const start = vi.fn();
  const view = render(<svg><LampPullCord enabled={enabled} onStart={start} /></svg>);
  const cord = screen.getByRole('button', { name: 'Start focus with lamp cord' });
  return { start, cord, view };
}
const down = (cord: HTMLElement) => fireEvent.pointerDown(cord, { clientX: 50, clientY: 50, pointerId: 1, button: 0 });
it('starts once on releasing a deliberate pull, including the subsequent browser click', () => {
  const { start, cord } = setup(); down(cord);
  fireEvent.pointerMove(cord, { clientX: 52, clientY: 82, pointerId: 1 });
  expect(start).not.toHaveBeenCalled();
  fireEvent.pointerUp(cord, { clientX: 52, clientY: 82, pointerId: 1 });
  fireEvent.click(cord, { detail: 1 }); fireEvent.click(cord, { detail: 1 });
  expect(start).toHaveBeenCalledTimes(1);
});
it.each([[50,64], [50,15], [90,90]])('does not start from an incomplete or sideways drag to %s,%s', (clientX, clientY) => {
  const { start, cord } = setup(); down(cord);
  fireEvent.pointerMove(cord, { clientX, clientY, pointerId: 1 });
  fireEvent.pointerUp(cord, { clientX, clientY, pointerId: 1 });
  fireEvent.click(cord, { detail: 1 });
  expect(start).not.toHaveBeenCalled();
});
it.each(['pointerCancel', 'lostPointerCapture'] as const)('does not start after %s interrupts a pull', event => {
  const { start, cord } = setup(); down(cord);
  fireEvent.pointerMove(cord, { clientX: 50, clientY: 90, pointerId: 1 });
  fireEvent[event](cord, { pointerId: 1 });
  fireEvent.pointerUp(cord, { clientX: 50, clientY: 90, pointerId: 1 });
  fireEvent.click(cord, { detail: 1 });
  expect(start).not.toHaveBeenCalled();
});
it('supports a normal button activation and can start a later session after being re-enabled', () => {
  const { start, cord, view } = setup(); fireEvent.click(cord, { detail: 1 });
  expect(start).toHaveBeenCalledTimes(1);
  view.rerender(<svg><LampPullCord enabled={false} onStart={start} /></svg>);
  fireEvent.click(cord, { detail: 1 }); expect(start).toHaveBeenCalledTimes(1);
  view.rerender(<svg><LampPullCord enabled onStart={start} /></svg>);
  fireEvent.click(cord, { detail: 1 }); expect(start).toHaveBeenCalledTimes(2);
});
it('keeps disabled cords inert for both gestures and button activation', () => {
  const { start, cord } = setup(false); down(cord);
  fireEvent.pointerUp(cord, { clientX: 50, clientY: 90, pointerId: 1 }); fireEvent.click(cord, { detail: 1 });
  expect(start).not.toHaveBeenCalled();
  expect((cord as HTMLButtonElement).disabled).toBe(true);
});

it('keeps keyboard and assistive activation available after a cancelled pointer gesture', () => {
  const { start, cord } = setup(); down(cord);
  fireEvent.pointerCancel(cord, { pointerId: 1 });
  fireEvent.click(cord, { detail: 0 });
  expect(start).toHaveBeenCalledTimes(1);
});

it('remembers the hint after a successful cord start, across rooms and account switches', () => {
  const start = vi.fn();
  const scene = (viewer: string, running = false) => <GeekViewer.Provider value={viewer}><svg><LampPullCord enabled={!running} running={running} onStart={start} /></svg></GeekViewer.Provider>;
  const view = render(scene('lamp-viewer-a'));
  expect(screen.getByText('Pull to start')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Start focus with lamp cord' }));
  view.rerender(scene('lamp-viewer-a', true));
  view.rerender(scene('lamp-viewer-a'));
  expect(screen.queryByText('Pull to start')).toBeNull();
  view.unmount();
  const nextRoom = render(scene('lamp-viewer-a'));
  expect(screen.queryByText('Pull to start')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Start focus with lamp cord' }));
  expect(start).toHaveBeenCalledTimes(2);
  nextRoom.rerender(scene('lamp-viewer-b'));
  expect(screen.getByText('Pull to start')).toBeTruthy();
  nextRoom.rerender(scene('lamp-viewer-a'));
  expect(screen.queryByText('Pull to start')).toBeNull();
});
it('keeps the hint when a cord start fails, or Focus starts from the regular button', () => {
  const scene = (enabled: boolean, running = false) => <GeekViewer.Provider value="lamp-viewer-failed"><svg><LampPullCord enabled={enabled} running={running} onStart={vi.fn()} /></svg></GeekViewer.Provider>;
  const view = render(scene(true));
  fireEvent.click(screen.getByRole('button', { name: 'Start focus with lamp cord' }));
  view.rerender(scene(false)); // waiting for app blocking
  view.rerender(scene(true)); // blocking failed, so Focus did not start
  expect(screen.getByText('Pull to start')).toBeTruthy();
  view.rerender(scene(false, true)); // subsequently started using the normal button
  view.rerender(scene(true));
  expect(screen.getByText('Pull to start')).toBeTruthy();
});
