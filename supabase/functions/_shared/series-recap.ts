import { companionVersionFor, formatTimestamp, type ViewingPosition } from './companion.ts';
import type { CheckedResponse } from './companion-response.ts';
import { wholeShowRecap } from './cut-scope.ts';

export type Episode = { season: number; episode: number };
type Season = { season: number; count: number };
export function priorEpisodes(p: ViewingPosition, seasons: Season[], currentSeasonOnly = false) {
  const earlier: Episode[] = [];
  for (
    const s of seasons.filter((s) => !currentSeasonOnly && s.season > 0 && s.season < p.seasonNumber!).sort((
      a,
      b,
    ) => a.season - b.season)
  ) {
    for (let e = 1; e <= s.count; e++) earlier.push({ season: s.season, episode: e });
  }
  for (let e = 1; e < p.episodeNumber!; e++) earlier.push({ season: p.seasonNumber!, episode: e });
  return earlier;
}
export function episodeRevision(p: ViewingPosition) {
  return 'shared-cuts-v1:' + companionVersionFor(p);
}
export async function seriesRecap(
  question: string,
  p: ViewingPosition,
  previous: Episode[],
  readCurrent: () => Promise<CheckedResponse | null>,
  read: (p: ViewingPosition) => Promise<CheckedResponse | null>,
  catalogComplete = true,
): Promise<CheckedResponse> {
  if (p.mediaType !== 'tv' || !wholeShowRecap(question)) {
    throw Error('A whole-show recap must be requested explicitly');
  }
  const chapters: string[] = [];
  const evidence: CheckedResponse['evidence'] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const item of previous) {
    if (
      item.season < 0 || item.episode < 1 ||
      !(item.season < p.seasonNumber! || item.season === p.seasonNumber && item.episode < p.episodeNumber!)
    ) continue;
    const label = 'S' + item.season + 'E' + item.episode;
    if (seen.has(label)) continue;
    seen.add(label);
    const pos = { ...p, seasonNumber: item.season, episodeNumber: item.episode, seconds: 43200 };
    const chapter = await read(pos);
    if (
      !chapter?.evidence.length ||
      chapter.evidence.some((e) =>
        e.season !== item.season || e.episode !== item.episode || !Number.isFinite(e.end) || e.end > pos.seconds ||
        e.end < e.start || e.start < 0
      )
    ) {
      missing.push(label);
      continue;
    }
    if (chapter.limited) missing.push(label);
    chapters.push(label + ' — ' + chapter.answer);
    for (const e of chapter.evidence) {
      evidence.push({
        ...e,
        id: 'series:' + p.tmdbId + ':' + item.season + ':' + item.episode + ':v' + companionVersionFor(pos) + ':' +
          e.id,
        label: label + ' · ' + e.label,
      });
    }
  }
  const current = await readCurrent();
  const here = 'S' + p.seasonNumber + 'E' + p.episodeNumber;
  if (
    current?.evidence.length &&
    current.evidence.every((e) =>
      e.season === p.seasonNumber && e.episode === p.episodeNumber && e.end <= p.seconds
    )
  ) {
    chapters.push(here + ' through ' + formatTimestamp(p.seconds) + ' — ' + current.answer);
    evidence.push(...current.evidence);
  } else if (p.seconds > 0) missing.push(here);
  if (!catalogComplete) chapters.push('I could verify only this season’s episode order.');
  if (missing.length) chapters.push('My coverage is incomplete for ' + missing.join(', ') + '.');
  return {
    answer: chapters.join('\n\n') || 'There are no verified story events to recap at this point.',
    evidence,
    ...(!catalogComplete || missing.length || (p.seconds > 0 && current?.limited) || !evidence.length
      ? { limited: true as const }
      : {}),
  };
}
