import {it,expect} from 'vitest';
import {solBody} from '../supabase/functions/_shared/sol-budget';
const body=(name:string)=>solBody({messages:[{role:'user',content:'bounded context'}],plugins:['web','response-healing','context-compression','file-parser','pareto-router','fusion'].map(id=>({id,enabled:false})),response_format:{type:'json_schema',json_schema:{name}},reasoning:{effort:'low'}});
it('uses lighter reasoning only to choose permitted source IDs',()=>{
 for(const name of ['companion_search_terms','companion_relevant_sources','companion_budgeted_sources'])expect(body(name).reasoning).toEqual({effort:'low',exclude:true});
});
it('preserves full writer/reviewer reasoning and all model and price pins',()=>{
 for(const name of ['companion_story_discussion','companion_story_discussion_check','unrecognised']) {
  const b=body(name);expect(b.reasoning).toEqual({effort:'medium',exclude:true});expect(b.model).toBe('openai/gpt-6.1-sol');
  expect(b.provider).toEqual({only:['openai'],allow_fallbacks:false,require_parameters:true,max_price:{prompt:2,completion:10,request:0}});
 }
});
