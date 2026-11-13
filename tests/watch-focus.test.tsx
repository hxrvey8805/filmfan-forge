// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FocusRoom } from "../src/components/FocusRoom";
import { GeekViewer } from "../src/hooks/use-geek-outfit";
import type { FocusStatus } from "../src/lib/watch-focus";

const native = vi.hoisted(() => ({
  getStatus: vi.fn(), startWithApps: vi.fn(), finish: vi.fn(), addListener: vi.fn(),
}));
vi.mock("../src/lib/watch-focus", () => ({ iosWatchFocus: native, watchFocusReady: Promise.resolve() }));
const unlocked: FocusStatus = { locked: false, selectiveAvailable: true, paused: 0, session: "", saved: -1 };
let notify: (status: FocusStatus) => void;
const room = (active = false, episode = "1") => <GeekViewer.Provider value="viewer">
  <FocusRoom key={episode} title="A Series" episodeLabel={"Episode " + episode} active={active} validPosition />
</GeekViewer.Provider>;
const action = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const timerOnly = "Timer only · apps stay available";
beforeEach(() => {
  vi.resetAllMocks();
  native.getStatus.mockResolvedValue(unlocked);
  native.finish.mockResolvedValue(undefined);
  native.addListener.mockImplementation(async (_, cb) => { notify = cb; return { remove: vi.fn() }; });
});
afterEach(() => { cleanup(); localStorage.clear(); });

it("shows timer-only setup on an ordinary device and reports Guided Access separately", async () => {
  native.getStatus.mockResolvedValue({ ...unlocked, selectiveAvailable: false });
  const view = render(room());
  await act(async () => {});
  expect(screen.getByText(timerOnly)).toBeTruthy();
  expect(screen.queryByRole("button", {name:"Choose apps"})).toBeNull();
  view.rerender(room(true)); fireEvent.click(action("Start focus"));
  expect(action("End focus")).toBeTruthy();
  view.rerender(room());
  act(() => notify({ ...unlocked, selectiveAvailable: false, locked: true }));
  expect(screen.getByText("Locked to CineGeek")).toBeTruthy();
  expect(native.startWithApps).not.toHaveBeenCalled();
});

it("prepares the app selection before entry without starting the timer or shielding apps", async () => {
  native.startWithApps.mockRejectedValueOnce(new Error("Screen Time access was not granted."))
    .mockResolvedValueOnce({started:false}).mockResolvedValueOnce({started:false,saved:2})
    .mockResolvedValueOnce({started:true,saved:2,paused:2});
  const view = render(room());
  fireEvent.click(await screen.findByRole("button", {name:"Choose apps"}));
  expect((await screen.findByRole("alert")).textContent).toContain("not granted");
  fireEvent.click(action("Choose apps"));
  await waitFor(() => expect(action("Choose apps").disabled).toBe(false));
  expect(action("Timer only").getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(action("Choose apps")); await screen.findByText("2 apps ready to pause");
  expect(native.startWithApps.mock.calls.every(([arg]) => arg.editOnly)).toBe(true);
  view.rerender(room(true));
  expect(screen.queryByRole("button", {name:"Edit apps"})).toBeNull();
  expect(native.startWithApps).toHaveBeenCalledTimes(3);
  fireEvent.click(action("Start focus")); await screen.findByRole("button", {name:"End focus"});
  expect(native.startWithApps.mock.lastCall?.[0]).toMatchObject({ viewer:"viewer", editOnly:false });
});

it("remembers Timer only across visits even when apps are saved", async () => {
  native.getStatus.mockResolvedValue({ ...unlocked, saved: 3 });
  const view = render(room());
  await screen.findByText("3 apps ready to pause");
  fireEvent.click(action("Timer only")); view.unmount();
  const next = render(room());
  await screen.findByRole("button", {name:"Choose apps"});
  expect(action("Timer only").getAttribute("aria-pressed")).toBe("true");
  next.rerender(room(true)); fireEvent.click(action("Start focus"));
  expect(action("End focus")).toBeTruthy();
  expect(native.startWithApps).not.toHaveBeenCalled();
});

it("clears the selection in setup without starting a session; Start in the room only times", async () => {
  native.getStatus.mockResolvedValue({ ...unlocked, saved: 1 });
  native.startWithApps.mockResolvedValue({ started:false, saved:0 });
  const view = render(room());
  fireEvent.click(await screen.findByRole("button", {name:"Edit apps"}));
  await screen.findByText(timerOnly); view.rerender(room(true)); fireEvent.click(action("Start focus"));
  expect(action("End focus")).toBeTruthy();
  expect(native.startWithApps).toHaveBeenCalledTimes(1);
});

it("keeps protection in the same episode, retries a failed release, and isolates the next episode", async () => {
  native.getStatus.mockResolvedValue({ ...unlocked, saved: 2 });
  native.startWithApps.mockResolvedValue({ started:true, paused:2, saved:2 });
  const view = render(room());
  await screen.findByText("2 apps ready to pause");
  view.rerender(room(true)); fireEvent.click(action("Start focus"));
  await screen.findByRole("button", {name:"End focus"});
  const scope = { session:native.startWithApps.mock.calls[0][0].session };
  view.rerender(room()); expect(screen.getByText("2 apps paused")).toBeTruthy();
  view.rerender(room(true)); expect(native.finish).not.toHaveBeenCalled();
  native.finish.mockRejectedValueOnce(new Error("bridge busy"));
  fireEvent.click(action("End focus")); await screen.findByRole("alert");
  fireEvent.click(action("End focus")); await screen.findByRole("button", {name:"Start again"});
  expect(native.finish).toHaveBeenLastCalledWith(scope);
  fireEvent.click(action("Start again")); await screen.findByRole("button", {name:"End focus"});
  native.finish.mockClear(); view.rerender(room(false,"2"));
  await screen.findByText("2 apps ready to pause"); expect(native.finish).toHaveBeenCalledWith(scope);
  act(() => notify({ ...unlocked,...scope,paused:2 }));
  expect(screen.queryByText("2 apps paused")).toBeNull();
  view.rerender(room(true,"2")); expect(action("Start focus")).toBeTruthy();
});
