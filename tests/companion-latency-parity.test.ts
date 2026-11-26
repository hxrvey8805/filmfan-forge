import {describe,expect,it} from 'vitest';
import {watchAnswer as updated} from '../supabase/functions/_shared/watch-answer';
import golden from './fixtures/companion-latency-contract.json';
import {cases,runLatencyContract} from './fixtures/companion-latency-contract';
import {recapAttributionRules} from '../supabase/functions/_shared/story-discussion';
describe('baseline contract with only the reviewed recap attribution guidance added',()=>{
  it.each(cases)('%s preserves sources, settings, review and fixture answer',async kind=>{
    expect(await runLatencyContract(updated,kind,(system,phase)=>{
      if(kind==='recap-range' && phase==='writer') {
        expect(system.split(recapAttributionRules)).toHaveLength(2);
        return system.replace(recapAttributionRules,'');
      }
      expect(system).not.toContain(recapAttributionRules);
      return system;
    })).toEqual(golden[kind]);
  });
});
