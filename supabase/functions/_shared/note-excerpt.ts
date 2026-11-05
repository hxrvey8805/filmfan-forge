// A reviewed window can contain a useful line that the editorial summary
// doesn't repeat. Only expose short, consecutive, edition-checked cues.
import { isSubtitleCredit, retrievalTerms } from "./scene-evidence.ts";
import type { ViewingPosition } from "./companion.ts";
const generic = new Set(
  "speaker listener character viewers first person other mention refers makes keep keeps tell asking asks says say believe think question thinks reason suddenly despite everyone someone before after"
    .split(" "),
);
const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? []);
export function noteExcerpt(
  question: string,
  position: ViewingPosition,
  summary: string,
  cues: string[],
) {
  const terms = retrievalTerms(question, [], position).filter((t) =>
    !generic.has(t)
  );
  const topic = words(summary), rare = terms.filter((t) => !topic.has(t));
  if (!rare.length) return null;
  const scored = cues.map((line, i) => {
    const tokens = words(line);
    const fresh = rare.filter((t) => tokens.has(t));
    return {
      i,
      score: fresh.length
        ? fresh.length * 2 + terms.filter((t) => tokens.has(t)).length
        : 0,
    };
  }).sort((a, b) => b.score - a.score || a.i - b.i);
  const best = scored[0];
  if (!best?.score || isSubtitleCredit(cues[best.i])) return null;
  let from = best.i, to = best.i;
  const size = (a: number, b: number) =>
    cues.slice(a, b + 1).join(" ").split(/\s+/).length;
  if (size(from, to) > 42) return null;
  if (
    from > 0 && !isSubtitleCredit(cues[from - 1]) && size(from - 1, to) <= 42
  ) from--;
  if (
    to + 1 < cues.length && !isSubtitleCredit(cues[to + 1]) &&
    size(from, to + 1) <= 42
  ) to++;
  return {
    text: cues.slice(from, to + 1).join(" "),
    ids: cues.slice(from, to + 1).map((_, i) => "C" + (from + i + 1)),
  };
}
