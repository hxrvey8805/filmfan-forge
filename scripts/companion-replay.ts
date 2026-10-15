// Replay an exported, permitted subtitle prefix without saving or charging a conversation.
// deno run --allow-read --allow-write scripts/companion-replay.ts input.json output.json
// Add --live and --allow-env=OPENROUTER_API_KEY --allow-net=openrouter.ai for private evaluation.
// This uses the same OpenRouter adapter as the companion; it never writes conversations.
// Keep exports and outputs outside Git: they can contain dialogue and private conversations.
import { buildPrompts, unavailableMemoryReply, type Conversation, type SubtitleRecord, type ViewingPosition } from '../supabase/functions/_shared/companion.ts';
import { selectSceneContext, OPENROUTER_EVIDENCE_BUDGET } from '../supabase/functions/_shared/scene-evidence.ts';
import { checkedAnswer, type AnswerDiagnostics } from '../supabase/functions/_shared/answer.ts';
import { OPENROUTER_MODEL, openRouterGenerator } from '../supabase/functions/_shared/openrouter.ts';

const [inputPath, outputPath, mode] = Deno.args;
if (!inputPath || !outputPath || (mode && mode !== '--live')) {
  throw new Error('Usage: companion-replay.ts input.json output.json [--live]');
}
if (inputPath === outputPath) throw new Error('Use a separate output file to preserve the source export.');
const input = JSON.parse(await Deno.readTextFile(inputPath)) as {
  question: string; position: ViewingPosition; records: SubtitleRecord[]; history?: Conversation[];
};
const history = input.history ?? [];
const memoryReply = unavailableMemoryReply(input.question, input.position, history);
const { evidence, coverage } = selectSceneContext(input.records, input.position, input.question, history, OPENROUTER_EVIDENCE_BUDGET);
const prompts = buildPrompts(input.question, input.position, evidence, history, coverage);
const checks: AnswerDiagnostics[] = [];
const generations: { phase: string; response: unknown }[] = [];
const requests: { phase: string; system: string; user: string; maxTokens: number }[] = [];
const usage: unknown[] = [];
const requestConfigs: unknown[] = [];
const providerFailures: { status: number; code: string | null }[] = [];
const completions: { status: number; finishReason: string | null; hasError: boolean;
  parsed: boolean; elapsedMs: number; contentType: string | null; aborted: boolean }[] = [];
let error: string | null = null;
let result = null;
if (mode === '--live' && memoryReply) {
  // This production guard must work without credentials or network access.
  result = await checkedAnswer(input.question, input.position, evidence, history,
    async () => { throw new Error('Unavailable memory must not call the AI.'); }, event => checks.push(event), coverage);
} else if (mode === '--live') {
  const key = Deno.env.get('OPENROUTER_API_KEY');
  if (!key) throw new Error('Set OPENROUTER_API_KEY privately before a live replay.');
  const generate = openRouterGenerator(key, async (url, options) => {
    const body = JSON.parse(options && 'body' in options && typeof options.body === 'string' ? options.body : '{}');
    requestConfigs.push({ model: body.model, reasoningEnabled: body.reasoning?.enabled,
      excludesReasoning: body.reasoning?.exclude, maxTokens: body.max_tokens,
      provider: body.provider, plugins: body.plugins });
    const started = Date.now();
    const response = await fetch(url, options);
    if (response.ok) {
      const body = await response.clone().json().catch(() => null);
      usage.push(body?.usage ?? null);
      const finishReason = body?.choices?.[0]?.finish_reason;
      completions.push({ status: response.status,
        finishReason: typeof finishReason === 'string' && /^[a-z_]{1,40}$/.test(finishReason) ? finishReason : null,
        hasError: Boolean(body?.error || body?.choices?.[0]?.error), parsed: body !== null,
        elapsedMs: Date.now() - started, contentType: response.headers.get('content-type'),
        aborted: Boolean(options && 'signal' in options && options.signal?.aborted) });
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
    }, event => checks.push(event), coverage);
  } catch (failure) {
    error = failure instanceof Error ? failure.message : 'Replay failed';
  }
}
await Deno.writeTextFile(outputPath, JSON.stringify({
  mode: mode === '--live' ? (memoryReply ? 'memory-guard-replay' : 'live-model-replay') : 'retrieval-only', model: OPENROUTER_MODEL,
  note: 'Reconstructed from the input export, not a captured historical request. Missing history or retrieved records are not recreated.',
  question: input.question, position: input.position, evidence, coverage, memoryReply, prompts, checks, requests, requestConfigs,
  generations, usage, providerFailures, completions, error, result,
}, null, 2));
console.log(JSON.stringify({ mode: mode ?? 'retrieval-only', passages: evidence.length,
  evidenceChars: JSON.stringify(evidence).length, checks, providerFailures, error, outputPath }));
if (error) Deno.exit(1);
