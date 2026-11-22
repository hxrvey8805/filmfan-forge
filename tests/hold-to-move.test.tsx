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
function options() {
  fireEvent.click(screen.getByRole("button", {name:"Options for Move me"}));
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

it("opens destinations directly from three dots and moves only the chosen record, preserving progress", async () => {
  await preview.from("user_titles").insert([{ ...movie, type:"tv", user_id:account, title:"Series with same ID" },
    { ...movie, user_id:account, list_type:"favourite" }]);
  await home(); const menu = options();
  const button = within(menu).getByRole("button", {name:"Watching"});
  expect((within(menu).getByRole("button", {name:"Favourites"}) as HTMLButtonElement).disabled).toBe(true);
  expect(within(menu).queryByText("Already here")).toBeNull();
  const rowsInMenu = within(menu).getAllByRole("button");
  expect(rowsInMenu.indexOf(within(menu).getByRole("button",{name:"Remove from list"})))
    .toBe(rowsInMenu.indexOf(within(menu).getByRole("button",{name:"Watched"})) + 1);
  await act(async () => fireEvent.click(button));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("button", {name:"Open Move me"})).toBeNull();
  expect((await rows()).map(r => [r.type,r.list_type,r.progress])).toEqual([
    ["movie","watching",37],["tv","watchlist",37],["movie","favourite",37],
  ]);
});

it("can move to a personal list without changing folder order or offering a smart destination", async () => {
  const smart = {id:"horror",name:"Horror",mode:"smart",rule:{kind:"genre",scope:"all",value:"Horror"}};
  localStorage.setItem(homeListKey(account), JSON.stringify([folder, smart]));
  await home(); const menu = options();
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
  await home(); const menu = options();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("full"); });
  const fail = vi.spyOn(toast,"error");
  await act(async () => fireEvent.click(within(menu).getByRole("button",{name:"Friday options"})));
  expect(fail).toHaveBeenCalled();
  expect((await rows())[0]?.list_type).toBe("watchlist");
});

// These tests exercise library interactions; explicit AI consent is covered in ai-privacy-ui.
vi.mock("@/components/AIPrivacy",()=>({useAIPrivacy:()=>({ensure:async()=>true,reload:()=>{}})}));

it("removes only the selected shelf copy after confirmation", async () => {
  await preview.from("user_titles").insert({...movie,user_id:account,list_type:"favourite"});
  await home(); const menu = options();
  fireEvent.click(within(menu).getByRole("button",{name:"Remove from list"}));
  expect((await rows())).toHaveLength(2);
  await act(async()=>fireEvent.click(within(menu).getByRole("button",{name:"Remove title"})));
  expect((await rows()).map(row=>row.list_type)).toEqual(["favourite"]);
});

it("reorders a custom list, saves it across reopening and keeps folder order", async () => {
  const first={id:10,type:"movie",title:"First pick",posterPath:""}, second={...first,id:11,title:"Second pick"};
  localStorage.setItem(homeListKey(account),JSON.stringify([{...folder,titles:[first,second]},{...folder,id:"later",name:"Later"}]));
  await home(); fireEvent.click(screen.getByRole("button",{name:"Friday options"}));
  const button=screen.getByRole("button",{name:"Open First pick"});
  fireEvent.keyDown(button,{key:" "});fireEvent.keyDown(button,{key:"ArrowRight"});fireEvent.keyDown(button,{key:"Enter"});
  const saved=JSON.parse(localStorage.getItem(homeListKey(account))!);
  expect(saved.map((list:{id:string})=>list.id)).toEqual(["friday","later"]);
  expect(saved[0].titles.map((title:{id:number})=>title.id)).toEqual([11,10]);
  fireEvent.click(screen.getByRole("button",{name:"Friday options"}));
  fireEvent.click(screen.getByRole("button",{name:"Friday options"}));
  const posters=within(document.getElementById("my-lists")!).getAllByRole("button",{name:/^Open /});
  expect(posters.map(button=>button.getAttribute("aria-label"))).toEqual(["Open Second pick","Open First pick"]);
});

it("moves out of a custom list without deleting the title from other lists", async () => {
  const custom={id:9123,type:"movie",title:"Custom title",posterPath:""};
  localStorage.setItem(homeListKey(account),JSON.stringify([{...folder,titles:[custom]},{...folder,id:"later",name:"Later",titles:[custom]}]));
  await home();fireEvent.click(screen.getByRole("button",{name:"Friday options"}));
  fireEvent.click(screen.getByRole("button",{name:"Options for Custom title"}));
  await act(async()=>fireEvent.click(within(screen.getByRole("dialog",{name:"Custom title"})).getByRole("button",{name:"Watched"})));
  const saved=JSON.parse(localStorage.getItem(homeListKey(account))!);
  expect(saved[0].titles).toEqual([]);expect(saved[1].titles).toEqual([custom]);
  const records=(await preview.from("user_titles").select().eq("title_id",9123)).data;
  expect(records.map(row=>row.list_type)).toEqual(["watched"]);
  await preview.from("user_titles").delete().eq("title_id",9123);
});
