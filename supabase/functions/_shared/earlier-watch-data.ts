import type { ViewingPosition } from './companion.ts';
import { completeSceneEvidence } from './scene-evidence.ts';
import { cutGroup } from './cut-scope.ts';
import type { EpisodeScope } from './question-scope.ts';
import type { WatchData, WatchStore } from './watch-service.ts';

const key = (p: EpisodeScope) => `${p.season}:${p.episode}`;
export type StoryCoverage = { missing: EpisodeScope[]; catalogComplete: boolean };

// Prepare sources before any interpretation. Two cold episodes per request
// reuse the existing preparation protocol; cached episodes cost no downloads.
export async function earlierWatchData(p: ViewingPosition, store: WatchStore): Promise<WatchData & { coverage: StoryCoverage }> {
  const cached = await store.earlier(p);
  const data = { ...cached, records: [...cached.records], notes: [...cached.notes] };
  const catalog = p.seasonNumber! > 1 ? await store.seasons(p) : [];
  const expected: EpisodeScope[] = [];
  let catalogComplete = true;
  for (let season = 1; season <= p.seasonNumber!; season++) {
    const matches = catalog.filter(s => s.season === season);
    const count = season === p.seasonNumber! ? p.episodeNumber! - 1 :
      matches.length === 1 && Number.isInteger(matches[0].count) && matches[0].count > 0 ? matches[0].count : -1;
    if (count < 0) { catalogComplete = false; continue; }
    // Bound preparation even for malformed metadata or extremely long shows.
    if (expected.length + count > 100) { catalogComplete = false; break; }
    for (let episode = 1; episode <= count; episode++) expected.push({ season, episode });
  }
  const unavailable = new Set((await store.unavailable?.(p) ?? []).map(key));
  const missing: EpisodeScope[] = [];
  let cold = 0, progress = 0;
  for (const episode of expected) {
    const at = { ...p, seasonNumber: episode.season, episodeNumber: episode.episode, seconds: 43200 };
    if (cutGroup(at) || completeSceneEvidence(data.records, at).length) continue;
    if (!unavailable.has(key(episode))) {
      if (cold >= 2 && progress > 0 && store.prepareLater) store.prepareLater();
      // Offline callers without the preparation protocol get an honest gap.
      if (cold < 2) {
        cold++;
        const loaded = await store.current(at);
        data.records.push(...loaded.records);
        data.notes.push(...loaded.notes);
        data.incomplete ||= loaded.incomplete;
        if (completeSceneEvidence(data.records, at).length) { progress++; continue; }
        // Confirm an unavailable-file checkpoint before asking the client to
        // retry. Conflicting/empty imports must not cause an endless spinner.
        for(const missing of await store.unavailable?.(p) ?? [])unavailable.add(key(missing));
        if(unavailable.has(key(episode)))progress++;
      }
    }
    missing.push(episode);
  }
  return { ...data, coverage: { missing, catalogComplete },
    incomplete: !!data.incomplete || !!missing.length || !catalogComplete };
}

export function storyCoverageMessage(coverage: StoryCoverage) {
  const labels = coverage.missing.slice(0,8).map(p => `S${p.season}E${p.episode}`).join(', ');
  return `I’m missing reliable context for ${labels || 'some earlier episodes'}${coverage.missing.length > 8 ? ' and other earlier episodes' : ''}${!coverage.catalogComplete && labels ? ', and part of the episode catalogue' : ''}, so this covers only what I can verify—not necessarily every example.`;
}
