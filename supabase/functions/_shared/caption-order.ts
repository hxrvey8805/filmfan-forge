import { paragraphSources } from './paragraph-sources.ts';
import type { Evidence } from './companion.ts';
import type { dialogueEvidence } from './dialogue-evidence.ts';

// An anonymous sound cue establishes when the sound occurs. Its position alone
// cannot establish which character made it, or why.
export function captionOrder(
  question: string,
  passages: ReturnType<typeof dialogueEvidence>,
  permitted: Evidence[],
) {
  const clauses = question.toLowerCase().split(/\b(before|after)\b/);
  if (clauses.length !== 3) return null;
  const stem = (s: string) => s.toLowerCase().replace(/(?:ing|ed|s)$/, '');
  const terms = (s: string) => new Set((s.match(/[\p{L}]+/gu) ?? []).map(stem));
  const soundWords = terms(clauses[0]);
  const anchor = [...terms(clauses[2])].filter((t) =>
    t.length >= 4 &&
    !['being', 'ask', 'say', 'tell', 'speaker', 'they', 'them', 'there', 'this', 'that', 'then', 'character']
      .includes(t)
  ).at(-1);
  if (!anchor) return null;
  const matches = passages.flatMap((p) =>
    p.lines.flatMap((line, i) => {
      const cue = /^\[([a-z]+)\]$/i.exec(line.text);
      if (!cue || !soundWords.has(stem(cue[1]))) return [];
      const nearby = p.lines.flatMap((other, j) =>
        j !== i && Math.abs(i - j) <= 3 && terms(other.text).has(anchor) ? [j] : []
      );
      if (nearby.length !== 1) return [];
      const j = nearby[0];
      if ((clauses[1] === 'before') === (i < j)) return [];
      return [p.lines.slice(Math.min(i, j), Math.max(i, j) + 1)];
    })
  );
  if (matches.length !== 1) return null;
  const lines = matches[0];
  return {
    answer: 'The order is reversed. First comes “' + lines[0].text + '” Then comes “' + lines.at(-1)!.text +
      '” The sound cue gives the timing, but it doesn’t identify who made the sound or why.',
    limited: true as const,
    evidence: paragraphSources(permitted, [lines.map((line) => line.id)]),
  };
}
