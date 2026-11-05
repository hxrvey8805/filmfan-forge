// Internal wire format only. Eligibility and publication checks use the full,
// original evidence; never trim caption text to make a provider request fit.
export function storyWire(input: string): string {
  let data;
  try {
    data = JSON.parse(input);
  } catch {
    return input;
  }
  if (!data || !Array.isArray(data.evidence)) return input;
  const evidence = data.evidence.map((
    row: {
      id: string;
      season: number | null;
      episode: number | null;
      start: number;
      end: number;
      lines: { id: string; text: string; atSeconds?: number; explicitSpeaker?: string }[];
    },
  ) => ({
    id: row.id,
    season: row.season,
    episode: row.episode,
    start: row.start,
    end: row.end,
    // A tuple avoids hundreds of repeated property names. JSON-encoding each
    // tuple keeps even malicious caption text inside the data boundary.
    lines: row.lines.map((line) => [line.id, line.atSeconds ?? null, line.explicitSpeaker ?? null, line.text]),
  }));
  return JSON.stringify({
    ...data,
    lineFormat: ['id', 'startSecond', 'explicitSpeakerOrNull', 'originalWords'],
    evidence,
  });
}

const stems: Record<string, string> = {
  statement: 'The discussion concerns ',
  question: 'A speaker asks ',
  proposal: 'A speaker proposes ',
  denial: 'A speaker denies ',
  uncertain: 'A speaker suggests it might be ',
};
// Expand the provider's bounded range against the writer's actual source
// (never against a larger context that might contain additional passages).
export function unpackExchangeDraft(raw: unknown, input: string): unknown {
  if (!raw || typeof raw !== 'object' || !('facts' in raw) || !Array.isArray(raw.facts) || raw.facts.length > 8) {
    return null;
  }
  let data;
  try {
    data = JSON.parse(input);
  } catch {
    return null;
  }
  if (!Array.isArray(data?.evidence)) return null;
  const windows = new Map(dialogueWindows(data.evidence).map((w) => [w.id, w]));
  const facts = raw.facts.map((fact) => {
    if (
      !fact || typeof fact !== 'object' || typeof fact.state !== 'string' || !Object.hasOwn(stems, fact.state) ||
      typeof fact.clause !== 'string' || !fact.clause.trim() ||
      fact.clause.length > 250 || /[\r\n]/.test(fact.clause)
    ) return null;
    const window = windows.get(fact.window);
    if (!window || fact.from !== undefined || fact.through !== undefined) return null;
    for (const row of data.evidence) {
      const start = row.lines.findIndex((line: { id: string }) => line.id === window.first);
      const end = row.lines.findIndex((line: { id: string }) => line.id === window.last);
      if (start < 0 || end < start || end - start >= 12) continue;
      const clause = fact.clause.trim().replace(/[.!?]+$/, '');
      // Some endpoints return a complete neutral report in the clause field.
      // Preserve it for the same checks, rather than repeating its attribution.
      const complete = /^(?:A speaker|Someone|The (?:speaker|discussion|conversation|question|exchange))\b/i.test(
        clause,
      );
      return {
        state: fact.state,
        text: (complete ? clause : stems[fact.state] + clause) + '.',
        sources: row.lines.slice(start, end + 1).map((line: { id: string }) => line.id),
      };
    }
    return null;
  });
  // Preserve indexes so preparation drops readings depending on invalid facts.
  return { ...raw, facts };
}

type WireLine = { id: string; text: string; atSeconds?: number; explicitSpeaker?: string };
type WireRow = { id: string; start: number; end: number; lines: WireLine[] };
type Exchange = { id: string; passage: string; first: string; last: string; at: number; text: string };
export function dialogueWindows(rows: WireRow[]) {
  const out: Exchange[] = [];
  for (const row of rows) {
    let start = 0;
    while (start < row.lines.length) {
      let words = 0, stop = start, complete = -1;
      while (stop < row.lines.length && stop - start < 12) {
        const line = row.lines[stop];
        words += line.text.split(/\s+/).length;
        if (/[.!?][”"'’)]*$/.test(line.text.trim()) || /^\[[^\]]+\]$/.test(line.text.trim())) complete = stop;
        stop++;
        if (complete >= start && (words >= 34 || stop - start >= 9)) break;
      }
      if (complete < start) {
        // Never use half of a long sentence as proof. The complete permitted
        // text remains available to the independent verifier.
        while (stop < row.lines.length && !/[.!?][”"'’)]*$/.test(row.lines[stop - 1].text.trim())) stop++;
        start = stop;
        continue;
      }
      const last = complete;
      const lines = row.lines.slice(start, last + 1);
      out.push({
        id: 'E' + (out.length + 1),
        passage: row.id,
        first: lines[0].id,
        last: lines.at(-1)!.id,
        at: lines[0].atSeconds ?? row.start,
        text: lines.map((l) => l.text).join('\n'),
      });
      start = last + 1;
    }
  }
  return out;
}
export function exchangeWire(input: string): string {
  let data;
  try {
    data = JSON.parse(input);
  } catch {
    return input;
  }
  if (!Array.isArray(data?.evidence)) return input;
  const { evidence, ...context } = data;
  return JSON.stringify({
    ...context,
    exchanges: dialogueWindows(evidence).map(({ id, passage, at, text }) => ({ id, passage, at, text })),
  });
}
