# Companion replay and release checks

`scripts/companion-replay.ts` runs the shared retrieval, writer and checker against an exported subtitle prefix. It does not call Lovable or write production conversations. Use exports with individual cues already clipped to the intended viewing point, and keep exports, keys and results outside Git.

Input JSON contains `question`, `position`, `records` and optional `history`, using the shared companion types. Without `--live`, the script writes retrieval and the writer prompt. With `--live`, it calls the existing Groq model and saves the actual writer/checker requests, final JSON responses, token usage, safe provider error codes, and the returned answer or refusal. It never saves credentials, provider response bodies or model reasoning. Errors preserve the partial audit and exit with a nonzero status.

```sh
deno run --allow-read=/private/audit --allow-write=/private/audit \
  scripts/companion-replay.ts /private/audit/input.json /private/audit/result.json

# GROQ_API_KEY must be supplied privately; never place its value in this command.
deno run --env-file=/private/groq.env --allow-env=GROQ_API_KEY \
  --allow-net=api.groq.com --allow-read=/private/audit --allow-write=/private/audit \
  scripts/companion-replay.ts /private/audit/input.json /private/audit/result-live.json --live
```

## Current answer flow

The writer receives readable chronological passages with short request-local citation IDs. Each claim is a short, standalone statement with its own qualifications. The checker receives the entire selected evidence context, not just the passages chosen by the writer, and must check every claim individually.

Only explicitly supported claims can be returned, and only when the checker finds that those claims alone make a useful, coherent answer. The server maps their aliases back to the original citations. Incomplete, contradictory or boundary-failing verdicts are rejected outright.

An unusable draft or insufficient answer gets at most one fresh rewrite and another independent check. The rewrite uses the same permitted evidence and memory, plus fixed issue-category guidance; rejected prose and checker explanations are never fed into it. There are at most four model calls, and provider failures propagate without publishing an unchecked draft. A retry can increase latency or encounter the provider's free-tier rate limit.

Conversation memory includes only saved `answered` turns from the same permitted scope. Failed answers remain visible in chat but cannot prime the next answer. Overlong replies are omitted from prompt memory instead of being cut mid-qualification. Retrieval and generation both enforce the viewing boundary.

The model is unchanged. These code changes passed local regression, type and lint checks; no further live model evaluation was run, as requested. Historical results below do not establish the quality of this revised flow. Backend deployment is separate.

## Earlier 14 October 2026 evaluation

Direct calls used `openai/gpt-oss-120b`, with exported production dialogue and empty history. These are local model evaluations, not tests of a deployed backend or reconstructions of the complete historical requests.

| Question | Result after data repair |
| --- | --- |
| Breaking Bad S1E1, 27:13 recap | Early family message, diagnosis and ride-along dialogue now reach the writer within the 8,500-character evidence budget. The final draft still reversed who called whom and merged separate scenes; the checker rejected it. Quality remains unresolved. |
| Breaking Bad S1E2, 05:00 current scene | All 43 permitted story cues reach the writer. Baseline still declines. Experimental prompts produced a false reading of an RV exchange; a per-claim checker and higher reasoning also accepted that mistake. Those answer changes were discarded. |
| Gladiator, 15:00 Maximus/emperor relationship | Baseline produced a qualified answer without the earlier emperor identity error. Useful but limited by unlabeled dialogue; one successful sample is not a general safety guarantee. |
| The Social Network, 05:00 disagreement | No cached dialogue was available. Not tested against the model; subtitle import remains unresolved. |

## Acceptance

- Compare every returned claim with its actual permitted evidence. A model's positive verdict is not a passing manual evaluation.
- Check caller/speaker identity, plans versus completed actions, and idioms in context. Do not use invented title-specific rules to make an example pass.
- Test rewind, episode/title changes, account changes and late responses in the automated suite. Preserve the timestamp gate before ranking and memory filtering before prompting.
- Withhold unsupported answers; a safe refusal still fails answer usefulness when sufficient evidence exists.
- Verify on the deployed backend separately. A GitHub merge or local replay is not deployment evidence.

Those earlier changes retained retrieval and diagnostic improvements only. The current flow above supersedes the earlier verification contract; it does not change the model, reasoning setting, secrets or schema.
