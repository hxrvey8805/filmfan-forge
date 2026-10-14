// Replay an exported, permitted subtitle prefix without saving or charging a conversation.
// deno run --allow-read --allow-write scripts/companion-replay.ts input.json output.json
// Add --live and --allow-env=GROQ_API_KEY --allow-net=api.groq.com to test the current model.
// Keep exports and outputs outside Git: they can contain dialogue and private conversations.
import { buildPrompts, type Conversation, type SubtitleRecord, type ViewingPosition } from '../supabase/functions/_shared/companion.ts';
import { selectSceneEvidence } from '../supabase/functions/_shared/scene-evidence.ts';
import { checkedAnswer, type AnswerDiagnostics } from '../supabase/functions/_shared/answer.ts';
import { COMPANION_MODEL, groqGenerator } from '../supabase/functions/_shared/groq.ts';

const [inputPath, outputPath, mode] = Deno.args;
if (!inputPath || !outputPath || (mode && mode !== '--live')) {
  throw new Error('Usage: companion-replay.ts input.json output.json [--live]');
}
if (inputPath === outputPath) throw new Error('Use a separate output file to preserve the source export.');
const input = JSON.parse(await Deno.readTextFile(inputPath)) as {
  question: string; position: ViewingPosition; records: SubtitleRecord[]; history?: Conversation[];
};
const history = input.history ?? [];
const evidence = selectSceneEvidence(input.records, input.position, input.question, history);
const prompts = buildPrompts(input.question, input.position, evidence, history);
const checks: AnswerDiagnostics[] = [];
let result = null;
if (mode === '--live') {
  const key = Deno.env.get('GROQ_API_KEY');
  if (!key) throw new Error('Set the existing GROQ_API_KEY in your environment before a live replay.');
  result = await checkedAnswer(input.question, input.position, evidence, history, groqGenerator(key), event => checks.push(event));
}
await Deno.writeTextFile(outputPath, JSON.stringify({
  mode: mode === '--live' ? 'live-model-replay' : 'retrieval-only', model: COMPANION_MODEL,
  note: 'Reconstructed from the input export, not a captured historical request. Missing history or retrieved records are not recreated.',
  question: input.question, position: input.position, evidence, prompts, checks, result,
}, null, 2));
console.log(JSON.stringify({ mode: mode ?? 'retrieval-only', passages: evidence.length,
  evidenceChars: JSON.stringify(evidence).length, checks, outputPath }));
