import { selectSceneContext } from '../supabase/functions/_shared/scene-evidence';
import { mentionsAlternateCut, selectSubtitleFile } from '../supabase/functions/_shared/subtitle-source';
import { describe, expect, it, vi } from 'vitest';
import { companionAnswer } from '../supabase/functions/_shared/answer';
import { questionIntent, safeHistory, type ViewingPosition } from '../supabase/functions/_shared/companion';
import { priorEpisodes, seriesRecap } from '../supabase/functions/_shared/series-recap';
import { wholeShowRecap } from '../supabase/functions/_shared/cut-scope';
import { sharedCutFacts } from '../supabase/functions/_shared/shared-cut-story';

const p: ViewingPosition = { tmdbId: 66573, mediaType: 'tv', seasonNumber: 1, episodeNumber: 1, seconds: 600 };
describe('shared-cut releases and opt-in series recaps', () => {
  it('requires the same fact to have finished in every reviewed edition, including fractional boundaries', () => {
    const review = {
      editions: [1, 2],
      facts: [{ id: 'a', text: 'safe', completed: [3, 6.04] }, { id: 'b', text: 'exclusive', completed: [4] }],
    };
    expect(sharedCutFacts(review, 6)).toEqual([]);
    expect(sharedCutFacts(review, 6.04).map((x) => x.id)).toEqual(['a']);
  });
  it('constructs a chronological pilot recap and never sends a single-cut source or old question to a writer', async () => {
    const gen = vi.fn();
    const prior = { question: 'UNRELATED_QUESTION', answer: 'EARLY_DISCLOSURE' };
    const r = await companionAnswer(
      'Recap the entire episode so far',
      p,
      [{ id: 'unsafe', season: 1, episode: 1, start: 0, end: 5, text: 'EARLY_DISCLOSURE' }],
      [prior as never],
      gen, undefined, undefined, [], {captionDiscussion:true},
    );
    expect(r?.answer).toMatch(/life on Earth[\s\S]*Good Place[\s\S]*soulmate/i);
    expect(r?.answer).not.toMatch(/memories|lawyer|EARLY_DISCLOSURE/);
    expect(gen).not.toHaveBeenCalled();
  });
  it('keeps previous episodes out of ordinary and episode-only requests', () => {
    for (
      const q of [
        'What is the show telling me here?',
        'What happened to Hal in the show?',
        'Recap this scene in the series',
        'Don’t recap the whole show',
        'Recap the joke from the show', 'Recap episode 3', 'Give me a recap of episode one',
      ]
    ) expect(wholeShowRecap(q)).toBe(false);
    expect(wholeShowRecap('Recap just this episode of the show')).toBe(false);
    expect(wholeShowRecap('Catch me up on the whole show so far')).toBe(true);
    expect(questionIntent('Who had the key up to this point?')).toBe('explanation');
  });
  it('reads only earlier episodes, keeps the current cutoff and safely restores only explicit series recaps', async () => {
    const pos = { ...p, episodeNumber: 3, seconds: 15 };
    const list = priorEpisodes(pos, []);
    const source = (s: number, e: number, t: number) => ({
      answer: 'checked ' + e,
      evidence: [{ id: 'abc', label: 'beat', season: s, episode: e, start: t, end: t }],
    });
    const read = vi.fn(async (q: ViewingPosition) => source(q.seasonNumber!, q.episodeNumber!, 300));
    const question = 'Recap the whole show so far';
    const result = await seriesRecap(
      question,
      pos,
      [...list, { season: 1, episode: 4 }],
      async () => source(1, 3, 15),
      read,
    );
    expect(read.mock.calls.map(([q]) => q.episodeNumber)).toEqual([1, 2]);
    expect(result.answer).toMatch(/S1E1[\s\S]*S1E2[\s\S]*S1E3/);
    const row = {
      id: '1',
      title_id: 66573,
      media_type: 'tv',
      season_number: 1,
      episode_number: 3,
      position_seconds: 15,
      companion_version: 3,
      created_at: '',
      context: '',
      timestamp: null,
      question,
      answer: result.answer,
      evidence: result.evidence,
    };
    expect(safeHistory([row], pos)).toHaveLength(1);
    expect(safeHistory([row], { ...pos, seconds: 14 })).toHaveLength(0);
    expect(safeHistory([{ ...row, question: 'What happened here?' }], pos)).toHaveLength(0);
    expect(safeHistory([row], { ...pos, episodeNumber: 2 })).toHaveLength(0);
  });
});

it('does not mix conflicting cached clocks or trust combined-episode uploads', () => {
  const movie: ViewingPosition = {tmdbId:101,mediaType:'movie',seconds:12};
  const record = {id:'first',tmdb_id:101,media_type:'movie',season_number:null,episode_number:null,ingestion_version:3,source_file_id:101,cues:[{start:1,end:2,text:'An early reveal in only one cut.'}]};
  expect(selectSceneContext([record,{...record,id:'second',source_file_id:102}],movie,'What happened?',[]).evidence).toEqual([]);
  const movieResult = {attributes:{release:'Film.Directors.Cut',feature_details:{feature_type:'Movie',tmdb_id:101}}};
  expect(mentionsAlternateCut([movieResult],movie)).toBe(true);
  expect(mentionsAlternateCut([movieResult],{...movie,tmdbId:102})).toBe(false);
  const ep = {attributes:{release:'show.S01E01E02.web',language:'en',feature_details:{feature_type:'Episode',parent_tmdb_id:11,season_number:1,episode_number:1},files:[{file_id:109}]}};
  expect(selectSubtitleFile([ep],{tmdbId:11,mediaType:'tv',seasonNumber:1,episodeNumber:1})).toBeNull();
});
