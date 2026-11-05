import { type Evidence, evidenceLabel } from './companion.ts';

// P-prefixes exist only in this request. Persist the actual source ID alongside
// them so a reader can trace each displayed paragraph after playback changes.
export function paragraphSources(permitted: Evidence[], paragraphs: string[][]) {
  return permitted.flatMap((source, index) => {
    const prefix = `P${index + 1}:`;
    const citations = paragraphs.flatMap((ids, n) => {
      const lineIds = [...new Set(ids.filter((id) => id.startsWith(prefix)))];
      return lineIds.length ? [{ paragraph: n + 1, lineIds }] : [];
    });
    return citations.length
      ? [{
        id: source.id,
        label: evidenceLabel(source),
        season: source.season,
        episode: source.episode,
        start: source.start,
        end: source.end,
        citations,
      }]
      : [];
  });
}
