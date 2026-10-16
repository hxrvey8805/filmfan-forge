import { permittedCues, type Cue, type SubtitleRecord, type ViewingPosition } from '../../supabase/functions/_shared/companion.ts';

// Offline experiment only. A screenplay is not timed scene evidence and may
// differ from the final cut. Review the source and alignment before any use.
export interface DialogueTurn { scene: string; speaker: string; text: string }
export interface DialogueTrack { tmdbId: number; mediaType: 'tv' | 'movie'; season: number | null; episode: number | null; turns: DialogueTurn[] }
export interface SpeakerAlignment { recordId: string; start: number; end: number; text: string; label: string; sourceTurns: number[] }

const words = (text: string) => text.normalize('NFKC').toLowerCase().replaceAll('’', "'").match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? [];
const stripLabel = (text: string) => text.replace(/^(?:\([A-Z][A-Z ]{0,39}\)|[A-Z][A-Z ]{0,39}:)\s*/, '');
function neutralLabel(index: number): string {
  let suffix = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) suffix = String.fromCharCode(65 + (n - 1) % 26) + suffix;
  return `SPEAKER ${suffix}`;
}

export function alignDialogueSpeakers(records: SubtitleRecord[], position: ViewingPosition, source: DialogueTrack): SpeakerAlignment[] {
  if (source.tmdbId !== position.tmdbId || source.mediaType !== position.mediaType ||
      (position.mediaType === 'tv' ? source.season !== position.seasonNumber || source.episode !== position.episodeNumber :
        source.season !== null || source.episode !== null)) return [];
  const counts = new Map<string, number>();
  for (const row of records) counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
  const cues: { recordId: string; cue: Cue; words: string[] }[] = [];
  for (const row of records) {
    if (counts.get(row.id) !== 1 || row.season_number !== source.season || row.episode_number !== source.episode) continue;
    // The cutoff precedes matching. A later cue cannot disambiguate an earlier
    // speaker after a rewind, even if both belong to the same sentence.
    for (const cue of permittedCues(row, position)) cues.push({ recordId: row.id, cue, words: words(stripLabel(cue.text)) });
  }
  cues.sort((a, b) => a.cue.start - b.cue.start || a.cue.end - b.cue.end);
  const turns = source.turns.map((turn, index) => ({ ...turn, index, words: words(turn.text) }));
  const labels = new Set(source.turns.map(turn => turn.speaker.toUpperCase()));
  const starts = new Map<string, { turn: typeof turns[number]; offset: number }[]>();
  for (const turn of turns) for (let offset = 0; offset < turn.words.length; offset++) {
    const word = turn.words[offset];
    const list = starts.get(word) ?? [];
    list.push({ turn, offset }); starts.set(word, list);
  }
  const candidates = cues.map(() => new Map<string, Set<number>>());
  for (let first = 0; first < cues.length; first++) {
    const sequence: string[] = [];
    for (let last = first; last < Math.min(first + 4, cues.length); last++) {
      if (last > first && (cues[last].cue.start < cues[last - 1].cue.end || cues[last].cue.start - cues[last - 1].cue.end > 2)) break;
      sequence.push(...cues[last].words);
      if (sequence.length > 120) break;
      if (sequence.length < (first === last ? 4 : 8)) continue;
      // Require a complete exact token span within ONE dialogue turn. Never
      // alternate speakers by proximity or align across a script turn break.
      const matches = (starts.get(sequence[0]) ?? []).filter(({ turn, offset }) =>
        sequence.every((word, index) => turn.words[offset + index] === word));
      if (!matches.length) continue;
      const groups = new Set(matches.map(({ turn }) => JSON.stringify([turn.scene, turn.speaker])));
      // Repeated lines spoken by different people/scenes remain unknown.
      if (groups.size !== 1) continue;
      const group = [...groups][0];
      const speaker = matches[0].turn.speaker.toUpperCase();
      if (cues.slice(first, last + 1).some(({ cue }) => {
        const label = cue.text.match(/^(?:\(([A-Z][A-Z ]{0,39})\)|([A-Z][A-Z ]{0,39}):)/);
        const actual = label?.[1] ?? label?.[2];
        return actual && labels.has(actual) && actual !== speaker;
      })) continue;
      for (let index = first; index <= last; index++) {
        const matchTurns = candidates[index].get(group) ?? new Set<number>();
        matches.forEach(({ turn }) => matchTurns.add(turn.index));
        candidates[index].set(group, matchTurns);
      }
    }
  }
  // IDs are local to a scene and this request. Never expose script character
  // names or connect a disguised caller to a person in another scene. Even a
  // successful match copies no script prose, stage direction or future fact.
  const aliases = new Map<string, string>();
  return cues.flatMap(({ recordId, cue }, index) => {
    if (candidates[index].size !== 1) return [];
    const [group, sourceTurns] = [...candidates[index]][0];
    if (!aliases.has(group)) aliases.set(group, neutralLabel(aliases.size));
    return [{ recordId, start: cue.start, end: cue.end, text: cue.text,
      label: aliases.get(group)!, sourceTurns: [...sourceTurns].sort((a, b) => a - b) }];
  });
}
