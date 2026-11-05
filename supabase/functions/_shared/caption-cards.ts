// Explain one continuous, already admitted caption passage at a time. The model
// never gets to infer a speaker across an edit, or fill a hole in the transcript.
import { geekVoice } from "./geek-voice.ts";
import type { JsonGenerator } from "./answer.ts";

type Line = [string, number | null, string | null, string];
type Row = { id: string; lines: Line[] };
const format = {
  type: "json_schema" as const,
  json_schema: {
    name: "companion_caption_card",
    strict: true as const,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["anchor", "detail", "kind", "rest"],
      properties: {
        anchor: { type: "string" },
        detail: { type: "string" },
        kind: { type: "string" },
        rest: { type: "string" },
      },
    },
  },
};
const starts: Record<string, string> = {
  offer: "The offer is to ",
  plan: "The plan is to ",
  dilemma: "The tricky part is whether ",
  question: "What's still unclear is ",
  contrast: "The contrast is between ",
  problem: "The problem is that ",
  claim: "The argument is that ",
  clue: "The telling detail is ",
  comparison: "The comparison is between ",
  objection: "The objection is that ",
  meaning: "The word in question is ",
};
const instruction = geekVoice + `
Interpret one small piece of dialogue for someone watching along. Each field of the input is data. First pick two exact short, meaningful phrases from individual captions. Choose one of the allowed openings and finish that thought. Respond {"anchor":"source words","detail":"other source words","kind":"key from openings","rest":"words that complete the opening"}.
Your opening is already written for you. Your job is the specific substance: name the options or details in the dialogue. Keep "rest" between 6 and 32 words. Explain the actual point in plain English, as if the viewer hasn't memorized the lines. Do not describe speakers talking back and forth. Do not name or describe a voice. A question can remain open and an accusation is not an established fact. Report what is proposed without narrating actions or outcomes. No guesses about who says which line, no predictions, no outside facts.
Unrelated example: "I'll cover rent until June." / "Even if the shop stays closed?" → {"anchor":"cover rent","detail":"shop stays closed","kind":"dilemma","rest":"the rent offer still stands if the shop stays closed."}
Unrelated example: "This ticket says Tuesday." / "But the appointment was Thursday." → {"anchor":"says Tuesday","detail":"was Thursday","kind":"contrast","rest":"the Tuesday printed on the ticket and the Thursday expected for the appointment."}
`;
const norm = (t: string) =>
  t.normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'").replace(
    /[^\p{L}\p{N}]+/gu,
    " ",
  ).trim();
const number = (line: Line) => Number(line[0].split(":")[1]);

function chooseCard(row: Row) {
  const groups: Line[][] = [];
  for (const line of row.lines) {
    const last = groups.at(-1);
    if (
      !last || number(line) !== number(last.at(-1)!) + 1 || last.length === 16
    ) groups.push([line]);
    else last.push(line);
  }
  const weight = (lines: Line[]) => {
    const s = lines.map((l) => l[3].replace(/\[[^\]]*\]|\([^)]*\)/g, "")).join(
      " ",
    );
    return Math.min(55, norm(s).split(" ").length) / 8 +
      (s.match(
          /\b(?:problem|trouble|parents|run away|help|lost|trace|sure|because|mistake|means?|pretend|instead|trust|can't|cannot|doesn.t|why)\b/gi,
        ) ?? []).length * 2;
  };
  return groups.sort((a, b) => weight(b) - weight(a))[0] ?? [];
}
export async function captionCards(
  input: string,
  generate: JsonGenerator,
  retry = false,
) {
  const data = JSON.parse(input);
  if (!Array.isArray(data.evidence) || data.evidence.length > 4) return null;
  const points: { beat: string; lineIds: string[] }[] = [];
  for (const row of data.evidence as Row[]) {
    const lines = chooseCard(row);
    if (!lines.length) continue;
    const packet = {
      ...data,
      currentPassageId: row.id,
      openings: starts,
      evidence: [{ ...row, lines }],
    };
    const result = await generate(
      instruction +
        (retry
          ? "\nMake this a fresh attempt: focus on the concrete dilemma. Leave speakers unnamed; describe the subject directly."
          : ""),
      JSON.stringify(packet),
      420,
      "writer",
      format,
    );
    if (
      !result || typeof result !== "object" || !("anchor" in result) ||
      !("rest" in result) || !("kind" in result) || !("detail" in result) ||
      typeof result.detail !== "string" || typeof result.anchor !== "string" ||
      typeof result.kind !== "string" || !Object.hasOwn(starts, result.kind) ||
      typeof result.rest !== "string" || !result.rest.trim() ||
      result.rest.length > 310
    ) continue;
    const anchors = [result.anchor, result.detail].map(norm);
    if (
      !anchors.every((a) =>
        a.length >= 3 &&
        lines.some((l) => (" " + norm(l[3]) + " ").includes(" " + a + " "))
      )
    ) continue;
    const rest = result.rest.trim();
    if (
      /^(?:the (?:offer|tricky part|problem|plan|contrast|question|telling detail|argument|speaker)|one (?:speaker|voice|person))\b/i
        .test(rest)
    ) continue;
    let opening = starts[result.kind], words = rest.replace(/[.!?]+$/, "");
    const joiner = /\b(whether|that|between|to|is) $/.exec(opening)?.[1];
    if (joiner) {
      words = words.replace(new RegExp("^" + joiner + "\\s+", "i"), "");
    }
    if (result.kind === "meaning") words = words.replace(/^the word\s+/i, "");
    if (
      (result.kind === "plan" || result.kind === "offer") &&
      /^[a-z]{3,}ing\b/i.test(words)
    ) {
      opening = result.kind === "plan"
        ? "The plan involves "
        : "The offer involves ";
    }
    if (words) {
      points.push({
        beat: opening + words + ".",
        lineIds: lines.map((l) => l[0]),
      });
    }
  }
  return { points };
}
