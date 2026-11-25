import { databaseSolBudget, type BudgetRpc, type SolBudget } from './sol-budget.ts';
import {parallelBudget} from './parallel-budget.ts';

export class QuestionAllowanceError extends Error {
  constructor(public code: string, public status = 409) {
    super({
      questions_exhausted: 'You have no questions available. You can add a question pack or join Pro.',
      question_busy: 'Geek is already working on a question. Please wait for that answer.',
      question_request_closed: 'That request has ended. Please send your question again.',
      request_mismatch: 'This request belongs to a different question or watching point.',
      question_budget_unavailable: 'Geek is temporarily unavailable. No question has been used.',
    }[code] ?? 'Your question allowance could not be checked. Please try again.');
  }
}

// This gate surrounds the evaluated pipeline; it never changes prompts,
// evidence, model settings or the independent spoiler/factual review.
export async function beginQuestionAllowance(rpc: BudgetRpc, userId: string, requestId: string,
  scope: Record<string, unknown>, provider: string | undefined, parallelCalls=false) {
  const attempt = crypto.randomUUID();
  const result = await rpc('begin_companion_question', {
    p_user_id: userId, p_request_id: requestId, p_attempt: attempt, p_scope: scope,
  });
  if (result.error) throw new QuestionAllowanceError('allowance_unavailable', 503);
  const data = result.data as { mode?: string; error?: string } | null;
  if (data?.error) throw new QuestionAllowanceError(data.error,
    data.error === 'questions_exhausted' ? 402 : data.error === 'question_budget_unavailable' ? 503 : 409);
  if (!data || !['monthly', 'beta'].includes(data.mode ?? '')) throw new QuestionAllowanceError('allowance_unavailable', 503);
  const active = data.mode === 'monthly';
  let done = false;
  let blocked = false;
  const end = async (pause: boolean) => {
    if (!active || done) return;
    const ended = await rpc('end_companion_question_attempt', {
      p_user_id: userId, p_request_id: requestId, p_attempt: attempt, p_pause: pause && !blocked,
    });
    if (ended.error || ended.data !== true) throw new QuestionAllowanceError('allowance_unavailable', 503);
    done = true;
    if (pause && blocked) throw new QuestionAllowanceError('question_budget_unavailable', 503);
  };
  if (active && provider?.trim() !== 'openrouter-sol') {
    await end(false);
    throw new QuestionAllowanceError('question_budget_unavailable', 503);
  }
  const legacy = databaseSolBudget(rpc, userId, requestId);
  const budget: SolBudget = !active ? legacy : parallelCalls ? parallelBudget(rpc,
    {p_user_id:userId,p_request_id:requestId,p_attempt:attempt},legacy.settle,()=>{blocked=true;}) : {
    async reserve(callId, microUsd) {
      const held = await rpc('reserve_companion_question_call', {
        p_call_id: callId, p_user_id: userId, p_request_id: requestId, p_attempt: attempt, p_micro_usd: microUsd,
      });
      if (held.error || held.data !== true) blocked = true;
      if (held.error) throw new QuestionAllowanceError('question_budget_unavailable', 503);
      return held.data === true;
    },
    settle: legacy.settle,
  };
  return {
    active, attempt, budget, end,
    get budgetBlocked() { return blocked; },
    async finish(conversation: Record<string, unknown>, charge: boolean) {
      if (blocked) throw new QuestionAllowanceError('question_budget_unavailable', 503);
      const saved = await rpc(active ? 'finish_companion_question' : 'record_companion_answer', {
        p_user_id: userId, p_conversation: conversation, p_charge: charge,
        ...(active ? { p_attempt: attempt } : {}),
      });
      if (!saved.error) done = true;
      return saved;
    },
  };
}
