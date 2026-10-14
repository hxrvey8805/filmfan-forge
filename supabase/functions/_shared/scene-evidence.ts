import { conversationMemory, permittedCues, questionIntent,
  type Conversation, type Cue, type Evidence, type SubtitleRecord, type ViewingPosition } from './companion.ts';

const stopWords = new Set(('a an the and or of to in on at by for with about from up until so far what whats is are was were ' +
  'has have had do does did be being been can could would should me my we us you your i it its this that these those ' +
  'he she they his her their him them why how who whom when where tell explain describe please know happening happened ' +
  'point moment scene episode movie film show story recap summary summarize summarise main just here now').split(' '));
const terms = (value: string) => [...new Set(value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .match(/[a-z0-9]+/g) ?? [])].filter(word => word.length > 2 && !stopWords.has(word));

export function retrievalTerms(question: string, history: Conversation[], position: ViewingPosition): string[] {
  const references = /\b(he|she|him|her|his|they|them|their|that|it)\b/i.test(question)
    ? conversationMemory(history, position).slice(-2).map(row => row.question).join(' ') : '';
  return [...new Set([...terms(question), ...terms(references)])].slice(0, 20);
}

export function subtitleSearchText(question: string, history: Conversation[], position: ViewingPosition): string {
  // websearch_to_tsquery ANDs a natural-language question, often matching nothing.
  // OR only its meaningful terms; the application ranks the clipped results again.
  return retrievalTerms(question, history, position).map(term => `"${term}"`).join(' OR ');
}

function packets(records: SubtitleRecord[], position: ViewingPosition): Evidence[] {
  const result: Evidence[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    const cues = permittedCues(record, position);
    let group: Cue[] = [];
    let chars = 0;
    const flush = () => {
      if (!group.length) return;
      result.push({ id: `${record.id}:${Math.round(group[0].start * 1000)}`,
        season: record.season_number, episode: record.episode_number,
        start: group[0].start, end: Math.max(...group.map(cue => cue.end)),
        // Small, contiguous dialogue passages retain turn order and sound cues.
        // Their exact start/end are metadata; repeated per-line clocks waste tokens.
        text: group.map(cue => cue.text).join('\n') });
      group = []; chars = 0;
    };
    for (const cue of cues) {
      if (group.length && (cue.start - group[0].start > 40 ||
          cue.start - group[group.length - 1].end > 12 || chars + cue.text.length > 850)) flush();
      group.push(cue); chars += cue.text.length;
    }
    flush();
  }
  return result.sort(chronological);
}

const chronological = (a: Evidence, b: Evidence) => (a.season ?? 0) - (b.season ?? 0) ||
  (a.episode ?? 0) - (b.episode ?? 0) || a.start - b.start;
const current = (item: Evidence, position: ViewingPosition) => position.mediaType === 'movie' ||
  (item.season === position.seasonNumber && item.episode === position.episodeNumber);

export function nearbyEvidence(evidence: Evidence[], position: ViewingPosition): Evidence[] {
  return evidence.filter(item => current(item, position) && item.end >= position.seconds - 120);
}

export function selectSceneEvidence(records: SubtitleRecord[], position: ViewingPosition,
  question: string, history: Conversation[] = [], maxChars = 8500): Evidence[] {
  const all = packets(records, position);
  if (!all.length) return [];
  const intent = questionIntent(question);
  const local = nearbyEvidence(all, position).sort((a, b) => b.end - a.end);
  // Old dialogue cannot establish what a silent, much later scene is showing.
  if (intent === 'scene' && !local.length) return [];
  const query = retrievalTerms(question, history, position);
  const words = all.map(item => terms(item.text));
  const frequency = new Map(query.map(term => [term, words.filter(row => row.includes(term)).length]));
  const scored = all.map((item, index) => ({ item, score: query.reduce((sum, term) =>
    sum + (words[index].includes(term) ? Math.log(1 + all.length / (1 + (frequency.get(term) ?? 0))) : 0), 0) }));
  const relevant = scored.filter(row => row.score > 0).sort((a, b) => b.score - a.score || chronological(a.item, b.item)).map(row => row.item);
  const prefix = all.filter(item => current(item, position));
  const overview = prefix.length <= 14 ? prefix : Array.from({ length: 14 }, (_, i) =>
    prefix[Math.round(i * (prefix.length - 1) / 13)]);
  const sources = intent === 'scene' ? [local, relevant, prefix.slice(0, 2)] :
    intent === 'recap' ? [overview, relevant, local] : [relevant, local, overview];
  const selected: Evidence[] = [];
  const used = new Set<string>();
  let size = 2;
  for (let i = 0; i < Math.max(...sources.map(rows => rows.length)); i++) {
    for (const rows of sources) {
      const item = rows[i];
      if (!item || used.has(item.id)) continue;
      const cost = JSON.stringify(item).length + (selected.length ? 1 : 0);
      if (size + cost > maxChars) continue;
      used.add(item.id); selected.push(item); size += cost;
    }
  }
  return selected.sort(chronological);
}
