// For “why do they insist X?”, an exact, reviewed attribution can answer the
// question without asking a provider to reconstruct (or prove) the assertion.
import { formatTimestamp, type ViewingPosition } from './companion.ts';
import type { PreparedSceneNote } from './reviewed-scenes.ts';
const words = (s: string): string[] => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
const stop = new Set(
  'the a an that this these those is are was were has had have been be to of by as it so clearly actually'
    .split(' '),
);
const key = (s: string) => words(s).filter((w) => !stop.has(w));

export function reviewedAttribution(question: string, p: ViewingPosition, notes: PreparedSceneNote[]) {
  // Restrict to an anonymous attribution; a viewer-supplied identity, negation
  // or additional premise must not be treated as established fact.
  const m =
    /^why\s+(?:does|do|did)\s+(?:the (?:official|speaker|officer|spokesperson)|they|he|she)\s+(?:insist|maintain|claim|say|assert)\s+(?:that\s+)?(.+?)[?.!]*$/i
      .exec(question.trim());
  if (!m) return null;
  const [assertion, contrast] = m[1].split(/\s+despite\s+/i);
  const primary = key(assertion);
  if (primary.length < 3 || primary.length > 15 || new Set(primary).size < 3) return null;
  const needle = primary.join(' ');
  const exactAssertion = (s: string) => s.split(/[.!?]/).some((part) => key(part).join(' ') === needle);
  const matches = notes.filter((n) =>
    n.mediaType === p.mediaType && n.tmdbId === p.tmdbId &&
    n.season === (p.seasonNumber ?? null) && n.episode === (p.episodeNumber ?? null) &&
    n.start >= 0 && n.end >= n.start && n.end <= p.seconds && p.seconds - n.end <= 75 &&
    (n.validUntil === undefined || p.seconds <= n.validUntil) && !n.limited && !n.contextIds.length &&
    n.uses.includes('explanation') && n.cueIds?.length && n.cueIds.length === n.cueWords?.length &&
    n.cueWords.some(exactAssertion) && n.text.split(/[.!?]/).some((s) => {
      const basis = /\bbecause (?:they|he|she|the speaker) (?:say|says|said|claim|claims|insist|insists)\b(.+)/i
        .exec(s);
      return basis && key(basis[1]).join(' ') === needle;
    }) && (!contrast || (() => {
      // Only accept a reported alternative question, never a second assertion.
      const alternative =
        /^(?:the (?:audience|reporters|crowd) )?asking (?:whether|if) (?:[a-z]+ ){0,3}(?:could|might) be ([a-z]+)$/i
          .exec(contrast);
      if (!alternative) return false;
      const term = alternative[1].toLowerCase().replace(/s$/, '');
      return words(n.text).includes(term) &&
        n.cueWords.some((s) => words(s).some((w) => w.replace(/s$/, '') === term));
    })())
  );
  if (matches.length !== 1) return null;
  const note = matches[0];
  return {
    answer: note.text + ' That’s their stated reasoning. The claim itself isn’t independent proof.',
    limited: true as const,
    evidence: [{
      id: 'reviewed:' + note.id,
      label: 'Reviewed caption note · ' + formatTimestamp(note.start) + '–' + formatTimestamp(note.end),
      season: note.season,
      episode: note.episode,
      start: note.start,
      end: note.end,
      citations: [{ paragraph: 1, lineIds: note.cueIds! }],
    }],
  };
}
