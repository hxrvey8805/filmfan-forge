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
const generations: { phase: string; response: unknown }[] = [];
const requests: { phase: string; system: string; user: string; maxTokens: number }[] = [];
const usage: unknown[] = [];
const requestConfigs: unknown[] = [];
const providerFailures: { status: number; code: string | null }[] = [];
let error: string | null = null;
let result = null;
if (mode === '--live') {
  const key = Deno.env.get('GROQ_API_KEY');
  if (!key) throw new Error('Set the existing GROQ_API_KEY in your environment before a live replay.');
  const generate = groqGenerator(key, async (url, options) => {
    const body = JSON.parse(options && 'body' in options && typeof options.body === 'string' ? options.body : '{}');
    requestConfigs.push({ model: body.model, reasoningEffort: body.reasoning_effort,
      responseFormat: body.response_format?.type, maxCompletionTokens: body.max_completion_tokens });
    const response = await fetch(url, options);
    if (response.ok) {
      const body = await response.clone().json();
      usage.push(body.usage ?? null);
    } else {
      // Keep diagnostic codes only; provider bodies may echo input or reasoning.
      const body = await response.clone().json().catch(() => null);
      const code = body?.error?.code;
      providerFailures.push({ status: response.status, code: typeof code === 'string' && /^[a-z_]{1,80}$/.test(code) ? code : null });
    }
    return response;
  });
  try {
    result = await checkedAnswer(input.question, input.position, evidence, history, async (system, user, maxTokens, purpose) => {
      const phase = purpose ?? 'unknown';
      requests.push({ phase, system, user, maxTokens });
      const response = await generate(system, user, maxTokens);
      generations.push({ phase, response });
      return response;
    }, event => checks.push(event));
  } catch (failure) {
    error = failure instanceof Error ? failure.message : 'Replay failed';
  }
}
await Deno.writeTextFile(outputPath, JSON.stringify({
  mode: mode === '--live' ? 'live-model-replay' : 'retrieval-only', model: COMPANION_MODEL,
  note: 'Reconstructed from the input export, not a captured historical request. Missing history or retrieved records are not recreated.',
  question: input.question, position: input.position, evidence, prompts, checks, requests, requestConfigs,
  generations, usage, providerFailures, error, result,
}, null, 2));
console.log(JSON.stringify({ mode: mode ?? 'retrieval-only', passages: evidence.length,
  evidenceChars: JSON.stringify(evidence).length, checks, providerFailures, error, outputPath }));
if (error) Deno.exit(1);
