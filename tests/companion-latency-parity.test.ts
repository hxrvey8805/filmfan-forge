import {describe,expect,it} from 'vitest';
import {watchAnswer as updated} from '../supabase/functions/_shared/watch-answer';
import golden from './fixtures/companion-latency-contract.json';
import {cases,runLatencyContract} from './fixtures/companion-latency-contract';
import type { AnswerFormat } from '../supabase/functions/_shared/answer-schema';

// Keep the original deployed hashes. Permit ONLY the explicitly asserted
// receipt-schema strengthening; prompts, source packets, warning inputs, token
// settings, order, call counts and final answers must still match byte-for-byte.
function normalizeReceiptContract(args:unknown[]):unknown[] {
  const format=args[4] as AnswerFormat|undefined;
  if(format?.json_schema.name!=='companion_story_discussion_check')return args;
  const obj=(properties:Record<string,unknown>)=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
  const packet=JSON.parse(args[1] as string) as {sources:{id:string}[]};
  const proof=obj({id:{type:'string',enum:packet.sources.map(s=>s.id)},firstLine:{type:'integer',minimum:1},lastLine:{type:'integer',minimum:1}});
  const issues=['none','identity','speaker','action','cause','timing','spoiler','relevance','citation'];
  const legacy={index:{type:'integer'},supported:{type:'boolean'},issue:{type:'string',enum:issues},
    attribution:{type:'string',enum:['none','explicit','contextual','uncertain']},support:{type:'array',items:proof,minItems:0,maxItems:8}};
  const copy=structuredClone(args);
  const schema=(copy[4] as AnswerFormat).json_schema.schema as {properties:{checks:{items:unknown}}};
  expect(schema.properties.checks.items).toEqual({anyOf:[
    obj({...legacy,supported:{type:'boolean',enum:[true]},issue:{type:'string',enum:['none']},
      attribution:{type:'string',enum:['none','explicit','contextual']},support:{...legacy.support,minItems:1}}),
    obj({...legacy,supported:{type:'boolean',enum:[false]},issue:{type:'string',enum:issues.slice(1)}}),
  ]});
  schema.properties.checks.items=obj(legacy);
  return copy;
}

describe('unchanged answer generation apart from the reviewed citation contract',()=>{
  it.each(cases)('%s preserves the original prompts, context, calls and answer',async kind=>{
    expect(await runLatencyContract(updated,kind,normalizeReceiptContract)).toEqual(golden[kind]);
  });
});
