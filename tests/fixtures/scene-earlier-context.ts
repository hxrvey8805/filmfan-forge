import type {SubtitleRecord,ViewingPosition} from '../../supabase/functions/_shared/companion.ts';

// Invented story for cross-episode reasoning tests; no real title or caption data.
export const scenePosition:ViewingPosition={tmdbId:999991,mediaType:'tv',seasonNumber:1,episodeNumber:2,seconds:300};
export const sceneQuestion='Explain this scene.';
export function sceneRecords():SubtitleRecord[] {
  const row=(episode:number,cues:SubtitleRecord['cues'],title=scenePosition.tmdbId,season=1):SubtitleRecord=>({
    id:`scene-test:${title}:${season}:${episode}`,tmdb_id:title,media_type:'tv',season_number:season,episode_number:episode,
    ingestion_version:3,source_file_id:900+episode,cues,
  });
  return [
    row(1,[{start:15,end:25,text:'LYRA: I promised Theo I would keep the north gate shut while the flood alarm was active.\nTHEO: Opening it could flood the lower village.'}]),
    row(2,[{start:10,end:15,text:'LYRA: We checked the road this morning.'},
      {start:285,end:290,text:'THEO: The flood alarm is still active.'},
      {start:291,end:296,text:'LYRA: Then the gate stays shut.'},
      {start:299,end:310,text:'CROSSING_CUTOFF_SECRET'},
      {start:340,end:350,text:'LATER_TIMESTAMP_SECRET'}]),
    row(3,[{start:1,end:10,text:'FUTURE_EPISODE_SECRET'}]),
    row(1,[{start:1,end:10,text:'FOREIGN_TITLE_SECRET'}],123456),
    row(1,[{start:1,end:10,text:'FUTURE_SEASON_SECRET'}],scenePosition.tmdbId,2),
  ];
}
