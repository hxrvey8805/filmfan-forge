# Companion provider, deployment and replay

## Free OpenRouter connection

The companion can use `dots-studio/dots-3-note-preview:free` through OpenRouter, pinned to `atlas-cloud/fp8`. Set the backend secrets `OPENROUTER_API_KEY` and `COMPANION_AI_PROVIDER=openrouter` to activate it after deploying the code. Until the explicit provider setting is present, the existing Groq configuration is used. An OpenRouter failure or missing key never triggers a provider fallback. `COMPANION_AI_PROVIDER=groq` is the explicit rollback.

The [OpenRouter model listing](https://openrouter.ai/dots-studio/dots-3-note-preview:free) currently has zero input/output prices and a **31 December 2026** retirement date. The [endpoint metadata](https://openrouter.ai/api/v1/models/dots-studio/dots-3-note-preview:free/endpoints) advertises JSON output and reasoning. The model is [Apache 2.0 licensed](https://huggingface.co/dots-studio/dots3-note-prev/blob/main/README.md); [AtlasCloud's API integration terms](https://www.atlascloud.ai/acceptable-use) allow end-user applications that add substantial functionality. CineGeek adds timestamp-gated evidence retrieval, scoped memory and independent claim verification; it does not expose a raw model API.

The adapter pins the free model and provider, sets maximum prompt/completion/request prices to zero, and disables provider fallbacks, tools and plugins. It requests JSON and parses only a complete final object. Truncated output, tool calls, source annotations, malformed JSON and provider failures cannot publish an unchecked answer. Provider errors are sanitized and never include credentials or echoed questions. A request times out after at most 45 seconds, with a shared 90-second budget for all writer/checker/repair calls. Provider failures are not automatically retried.

Before activation, confirm that the OpenRouter workspace does not enforce locked-on plugins or paid account defaults. Explicitly disabling plugins in a request does not override an account-level “Prevent overrides” rule. Do not turn on billing, purchase credits or weaken privacy preferences. Keep keys in backend secrets or a private local env file outside Git (mode 0600), never a `VITE_` variable.

The free account allowance is currently 50 model requests/day without credit purchases. A checked answer uses two calls, or up to four with one rewrite; all users share the account quota. Rate-limit failures produce an unavailable message, never a paid fallback. Free access and availability can change; the pinned route must fail rather than silently start charging. This is a limited temporary service, not an unlimited or permanent free tier.

The question and subtitle-ingestion paths no longer call paid OpenAI embeddings. Retrieval uses timestamp and keyword ranking with a null query vector. Existing vectors are harmless and need no migration. Subtitle-provider download quotas and existing hosting limits still apply; this integration does not purchase or upgrade them.

The previous Nemotron free endpoint was removed from the integration because its linked NVIDIA API Trial Terms exclude public production use. It is not a fallback.

## Deployment

1. Merge the reviewed change to GitHub main so Lovable syncs the source.
2. Store `OPENROUTER_API_KEY` in CineGeek's Cloud secrets; never paste it into Lovable chat or commit it.
3. Deploy **both** `spoiler-free-companion` and `process-subtitles`, including their shared imports. This also deploys the already-merged retrieval and memory repairs. No database migration or frontend change is needed.
4. Set `COMPANION_AI_PROVIDER=openrouter` after both functions are deployed. Adding the API key alone does not activate the provider.
5. Confirm function deployment versions/status before claiming the public companion has switched. GitHub sync and frontend Publish alone are not backend deployment evidence.

Lovable's managed Cloud project is not a user-owned Supabase CLI project. The current documented deployment flow uses the Lovable agent and consumes build credits. Do not trigger it under a no-Lovable-credits constraint; obtain explicit permission for a narrowly scoped deployment or use a separately authorized backend migration. Secrets can be staged through the UI without an AI build request.

Suggested deployment-only instruction, **send only when build-credit use is authorized**:

> Deploy `process-subtitles` and `spoiler-free-companion` from current GitHub main, including all `_shared` imports. Preserve source exactly. No migrations, model questions, subtitle downloads, frontend edits, or additional AI features. Report deployment success/version for both. Do not print secrets. The OpenRouter key is stored separately in Cloud secrets; activation uses `COMPANION_AI_PROVIDER=openrouter` after both functions are deployed.

## Offline checks and replay

`scripts/companion-replay.ts` uses the shared retrieval, writer and checker against an exported subtitle prefix. It does not call Lovable or write production conversations. Use exports with individual cues clipped to the intended viewing point, and keep exports, keys and results outside Git.

Input JSON contains `question`, `position`, `records` and optional `history`, using the shared companion types. Without `--live`, the script writes retrieval and the writer prompt. With `--live`, it uses the same OpenRouter adapter as the backend and saves writer/checker requests, final JSON responses, token usage, safe provider error codes and the answer or refusal. It never saves credentials, raw provider error bodies or model reasoning. Errors preserve the partial audit and exit with a nonzero status. Live replay is opt-in and should only run when requested.

```sh
deno run --allow-read=/private/audit --allow-write=/private/audit \
  scripts/companion-replay.ts /private/audit/input.json /private/audit/result.json

# OPENROUTER_API_KEY must be supplied privately; never place its value in this command.
deno run --env-file=/private/openrouter.env --allow-env=OPENROUTER_API_KEY \
  --allow-net=openrouter.ai --allow-read=/private/audit --allow-write=/private/audit \
  scripts/companion-replay.ts /private/audit/input.json /private/audit/result-live.json --live
```

## Answer and memory boundaries

The writer receives only permitted chronological passages with short request-local citation IDs. Each claim is a short, standalone statement with its own qualifications. The checker receives the entire selected evidence context and checks every claim individually. Only explicitly supported claims can be returned, and only when those claims alone form a useful, coherent answer. Incomplete, contradictory or boundary-failing verdicts are rejected.

There is at most one fresh rewrite and another independent check, using the same permitted evidence and memory plus fixed issue-category guidance. Rejected prose and checker explanations never become evidence. Provider failures propagate without publishing an unchecked draft.

Memory includes only saved `answered` turns from the same permitted scope. Failed answers remain visible in chat but cannot prime the next answer. Overlong replies are omitted instead of being cut mid-qualification. Retrieval and generation both enforce the viewing boundary, and the UI rejects stale responses after rewind, title/episode/account changes. Timestamp-only inputs are preserved.

Offline tests cover the provider requests, free-only routing, quota failures and the real writer/checker request bodies after rewind or episode switches. They do not establish model answer quality or guarantee that a model will never hallucinate. No live model questions were run for this provider change, as requested. Deployment status is reported separately.

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

Those earlier experiments retained retrieval and diagnostic improvements only. The current flow above supersedes the earlier verification contract. Switching the deployed provider still requires the explicit backend setting described above; no database migration is needed.
