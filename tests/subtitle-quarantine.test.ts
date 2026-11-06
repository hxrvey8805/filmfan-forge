import { describe, expect, it } from 'vitest';
import { selectSubtitleFile } from '../supabase/functions/_shared/subtitle-source';
import { subtitleCacheRows } from '../supabase/functions/_shared/subtitle-cache';
import { permittedCues, type ViewingPosition } from '../supabase/functions/_shared/companion';

describe('subtitle edition quarantine', () => {
  it.each([
    [{tmdbId:66573,mediaType:'tv',seasonNumber:1,episodeNumber:1},4231334],
    [{tmdbId:329865,mediaType:'movie'},1160602],
  ] as const)('rejects a bad download, cache write and legacy row, and accepts a traced replacement', (scope,badFile) => {
    const p:ViewingPosition={...scope,seconds:9}, cues=[{start:3,end:9,text:'example'}];
    const feature = p.mediaType==='tv'?{feature_type:'Episode',parent_tmdb_id:p.tmdbId, season_number:1,episode_number:1}:{feature_type:'Movie',tmdb_id:p.tmdbId};
    const result=(id:number,n:number)=>({attributes:{feature_details:feature,language:'en',download_count:n,files:[{file_id:id}]}});
    expect(selectSubtitleFile([result(badFile,1000)],p)).toBeNull();
    expect(selectSubtitleFile([result(badFile,1000),result(123,1)],p)).toBe(123);
    const fresh=subtitleCacheRows(scope,123,cues)[0];
    expect(permittedCues({...fresh,id:'probe'},p)).toEqual(cues);
    for(const id of [badFile,null]){
      expect(()=>subtitleCacheRows(scope,id,cues)).toThrow('Unreliable subtitle edition');
      expect(permittedCues({...fresh,id:'probe',source_file_id:id},p)).toEqual([]);
    }
  });
});
