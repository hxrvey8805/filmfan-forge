import {it,expect} from 'vitest';
import {draftGroundingIssues} from '../supabase/functions/_shared/draft-grounding';
const issues=(claim:string,source:string)=>draftGroundingIssues('What work?',{status:'answered',claims:[{text:claim,evidenceIds:['s']}]},[{id:'s',text:source,start:0,end:10}]);
it('allows ordinary acronym+noun spacing and regular plurals without inventing identities',()=>{
 expect(issues('His PC-bang work was an earlier job.','He mentioned PC bangs among his earlier jobs.')).not.toContain('identity');
 expect(issues('His TV-show work was an earlier job.','He worked on TV shows.')).not.toContain('identity');
});
it('still rejects unsupported acronyms, different nouns and misspelled personal names',()=>{
 expect(issues('His FBI-bang work was an earlier job.','He mentioned PC bangs.')).toContain('identity');
 expect(issues('His PC-prison work was an earlier job.','He mentioned PC bangs.')).toContain('identity');
 expect(issues('It was Mary-Jan who worked there.','Mary Jane worked there.')).toContain('identity');
});
