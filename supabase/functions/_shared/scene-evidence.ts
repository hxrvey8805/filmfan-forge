import { conversationMemory, permittedCues, questionIntent,
  type Conversation, type Cue, type Evidence, type SubtitleRecord, type ViewingPosition } from './companion.ts';

const stopWords = new Set(('a an the and or of to in on at by for with about from up until so far what whats is are was were ' +
  'has have had do does did be being been can could would should me my we us you your i it its this that these those ' +
  'he she they his her their him them why how who whom when where tell explain describe please know happening happened ' +
  'point moment scene episode movie film show story recap summary summarize summarise main just here now right based dialogue').split(' '));
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

// Subtitle files often contain uploader credits. Remove only explicit subtitle
// production credits, never general dialogue, character labels, or sound cues.
export function isSubtitleCredit(text: string): boolean {
  return /^(?:subs|subtitles|captions)\s+(?:(?:collected|corrected|adapted|synced|synchronized|synchronised|translated|created|provided|downloaded|ripped|encoded)\b.*|by\s+\S+)/i.test(text.trim()) ||
    /^(?:sync(?:hroni[sz]ation)?|translation)\s+(?:and\s+corrections?\s+)?by\s+\S+/i.test(text.trim());
}

function packets(records: SubtitleRecord[], position: ViewingPosition): Evidence[] {
  const scopes = new Map<string, { record: SubtitleRecord; cue: Cue }[]>();
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    const key = `${record.season_number}:${record.episode_number}`;
    const rows = scopes.get(key) ?? [];
    // Clip BEFORE joining, deduplication, scoring, or continuity decisions.
    for (const cue of permittedCues(record, position)) {
      if (!isSubtitleCredit(cue.text)) rows.push({ record, cue });
    }
    scopes.set(key, rows);
  }
  const result: Evidence[] = [];
  for (const rows of scopes.values()) {
    rows.sort((a, b) => a.cue.start - b.cue.start || a.cue.end - b.cue.end || a.record.id.localeCompare(b.record.id));
    const seenCues = new Set<string>();
    let group: typeof rows = [];
    let chars = 0;
    const flush = () => {
      if (!group.length) return;
      const first = group[0];
      result.push({ id: `${first.record.id}:${Math.round(first.cue.start * 1000)}`,
        season: first.record.season_number, episode: first.record.episode_number,
        start: first.cue.start, end: Math.max(...group.map(row => row.cue.end)),
        text: group.map(row => row.cue.text).join('\n') });
      group = []; chars = 0;
    };
    for (const row of rows) {
      const { cue } = row;
      const signature = JSON.stringify(cue);
      if (seenCues.has(signature)) continue;
      seenCues.add(signature);
      const previous = group.at(-1)?.cue;
      // Storage chunks are not scene boundaries. Keep adjacent turns together,
      // including sentence continuations, but never bridge a long silent gap.
      const continuing = previous && /(?:\.\.\.|…|[,;:—-])$/.test(previous.text.trim());
      const maxDuration = continuing ? 120 : 90;
      const maxText = continuing ? 1500 : 1200;
      if (previous && (cue.start - previous.end > 12 ||
          cue.start - group[0].cue.start > maxDuration || chars + cue.text.length + 1 > maxText)) flush();
      group.push(row); chars += cue.text.length + 1;
    }
    flush();
  }
  return result.sort(chronological);
}

// Spread recap coverage over time; within each interval prefer a substantive
// exchange over a one-word acknowledgement. Every passage remains eligible in
// later rounds, so an arbitrary sample count cannot leave usable space empty.
function overviewOrder(prefix: Evidence[], maxChars: number): Evidence[] {
  if (!prefix.length) return [];
  const bins = Math.min(8, Math.max(1, Math.floor(maxChars / 2000)), prefix.length);
  const start = prefix[0].start;
  const duration = Math.max(1, prefix.at(-1)!.end - start);
  const buckets: Evidence[][] = Array.from({ length: bins }, () => []);
  for (const item of prefix) buckets[Math.min(bins - 1, Math.floor((item.start - start) / duration * bins))].push(item);
  for (const bucket of buckets) bucket.sort((a, b) => b.text.length - a.text.length || chronological(a, b));
  const ordered: Evidence[] = [];
  for (let i = 0; i < Math.max(...buckets.map(bucket => bucket.length)); i++) {
    for (const bucket of buckets) if (bucket[i]) ordered.push(bucket[i]);
  }
  return ordered;
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
  // Short prefixes should reach the model intact instead of being sampled.
  if (JSON.stringify(all).length <= maxChars) return all;
  const overview = overviewOrder(prefix, maxChars);
  const neighbours = relevant.flatMap(item => {
    const index = all.indexOf(item);
    return all.slice(Math.max(0, index - 1), index + 2).filter(other =>
      other.season === item.season && other.episode === item.episode &&
      other.start <= item.end + 12 && other.end >= item.start - 12);
  });
  // Long exchanges must not crowd out the early setup in a recap. Reserve two
  // early packets as well as the recent end, still under the same hard budget.
  const sources = intent === 'scene' ? [local, relevant, neighbours, overview] :
    intent === 'recap' ? [prefix.slice(0, 2), local.slice(0, 2), overview, relevant, local, neighbours] : [relevant, neighbours, local, overview];
  const selected: Evidence[] = [];
  const used = new Set<string>();
  let size = 2;
  for (const rows of sources) {
    for (const item of rows) {
      if (used.has(item.id)) continue;
      const cost = JSON.stringify(item).length + (selected.length ? 1 : 0);
      if (size + cost > maxChars) continue;
      used.add(item.id); selected.push(item); size += cost;
    }
  }
  return selected.sort(chronological);
}
