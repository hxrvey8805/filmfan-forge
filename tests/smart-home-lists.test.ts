import { expect, it } from "vitest";
import { matchesRule, ruleFromName, titleKey, type LibraryTitle } from "../src/lib/home-lists";

import { dependsOn, resolveList, savedTitles, type ListSource, type SmartList } from "../src/lib/list-sources";

const movie: LibraryTitle = { id: 985, title: "Eraserhead", type: "movie", posterPath: "" };
const show = { ...movie, type: "tv" as const };
const facts = { directors: ["David Lynch"], genres: ["body horror film"], minutes: [89] };

it("interprets the list name and only includes verified members of its media type", () => {
  expect(ruleFromName("Friday options")).toBeNull();
  const director = ruleFromName("Movies directed by David Lynch")!;
  expect(matchesRule(movie, facts, director)).toBe(true);
  expect(matchesRule(movie, {...facts, directors:["Jennifer Lynch"]}, director)).toBe(false);
  expect(matchesRule(show, facts, director)).toBe(false);
  expect(titleKey(movie)).not.toBe(titleKey(show));
  expect(matchesRule(show, facts, ruleFromName("Horror list")!)).toBe(true);
});
it("uses a strict runtime cutoff, including when cuts differ or runtime is unknown", () => {
  const r = ruleFromName("movies under 1hr and a half")!;
  expect(r).toEqual({kind:"runtime",scope:"movie",minutes:90,inclusive:false});
  expect(ruleFromName("Films under an hour and a half")).toEqual(r);
  expect(matchesRule(movie, facts, r)).toBe(true);
  expect(matchesRule(movie, {...facts, minutes:[89,90]}, r)).toBe(false);
  expect(matchesRule(movie, {...facts, minutes:[]}, r)).toBeNull();
  expect(matchesRule(show, undefined, r)).toBe(false);
  expect(matchesRule(movie, {...facts, minutes:[90]}, ruleFromName("Movies up to 1h 30m")!)).toBe(true);
});

it("keeps older all-library rules and scopes new ones to the union of chosen shelves and lists", () => {
  const other = { ...movie, id: 1018, title: "Mulholland Drive" };
  const third = { ...movie, id: 42, title: "Another saved film" };
  const sourceList: ListSource[] = [
    {id:"watch", name:"Watch list", mode:"shelf", titles:[movie, other, show]},
    {id:"friday", name:"Friday options", mode:"manual", titles:[movie]},
    {id:"fav", name:"Favourites", mode:"shelf", titles:[third]},
  ];
  const sources = new Map(sourceList.map(s => [s.id, s]));
  const all = savedTitles(sourceList);
  const known = new Map([movie,other,third].map(t => [titleKey(t), facts]));
  const root: SmartList = { id:"short", name:"Short", mode:"smart", rule:ruleFromName("Movies under 90 minutes")! };
  const results = (selected: SmartList) => resolveList(selected, sources, all, known).candidates.map(x=>x.title.id);
  expect(results(root)).toEqual([985,1018,42]);
  expect(results({...root, sources:["friday"]})).toEqual([985]);
  expect(results({...root, sources:["friday","watch"]})).toEqual([985,1018]);
  expect(results({...root, sources:["deleted"]})).toEqual([]);
  expect(resolveList({...root, sources:["deleted"]}, sources, all, known).missing.has("deleted")).toBe(true);
});
it("applies both rules when a smart list feeds another and prevents circular choices", () => {
  const lynch: SmartList = { id:"lynch", name:"Lynch", mode:"smart", rule:ruleFromName("Movies directed by David Lynch")! };
  const short: SmartList = { id:"short", name:"Short", mode:"smart", sources:["lynch"], rule:ruleFromName("Movies under 90 minutes")! };
  const sources = new Map<string,ListSource>([[lynch.id,lynch],[short.id,short]]);
  const check = (directors: string[]) => resolveList(short,sources,[movie],new Map([[titleKey(movie),{...facts,directors}]])).candidates;
  expect(check(["David Lynch"])[0].verified).toBe(true);
  expect(check([])[0].verified).toBe(false);
  expect(check(["Someone else"])).toEqual([]);
  expect(dependsOn(short,lynch.id,sources)).toBe(true);
});
