export type QuestionAllowance = { mode: 'beta' | 'unavailable' } | {
  mode: 'monthly'; plan: 'free' | 'monthly' | 'annual'; included: number; limit: number;
  purchased: number; renewsAt: string | null;
};
export function readQuestionAllowance(data: unknown): QuestionAllowance {
  if (!data || typeof data !== 'object') return {mode:'unavailable'};
  const a = data as Record<string, unknown>;
  if (a.mode === 'beta') return {mode:'beta'};
  if (a.mode !== 'monthly' || !['free','monthly','annual'].includes(String(a.plan)) ||
    ![a.included,a.limit,a.purchased].every(n => Number.isSafeInteger(n) && Number(n) >= 0) ||
    a.limit !== (a.plan === 'free' ? 0 : 10) || Number(a.included) > Number(a.limit) ||
    !(a.renewsAt === null || typeof a.renewsAt === 'string' && Number.isFinite(Date.parse(a.renewsAt)))) return {mode:'unavailable'};
  return a as QuestionAllowance;
}
export function questionAllowanceLabel(a: QuestionAllowance): string {
  if (a.mode !== 'monthly') return 'Question allowance unavailable';
  const purchased = `${a.purchased} purchased question${a.purchased === 1 ? '' : 's'}`;
  return a.plan === 'free' ? purchased : `${a.included} of ${a.limit} left this month · ${purchased}`;
}
