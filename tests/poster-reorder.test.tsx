// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import PosterRow from "../src/components/PosterRow";
import { usePosterOrder } from "../src/hooks/use-poster-order";
import { orderedTitles, posterOrderKey, readPosterOrder, reorderVisible } from "../src/lib/poster-order";
import { titleKey } from "../src/lib/home-lists";
import { resolveList, type SmartList } from "../src/lib/list-sources";

const titles = ["One", "Two", "Three", "Four", "Five"].map((title,index)=>({id:index+1,type:"movie" as const,title,posterPath:""}));
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();localStorage.clear();});
function Example({save=vi.fn()}: {save?: ReturnType<typeof vi.fn>}) {
  const [items,setItems] = useState(titles);
  return <PosterRow title="Watch list" items={items} onPosterClick={save} onReorder={next=>{save(next.map(titleKey));setItems(next);}}/>;
}
const rect = (left:number,width:number,height=150)=>({left,right:left+width,top:100,bottom:100+height,width,height,x:left,y:100,toJSON:()=>({})});
function geometry() {
  vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockImplementation(function(this:HTMLElement){
    const port=document.querySelector<HTMLElement>(".poster-row-viewport")!;
    const card=this.closest<HTMLElement>("[data-reorder-key]");
    const index=card ? Array.from(port.querySelectorAll("[data-reorder-key]")).indexOf(card) : 0;
    return this===port ? rect(0,320) : rect(index*112-port.scrollLeft,100);
  });
}
const finger=(x:number,y=140)=>({identifier:8,clientX:x,clientY:y});
function start(button:HTMLElement) { fireEvent.touchStart(button,{touches:[finger(50)],changedTouches:[finger(50)]}); }
function move(button:HTMLElement,x:number,y=140) { fireEvent.touchMove(button,{touches:[finger(x,y)],changedTouches:[finger(x,y)]}); }
function end(button:HTMLElement,x:number) { fireEvent.touchEnd(button,{touches:[],changedTouches:[finger(x)]}); }
const order=()=>Array.from(document.querySelectorAll<HTMLElement>("[data-reorder-key]")).map(node=>node.dataset.reorderKey);

