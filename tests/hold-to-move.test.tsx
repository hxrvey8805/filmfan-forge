// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { toast } from "sonner";
import Index from "../src/pages/Index";
import { supabase as preview } from "../src/preview/client";
import { homeListKey } from "../src/lib/home-list-storage";

vi.mock("@/integrations/supabase/client", async () => import("../src/preview/client"));
vi.mock("@/components/ui/carousel", () => {
  const Wrapper = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return { Carousel: Wrapper, CarouselContent: Wrapper, CarouselItem: Wrapper };
});
const movie = { title_id: 87654, title: "Move me", type: "movie", list_type: "watchlist", progress: 37 };
let account: string;
beforeEach(async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  account = (await preview.auth.signInWithPassword()).data.user.id;
  await preview.from("user_titles").insert({ ...movie, user_id: account });
});
afterEach(async () => {
  cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "elementFromPoint");
  await preview.from("user_titles").delete().eq("title_id", movie.title_id);
  await preview.auth.signOut(); localStorage.clear();
});
async function home() {
  render(<MemoryRouter><Index/></MemoryRouter>);
  return screen.findByRole("button", { name: "Open Move me" });
}
const finger = (x: number, y: number) => ({ identifier: 8, clientX: x, clientY: y });
function start(poster: HTMLElement) {
  const p = finger(100, 400);
  fireEvent.touchStart(poster, { touches: [p], changedTouches: [p] });
}
function lift(poster: HTMLElement, x = 100, y = 400) {
  fireEvent.touchEnd(poster, { touches: [], changedTouches: [finger(x, y)] });
}
function hold(poster: HTMLElement) {
  vi.useFakeTimers({ toFake: ["setTimeout","clearTimeout"] }); start(poster); act(() => vi.advanceTimersByTime(475)); vi.useRealTimers();
  return screen.getByRole("dialog", { name: "Move me" });
}
const rows = async () => (await preview.from("user_titles").select().eq("title_id", movie.title_id)).data;
const folder = { id:"friday", name:"Friday options", mode:"manual", titles:[] };

it("does not open the menu for a swipe; a quick tap still opens the title", async () => {
  const poster = await home();
  vi.useFakeTimers({ toFake: ["setTimeout","clearTimeout"] }); start(poster);
  fireEvent.touchMove(poster, { touches: [finger(78,400)], changedTouches:[finger(78,400)] });
  act(() => vi.advanceTimersByTime(520)); lift(poster,78);
  expect(screen.queryByRole("dialog")).toBeNull();
  start(poster); lift(poster); vi.useRealTimers(); fireEvent.click(poster);
  expect(await screen.findByRole("button", {name:"Enter room"})).toBeTruthy();
});

it("slides to a highlighted destination and moves only the chosen record, preserving progress", async () => {
  await preview.from("user_titles").insert([{ ...movie, type:"tv", user_id:account, title:"Series with same ID" },
    { ...movie, user_id:account, list_type:"favourite" }]);
  const poster = await home(), menu = hold(poster);
  const button = within(menu).getByRole("button", {name:"Watching"});
  expect((within(menu).getByRole("button", {name:/Favourites.*Already here/}) as HTMLButtonElement).disabled).toBe(true);
  Object.defineProperty(document, "elementFromPoint", {configurable:true, value:() => button.firstElementChild});
  fireEvent.touchMove(poster, {touches:[finger(105,330)],changedTouches:[finger(105,330)]});
  expect(button.hasAttribute("data-sliding")).toBe(true);
  await act(async () => lift(poster,105,330));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("button", {name:"Open Move me"})).toBeNull();
  expect((await rows()).map(r => [r.type,r.list_type,r.progress])).toEqual([
    ["movie","watching",37],["tv","watchlist",37],["movie","favourite",37],
  ]);
});

it("can lift then tap a personal list without changing its order or offering a smart list", async () => {
  const smart = {id:"horror",name:"Horror",mode:"smart",rule:{kind:"genre",scope:"all",value:"Horror"}};
  localStorage.setItem(homeListKey(account), JSON.stringify([folder, smart]));
  const poster = await home(), menu = hold(poster);
  lift(poster); fireEvent.click(poster); // Some browsers also synthesize a click.
  expect(within(menu).queryByRole("button", {name:"Horror"})).toBeNull();
  await act(async () => fireEvent.click(within(menu).getByRole("button", {name:"Friday options"})));
  expect(await rows()).toHaveLength(0);
  const saved = JSON.parse(localStorage.getItem(homeListKey(account))!);
  expect(saved.map((l:{id:string}) => l.id)).toEqual(["friday","horror"]);
  expect(saved[0].titles.map((t:{title:string}) => t.title)).toEqual(["Move me"]);
  fireEvent.click(screen.getByRole("button", {name:"Friday options"}));
  expect(within(document.getElementById("my-lists")!).getByRole("button",{name:"Open Move me"})).toBeTruthy();
});

it("keeps the source title if the personal list cannot be saved", async () => {
  localStorage.setItem(homeListKey(account), JSON.stringify([folder]));
  const poster = await home(), menu = hold(poster); lift(poster);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("full"); });
  const fail = vi.spyOn(toast,"error");
  await act(async () => fireEvent.click(within(menu).getByRole("button",{name:"Friday options"})));
  expect(fail).toHaveBeenCalled();
  expect((await rows())[0]?.list_type).toBe("watchlist");
});
