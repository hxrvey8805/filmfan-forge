import { type Evidence, evidenceLabel, type ViewingPosition } from './companion.ts';
import type { JsonGenerator } from './answer.ts';
import { discussScene } from './scene-discussion.ts';
import { verificationEvidence } from './verification.ts';
import { coversRecap } from './question-focus.ts';

export async function prefixRecap(
  question: string,
  p: ViewingPosition,
  evidence: Evidence[],
  generate: JsonGenerator,
) {
  const packets = verificationEvidence(evidence);
  const sources = packets.map((packet, i) => ({
    id: 'R' + (i + 1),
    text: packet.lines.map((l) => l.text).join('\n'),
    end: evidence[i].end,
  }));
  const result = await discussScene(
    { mode: 'recap', question, seconds: p.seconds, sources, earlierQuestions: [] },
    generate,
  );
  if (!result) return null;
  const norm = (text: string) =>
    text.normalize('NFKC').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  const sourcesById = new Map(sources.map((s, i) => [s.id, i]));
  const proof = new Map<number, { paragraph: number; lineIds: string[] }[]>();
  const claims: { text: string; evidenceIds: string[] }[] = [];
  for (const [i, point] of result.points.entries()) {
    const referenced = [...new Set(point.support.map((s) => sourcesById.get(s.id)!))].sort((a, b) => a - b);
    if (!referenced.length) return null;
    for (const n of referenced) {
      const quotes = point.support.filter((s) => sourcesById.get(s.id) === n).map((s) => norm(s.quote));
      const lines = packets[n].lines;
      // Attach only the line(s) containing the cited phrase, including a quote crossing cue boundaries.
      const joined = lines.map((l) => norm(l.text)).join(' ');
      const ids = new Set<string>();
      for (const q of quotes) {
        const start = joined.indexOf(q);
        if (start < 0 || joined.indexOf(q, start + 1) !== -1) return null;
        let offset = 0;
        for (const line of lines) {
          const end = offset + norm(line.text).length;
          if (offset < start + q.length && end > start) ids.add(line.id);
          offset = end + 1;
        }
      }
      const list = proof.get(n) ?? [];
      list.push({ paragraph: i + 1, lineIds: [...ids] });
      proof.set(n, list);
    }
    const last = evidence[referenced.at(-1)!].id;
    if (claims.at(-1)?.evidenceIds[0] !== last) claims.push({ text: point.text, evidenceIds: [last] });
  }
  if (!coversRecap(question, claims, evidence)) return null;
  return {
    answer: result.answer,
    evidence: [...proof].map(([n, citations]) => ({
      id: evidence[n].id,
      label: evidenceLabel(evidence[n]),
      season: evidence[n].season,
      episode: evidence[n].episode,
      start: evidence[n].start,
      end: evidence[n].end,
      citations,
    })),
    ...(result.limited ? { limited: true as const } : {}),
  };
}
