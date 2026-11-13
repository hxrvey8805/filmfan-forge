import { expect, it } from "vitest";
import { interpretListName, matchesRule, ruleFromName, ruleFields, type ListRule, type TitleFacts } from "../src/lib/home-lists";
import { catalogueChoices, ruleForChoice } from "../src/lib/list-catalogue";
const movie = {id:1,type:"movie" as const,title:"Example",posterPath:"",year:1995};
const show = {...movie,type:"tv" as const};
const facts: TitleFacts = {genres:["romantic comedy film","anime film"], directors:["Hayao Miyazaki"],minutes:[89],countries:["Japan"], actors:["Tom Hanks"],languages:["Japanese"],studios:["Studio Ghibli"]};
const parse = (text:string) => { const rule=ruleFromName(text); expect(rule, text).not.toBeNull(); return rule!; };
it.each(["anime","romantic", "romantic anime", "romantic comedies", "rom-coms", "animation", "animated movies", "Japanese anime movies", "romance and anime", "romantic anime movies under 90 minutes", "90s romantic movies", "romantic movies from 1990 to 1999", "romantic movies from 1990-1999", "movies starring Tom Hanks", "films directed by Hayao Miyazaki", "films produced by Studio Ghibli", "films in Japanese language"])("understands %s and matches verified facts", text => {
  // Animation is an ancestor of anime in the catalogue.
  expect(matchesRule(movie,{...facts,genres:[...facts.genres,"animated film"]},parse(text))).toBe(true);
});
it("keeps romance and anime as separate conditions, not all animation",()=>{
  const rule=parse("romantic anime");
  expect(matchesRule(movie,{...facts,genres:["animated film","romance film"]},rule)).toBe(false);
  expect(matchesRule(movie,{...facts,genres:["anime series","action"]},rule)).toBe(false);
  expect(matchesRule(movie,undefined,rule)).toBeNull();
  expect(matchesRule(movie,{...facts,genres:["anime-influenced animation","romance film"]},parse("anime"))).toBe(false);
});
it("supports OR, exclusions, exact years and strict cutoffs",()=>{
  expect(matchesRule(movie,{...facts,genres:["psychological thriller"]},parse("horror or thriller movies"))).toBe(true);
  expect(matchesRule(movie,{...facts,genres:["horror"]},parse("horror movies without romance"))).toBe(true);
  expect(matchesRule(movie,{...facts,genres:["horror","romantic horror"]},parse("horror movies without romance"))).toBe(false);
  expect(matchesRule(movie,{...facts,genres:[]},parse("horror movies without romance"))).toBeNull();
  expect(matchesRule(movie,undefined,parse("movies from 1995"))).toBe(true);
  expect(matchesRule(movie,undefined,parse("movies before 1995"))).toBe(false);
  expect(matchesRule(movie,undefined,parse("movies after 1995"))).toBe(false);
  expect(matchesRule(movie,undefined,parse("movies since 1995"))).toBe(true);
  expect(matchesRule({...movie,year:undefined},undefined,parse("90s films"))).toBeNull();
  expect(matchesRule(show,facts,parse("romantic movies"))).toBe(false);
  expect(matchesRule(show,facts,parse("romantic shows"))).toBe(true);
  expect(matchesRule(movie,{...facts,minutes:[89,90]},parse("romantic movies under 90 minutes"))).toBe(false);
});
it.each(["horror movies under 90 minutes with a happy ending","horror or thriller under 90 minutes", "anime but not violent", "best movies", "TV shows under 90 minutes", "romantic movies with no sad ending", "horror movies rated over 8", "movies from 2020 to 1990", "horror without romance or comedy", "horror without romance and comedy", "romantic movies and anime shows"])("does not silently drop an unsupported restriction: %s", text=>expect(ruleFromName(text)).toBeNull());
it("does not mistake moods or two-word genres for directors; free catalogue disambiguation handles names",()=>{
  expect(interpretListName("Feel Good movies").rule).toBeNull();
  expect(interpretListName("David Lynch movies").lookup).toEqual({term:"david lynch",field:"category",scope:"movie"});
  const request="time travel movies under 90 minutes";
  const lookup=interpretListName(request).lookup!;
  expect(lookup.term).toBe("time travel");
  const rule=interpretListName(request,{term:lookup.term,field:lookup.field,rule:{kind:"topic",entityId:"Q444",value:"Time travel",scope:"movie"}}).rule!;
  expect(ruleFields(rule).sort()).toEqual(["runtime","topic"]);
  expect(matchesRule(movie,{...facts,entities:{topic:["Q444"]}},rule)).toBe(true);
  expect(matchesRule(movie,{...facts,minutes:[120],entities:{topic:["Q444"]}},rule)).toBe(false);
});
it("pins the selected meaning by entity ID and keeps missing details unknown",()=>{
  const options=catalogueChoices({search:[
    {id:"Q9081",label:"David Lynch",description:"American filmmaker and actor"},
    {id:"Q444",label:"Time travel",description:"concept of moving between points in time"},
    {id:"Q123",label:"Time Travel",description:"2020 film"},
    {id:"Q1) }",label:"Injected",description:"film genre"},
  ]});
  expect(options).toHaveLength(2);
  expect(options[0].roles).toEqual(["actor","director"]);
  const rule=ruleForChoice(options[0],"director",{term:"David Lynch",field:"category",scope:"movie"});
  expect(matchesRule(movie,{...facts,directors:["David Lynch"],entities:{director:["Qdifferent"]}},rule)).toBe(false);
  expect(matchesRule(movie,{...facts,directors:[],entities:{}},rule)).toBeNull();
  expect(matchesRule(movie,{...facts,entities:{director:["Q9081"]}},rule)).toBe(true);
});
it("keeps saved v1 rules usable",()=>{
  const legacy:ListRule={kind:"director",value:"Hayao Miyazaki",scope:"movie"};
  expect(matchesRule(movie,facts,legacy)).toBe(true);
  expect(matchesRule(movie,facts,{kind:"genre",value:"Romance",scope:"all"})).toBe(true);
});

it("keeps recognised conditions when a second category needs catalogue lookup",()=>{
  const request="Japanese time travel movies under 120 minutes";
  const lookup=interpretListName(request).lookup!;
  expect(lookup.term).toBe("time travel");
  const rule=interpretListName(request,{term:lookup.term,field:lookup.field,rule:{kind:"topic",entityId:"Q182154",value:"Time travel",scope:"movie"}}).rule!;
  expect(matchesRule(movie,{...facts,entities:{topic:["Q182154"]}},rule)).toBe(true);
  expect(matchesRule(movie,{...facts,countries:["United States of America"],entities:{topic:["Q182154"]}},rule)).toBe(false);
});
