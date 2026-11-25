import {describe,expect,it} from 'vitest';
import {watchAnswer as updated} from '../supabase/functions/_shared/watch-answer';
import golden from './fixtures/companion-latency-contract.json';
import {cases,runLatencyContract} from './fixtures/companion-latency-contract';
describe('unchanged request and answer contract from deployed baseline',()=>{
  it.each(cases)('%s keeps every model input, check and final answer unchanged',async kind=>{
    expect(await runLatencyContract(updated,kind)).toEqual(golden[kind]);
  });
});
