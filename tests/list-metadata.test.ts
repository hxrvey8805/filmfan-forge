import { afterEach, expect, it, vi } from "vitest";
import { metadataQuery, factsFromBindings, listMetadata } from "../src/lib/list-metadata";
afterEach(()=>vi.unstubAllGlobals());
it("fetches requested fields without a cast/genre Cartesian explosion or ID injection",()=>{
  const query=metadataQuery("movie",[1,1,2,NaN,-1],["genre","actor","runtime"])!;
  expect(query).toContain('VALUES ?id { "1" "2" }');
  expect(query).toContain("(wdt:P136|wdt:P31)/wdt:P279*");
  expect(query).toContain("UNION");
  expect(query).toContain("wdt:P161");
  expect(query).not.toContain("wdt:P57");
  expect(metadataQuery("tv",[1],["runtime"])).toBeNull();
});
it("collects genre ancestors, people and duration units in distinct media namespaces",()=>{
  const row=(field:string,extra:object)=>({id:{value:"1"},field:{value:field},...extra});
  const value=(label:string,id:string)=>({value:{value:label},entity:{value:"http://www.wikidata.org/entity/"+id}});
  const rows=[row("genre",value("anime television series","Q123")),row("genre",value("anime","Q1107")),row("actor",value("Someone","Q444")),row("runtime",{amount:{value:"5400"},unit:{value:"http://www.wikidata.org/entity/Q11574"}}),row("runtime",{amount:{value:"1.5"},unit:{value:"http://www.wikidata.org/entity/Q25235"}})];
  const facts=factsFromBindings("movie",[1,2],rows);
  expect(facts.get("movie:1")).toMatchObject({genres:["anime television series","anime"],actors:["Someone"],minutes:[90],entities:{genre:["Q123","Q1107"],actor:["Q444"]}});
  expect(facts.has("tv:1")).toBe(false);
  expect(facts.get("movie:2")?.genres).toEqual([]);
});
it("keeps failed batches unknown, retries and never calls a paid AI",async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(new Response("limit",{status:429})).mockResolvedValueOnce(Response.json({results:{bindings:[{id:{value:"777"},field:{value:"genre"},value:{value:"anime"}}]}}));
  vi.stubGlobal("fetch",fetch);
  const titles=[{id:777,type:"tv" as const,title:"Example",posterPath:""}];
  const signal=new AbortController().signal;
  expect(await listMetadata(titles,signal,["genre"])).toMatchObject({failed:true});
  const result=await listMetadata(titles,signal,["genre"]);
  expect(result.failed).toBe(false); expect(result.facts.get("tv:777")?.genres).toEqual(["anime"]);
  await listMetadata(titles,signal,["genre"]);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls.every(([url])=>String(url).startsWith("https://query.wikidata.org/sparql?"))).toBe(true);
});
it("does not fetch metadata for a year-only rule",async()=>{
  const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
  await listMetadata([{id:1,type:"movie",title:"Example",posterPath:""}],new AbortController().signal,[]);
  expect(fetch).not.toHaveBeenCalled();
});