it("lets vertical and horizontal swipes scroll without lifting or opening a menu",()=>{
  const save=vi.fn();render(<Example save={save}/>);geometry();vi.useFakeTimers();
  const button=screen.getByRole("button",{name:"Open One"});
  for (const [x,y] of [[50,100],[10,140]]) {
    start(button); move(button,x,y);act(()=>vi.advanceTimersByTime(500));end(button,x);
    expect(document.querySelector(".poster-row-ghost")).toBeNull();
  }
  expect(screen.queryByRole("dialog")).toBeNull();expect(save).not.toHaveBeenCalled();
});
it("holds, animates neighbours, drops into the new slot and suppresses the synthetic click",()=>{
  const save=vi.fn();render(<Example save={save}/>);geometry();vi.useFakeTimers();
  const button=screen.getByRole("button",{name:"Open One"});start(button);act(()=>vi.advanceTimersByTime(390));
  expect(document.querySelector(".poster-row-ghost")).toBeTruthy();expect(screen.queryByRole("dialog")).toBeNull();
  move(button,170);act(()=>vi.advanceTimersByTime(32));
  expect(document.querySelector<HTMLElement>('[data-reorder-key="movie:2"]')!.style.transform).toContain("-112px");
  end(button,170);fireEvent.click(button);
  expect(save).toHaveBeenCalledTimes(1);expect(order()).toEqual(["movie:2","movie:1","movie:3","movie:4","movie:5"]);
  expect(document.querySelector(".poster-row-ghost")).toBeNull();
});
it("auto-scrolls at the edge to reach titles outside the screen",()=>{
  const save=vi.fn();render(<Example save={save}/>);geometry();vi.useFakeTimers();
  const button=screen.getByRole("button",{name:"Open One"});start(button);act(()=>vi.advanceTimersByTime(390));
  move(button,310);act(()=>vi.advanceTimersByTime(650));
  expect(document.querySelector<HTMLElement>(".poster-row-viewport")!.scrollLeft).toBeGreaterThan(180);
  end(button,310);expect(order().at(-1)).toBe("movie:1");
});
it.each(["touchcancel","blur","resize"])("cancels a drag on %s without saving",event=>{
  const save=vi.fn();render(<Example save={save}/>);geometry();vi.useFakeTimers();
  const button=screen.getByRole("button",{name:"Open One"});start(button);act(()=>vi.advanceTimersByTime(390));move(button,180);
  fireEvent(window,new Event(event));
  expect(save).not.toHaveBeenCalled();expect(document.querySelector(".poster-row-ghost")).toBeNull();expect(order()).toEqual(titles.map(titleKey));
});
it("supports keyboard placement and Escape cancellation",()=>{
  const save=vi.fn();render(<Example save={save}/>);geometry();
  const button=screen.getByRole("button",{name:"Open One"});
  fireEvent.keyDown(button,{key:" "});fireEvent.keyDown(button,{key:"ArrowRight"});fireEvent.keyDown(button,{key:"Escape"});
  expect(save).not.toHaveBeenCalled();
  fireEvent.keyDown(button,{key:" "});fireEvent.keyDown(button,{key:"ArrowRight"});fireEvent.keyDown(button,{key:"Enter"});
  expect(order().slice(0,2)).toEqual(["movie:2","movie:1"]);
});
it("preserves hidden slots and distinguishes movie and TV IDs",()=>{
  const tv={...titles[0],type:"tv" as const};const all=[titles[0],tv,titles[1]];
  expect(reorderVisible(all,[titles[1],titles[0]]).map(titleKey)).toEqual(["movie:2","tv:1","movie:1"]);
  expect(reorderVisible(all,[titles[1],titles[1],titles[4]])).toEqual(all);
});
it("keeps order after remount and isolates accounts and lists",()=>{
  function Saved({viewer="a",list="watchlist"}) {
    const {titles:items,reorder}=usePosterOrder(titles,viewer,list);
    return <><button onClick={()=>reorder([titles[1],titles[0],...titles.slice(2)])}>Sort</button><p data-testid="order">{items.map(titleKey).join(",")}</p></>;
  }
  const first=render(<Saved/>);fireEvent.click(screen.getByText("Sort"));first.unmount();
  const second=render(<Saved/>);expect(screen.getByTestId("order").textContent?.startsWith("movie:2,movie:1")).toBe(true);
  second.rerender(<Saved viewer="b"/>);expect(screen.getByTestId("order").textContent?.startsWith("movie:1,movie:2")).toBe(true);
  second.rerender(<Saved list="watched"/>);expect(screen.getByTestId("order").textContent?.startsWith("movie:1,movie:2")).toBe(true);
});
it("handles damaged storage and adds newly saved titles at the end",()=>{
  const key=posterOrderKey("a","watchlist");localStorage.setItem(key,"broken");expect(readPosterOrder(key)).toEqual([]);
  expect(orderedTitles(titles,["movie:2","movie:1"]).map(titleKey)).toEqual(["movie:2","movie:1","movie:3","movie:4","movie:5"]);
});
it("excludes a removed smart result without removing its source title, including dependent lists",()=>{
  const facts=new Map(titles.map(title=>[titleKey(title),{genres:["Action"],directors:[],minutes:[90]}]));
  const smart:SmartList={id:"smart",name:"Action",mode:"smart",rule:{kind:"genre",scope:"all",value:"Action"},excluded:["movie:1"]};
  const child:SmartList={...smart,id:"child",sources:["smart"],excluded:[]};
  const resolved=resolveList(child,new Map([[smart.id,smart],[child.id,child]]),titles,facts);
  expect(resolved.candidates.map(item=>titleKey(item.title))).toEqual(titles.slice(1).map(titleKey));
  expect(titles).toHaveLength(5);
});
