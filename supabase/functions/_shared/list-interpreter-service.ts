import { LIST_INTERPRETER_PROMPT, LIST_INTERPRETER_VERSION, listRequest, parseListInterpretation, type ListInterpretation } from "./list-interpretation.ts";

export class ListServiceError extends Error {
  constructor(public code: string, public status = 503) { super(code); }
}
export const LIST_MODEL = "baidu/ernie-5.5-flash-preview:free";
export function listProviderBody(request: string) {
  return {
    model: LIST_MODEL, stream: false, temperature: 0, max_tokens: 4096,
    reasoning: { enabled: true, exclude: true },
    provider: { allow_fallbacks: false, require_parameters: true, max_price: { prompt: 0, completion: 0, request: 0 } },
    // Disable workspace plugin defaults; no paid model fallbacks, tools or searches.
    plugins: ["web", "response-healing", "context-compression", "file-parser", "pareto-router", "fusion"].map(id => ({ id, enabled: false })),
    // Recursive provider schemas distorted numeric rules in saved evaluations.
    // Use JSON mode; the shared runtime validator remains strict on both ends.
    tools: [], tool_choice: "none", response_format: { type: "json_object" },
    messages: [{ role: "system", content: LIST_INTERPRETER_PROMPT },
      { role: "user", content: JSON.stringify({ list_description: request }) }],
  };
}
export async function interpretWithFreeModel(request: string, key: string, transport: typeof fetch = fetch): Promise<ListInterpretation> {
  if (!key.trim()) throw new ListServiceError("unavailable");
  let response: Response;
  try {
    response = await transport("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${key.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify(listProviderBody(request)), signal: AbortSignal.timeout(30000),
    });
  } catch { throw new ListServiceError("unavailable"); }
  if (!response.ok) {
    await response.body?.cancel();
    throw new ListServiceError(response.status === 429 ? "provider_busy" : "unavailable", response.status === 429 ? 429 : 503);
  }
  const data = await response.json().catch(() => null);
  const choice = data?.choices?.[0];
  if (data?.error || choice?.error || choice?.finish_reason !== "stop" || choice?.message?.tool_calls?.length ||
      choice?.message?.annotations?.length || typeof choice?.message?.content !== "string" || choice.message.content.length > 10000 ||
      Number(data?.usage?.cost ?? 0) > 0) throw new ListServiceError("invalid_response");
  let parsed: ListInterpretation | null = null;
  try {
    const value: unknown = JSON.parse(choice.message.content);
    // Some providers omit only the envelope. Validate the entire bare rule with
    // the same strict validator; never strip fields, extract prose or repair facts.
    parsed = parseListInterpretation(value) ?? parseListInterpretation({ kind: "suggestion", rule: value });
  } catch { /* Fail closed. */ }
  if (!parsed) throw new ListServiceError("invalid_response");
  return parsed;
}

type Reservation = { status: "reserved" | "limited" | "busy" } | { status: "cached"; result: unknown };
export type ListServiceDependencies = {
  authenticate: (token: string) => Promise<string | null>;
  reserve: (userId: string, hash: string, callId: string) => Promise<Reservation>;
  complete: (userId: string, callId: string, result: ListInterpretation) => Promise<void>;
  interpret: (request: string) => Promise<ListInterpretation>;
};
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (status: number, value: unknown) => Response.json(value, { status, headers: { ...cors, "Cache-Control": "no-store" } });

export function listInterpreterHandler(deps: ListServiceDependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST") return reply(405, { error: "method" });
    try {
      const token = /^Bearer (\S+)$/i.exec(req.headers.get("Authorization") ?? "")?.[1];
      if (!token) return reply(401, { error: "sign_in" });
      const userId = await deps.authenticate(token);
      if (!userId) return reply(401, { error: "sign_in" });
      // Bounded body even without Content-Length. No watch history or title list accepted.
      const reader = req.body?.getReader();
      if (!reader) return reply(400, { error: "invalid_request" });
      let bytes = 0; const parts: Uint8Array[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 2048) { await reader.cancel(); return reply(413, { error: "invalid_request" }); }
        parts.push(value);
      }
      const joined = new Uint8Array(bytes); let offset = 0;
      for (const part of parts) { joined.set(part, offset); offset += part.length; }
      let body: unknown;
      try { body = JSON.parse(new TextDecoder().decode(joined)); } catch { return reply(400, { error: "invalid_request" }); }
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !("request" in body)) return reply(400, { error: "invalid_request" });
      const request = listRequest(body.request);
      if (!request) return reply(400, { error: "invalid_request" });
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${LIST_INTERPRETER_VERSION}:${request}`));
      const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
      const callId = crypto.randomUUID();
      const reservation = await deps.reserve(userId, hash, callId);
      if (reservation.status === "limited" || reservation.status === "busy") return reply(429, { error: reservation.status });
      if (reservation.status === "cached") {
        const cached = parseListInterpretation(reservation.result);
        return cached ? reply(200, { interpretation: cached }) : reply(503, { error: "invalid_response" });
      }
      const result = parseListInterpretation(await deps.interpret(request));
      if (!result) return reply(503, { error: "invalid_response" });
      await deps.complete(userId, callId, result);
      return reply(200, { interpretation: result });
    } catch (error) {
      // Never log credentials, user descriptions or upstream error bodies.
      return reply(error instanceof ListServiceError ? error.status : 503,
        { error: error instanceof ListServiceError ? error.code : "unavailable" });
    }
  };
}
