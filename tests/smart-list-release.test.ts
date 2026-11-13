import { expect, it } from "vitest";
import { describeRule, matchesRule, ruleFields, ruleFromName, type TitleFacts } from "../src/lib/home-lists";
import { catalogueReleaseDate, upcomingRelease, type ReleaseDate } from "../src/lib/list-release";
import { factsFromBindings, metadataQuery } from "../src/lib/list-metadata";

const title = {id:1,type:"movie" as const,title:"A title",posterPath:"",year:2026};
const facts: TitleFacts = {directors:[],genres:["horror film"],minutes:[89],releaseDates:[{date:"2026-11-13",precision:"day"}]};
const today = "2026-11-12";
it.each(["Not out yet", "Upcoming", "Coming soon", "Unreleased", "Not released yet", "Not yet released", "Yet to be released", "Haven't come out yet"])("understands %s as a dynamic release rule",name=>{
  const rule=ruleFromName(name)!;
  expect(rule).toEqual({kind:"release",state:"upcoming",scope:"all"});
  expect(ruleFields(rule)).toEqual(["release"]);
  expect(describeRule(rule)).toBe("Movies and TV shows not released yet");
  expect(matchesRule(title,facts,rule,today)).toBe(true);
  expect(matchesRule(title,facts,rule,"2026-11-13")).toBe(false);
});
it.each(["Upcoming horror movies", "Horror movies not out yet", "Coming soon horror movies under 90 minutes", "Horror movies from 2026 not out yet"])("retains other restrictions in %s",name=>{
  const rule=ruleFromName(name)!; expect(rule).not.toBeNull();
  expect(matchesRule(title,facts,rule,today)).toBe(true);
  expect(matchesRule({...title,type:"tv"},facts,rule,today)).toBe(false);
  expect(matchesRule(title,{...facts,genres:["comedy"]},rule,today)).toBe(false);
  expect(matchesRule(title,{...facts,releaseDates:[{date:"2026-11-01",precision:"day"}]},rule,today)).toBe(false);
});
it.each(["Not out yet in the UK", "Upcoming seasons", "Upcoming horror or thriller", "Not out yet on Netflix", "Not out yet with a happy ending"])("does not discard unsupported availability or story restrictions: %s",name=>expect(ruleFromName(name)).toBeNull());
it("uses the first release and does not guess from a stored year, a current-month estimate or missing metadata",()=>{
  const rule=ruleFromName("Not out yet")!;
  expect(matchesRule({...title,year:2027},undefined,rule,today)).toBeNull();
  expect(upcomingRelease([],today)).toBeNull();
  expect(upcomingRelease([{date:"2026-01-01",precision:"year"}],today)).toBeNull();
  expect(upcomingRelease([{date:"2026-11-01",precision:"month"}],today)).toBeNull();
  expect(upcomingRelease([{date:"2026-12-01",precision:"month"}],today)).toBe(true);
  expect(upcomingRelease([{date:"2027-01-01",precision:"year"}],today)).toBe(true);
  expect(upcomingRelease([{date:"2025-01-01",precision:"year"}],today)).toBe(false);
  expect(upcomingRelease([{date:"2027-01-01",precision:"day"},{date:"2026-10-01",precision:"day"}],today)).toBe(false);
  expect(upcomingRelease([{date:"invalid",precision:"day"}] as ReleaseDate[],today)).toBeNull();
});
it("preserves precision and rejects invalid calendar dates",()=>{
  expect(catalogueReleaseDate("+2027-01-01T00:00:00Z",9)).toEqual({date:"2027-01-01",precision:"year"});
  expect(catalogueReleaseDate("2028-02-29T00:00:00Z",11)?.date).toBe("2028-02-29");
  expect(catalogueReleaseDate("2027-02-29T00:00:00Z",11)).toBeNull();
  expect(catalogueReleaseDate("2026-01-01T00:00:00Z",8)).toBeNull();
  expect(catalogueReleaseDate("2026-13-01T00:00:00Z",10)).toBeNull();
});
it("fetches first-release statements with their date precision and keeps film and TV identities separate",()=>{
  const movie=metadataQuery("movie",[1],["release"])!;
  expect(movie).toContain("p:P577");expect(movie).not.toContain("p:P580");
  expect(movie).toContain("wikibase:timePrecision ?precision");
  expect(movie).toContain("FILTER(?rank != wikibase:DeprecatedRank)");
  expect(movie).toContain("wd:Q1985727");
  expect(metadataQuery("tv",[1],["release"])).toContain("p:P580");
  const row=(date:string,precision:string)=>({id:{value:"1"},field:{value:"release"},date:{value:date},precision:{value:precision}});
  const result=factsFromBindings("tv",[1],[row("2027-01-01T00:00:00Z","9"),row("2027-01-01T00:00:00Z","9"),row("2026-02-30T00:00:00Z","11")]);
  expect(result.has("movie:1")).toBe(false);
  expect(result.get("tv:1")?.releaseDates).toEqual([{date:"2027-01-01",precision:"year"}]);
});
