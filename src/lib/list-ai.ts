import { listRequest, parseListInterpretation, type ListInterpretation } from "../../supabase/functions/_shared/list-interpretation";
export type { ListInterpretation } from "../../supabase/functions/_shared/list-interpretation";

const messages: Record<string, string> = {
  sign_in: "Sign in to let Geek interpret your list.",
  limited: "The free list helper has reached its limit for today. You can still use a clear matching rule or pick titles.",
  busy: "Give Geek a moment before trying another description.",
  provider_busy: "The free AI is busy. Try later, or use a clear matching rule.",
  invalid_response: "Geek couldn’t turn that into a reliable rule. Try describing it more clearly.",
  invalid_request: "Describe your list in 2–160 characters.",
  unavailable: "Geek’s list helper isn’t available right now. Your existing lists still work.",
};

/** Explicit editor action only. The saved rule and server cache avoid repeated AI calls. */
export async function interpretListWithAI(request: string, viewer: string, signal: AbortSignal): Promise<ListInterpretation> {
  const normalized = listRequest(request);
  if (!normalized) throw Error(messages.invalid_request);
  const { supabase } = await import("@/integrations/supabase/client");
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || session.user.id !== viewer) throw Error(messages.sign_in);
  const { data, error } = await supabase.functions.invoke("interpret-smart-list", { body: { request: normalized }, signal });
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  if (error) {
    const details = error.context instanceof Response ? await error.context.json().catch(() => null) : null;
    throw Error(messages[details?.error] ?? messages.unavailable);
  }
  const result = parseListInterpretation(data?.interpretation);
  if (!result) throw Error(messages.invalid_response);
  return result;
}
