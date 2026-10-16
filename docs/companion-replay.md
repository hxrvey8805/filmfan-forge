# Companion provider, deployment and replay

## Free OpenRouter connection

The companion can use `dots-studio/dots-3-note-preview:free` through OpenRouter, pinned to `atlas-cloud/fp8`. Set the backend secrets `OPENROUTER_API_KEY` and `COMPANION_AI_PROVIDER=openrouter` to activate it after deploying the code. Until the explicit provider setting is present, the existing Groq configuration is used. An OpenRouter failure or missing key never triggers a provider fallback. `COMPANION_AI_PROVIDER=groq` is the explicit rollback.

The [OpenRouter model listing](https://openrouter.ai/dots-studio/dots-3-note-preview:free) currently has zero input/output prices and a **31 December 2026** retirement date. The [endpoint metadata](https://openrouter.ai/api/v1/models/dots-studio/dots-3-note-preview:free/endpoints) advertises JSON output and reasoning. The model is [Apache 2.0 licensed](https://huggingface.co/dots-studio/dots3-note-prev/blob/main/README.md); [AtlasCloud's API integration terms](https://www.atlascloud.ai/acceptable-use) allow end-user applications that add substantial functionality. CineGeek adds timestamp-gated evidence retrieval, scoped memory and independent claim verification; it does not expose a raw model API.

The adapter pins the free model and provider, sets maximum prompt/completion/request prices to zero, and disables provider fallbacks, tools and plugins. It requests JSON and parses only a complete final object. Truncated output, tool calls, source annotations, malformed JSON and provider failures cannot publish an unchecked answer. Provider errors are sanitized and never include credentials or echoed questions. All writer/checker/repair calls share one 90-second budget; each call gets only the time remaining. Provider failures are not automatically retried.

Before activation, confirm that the OpenRouter workspace does not enforce locked-on plugins or paid account defaults. Explicitly disabling plugins in a request does not override an account-level “Prevent overrides” rule. Do not turn on billing, purchase credits or weaken privacy preferences. Keep keys in backend secrets or a private local env file outside Git (mode 0600), never a `VITE_` variable.

The free account allowance is currently 50 model requests/day without credit purchases. A checked answer uses two calls, or up to four with one rewrite; all users share the account quota. Rate-limit failures produce an unavailable message, never a paid fallback. Free access and availability can change; the pinned route must fail rather than silently start charging. This is a limited temporary service, not an unlimited or permanent free tier.

The question and subtitle-ingestion paths no longer call paid OpenAI embeddings. Retrieval uses timestamp and keyword ranking with a null query vector. Existing vectors are harmless and need no migration. Subtitle-provider download quotas and existing hosting limits still apply; this integration does not purchase or upgrade them.

The previous Nemotron free endpoint was removed from the integration because its linked NVIDIA API Trial Terms exclude public production use. It is not a fallback.

## Deployment

**The current caption/context repair is held in draft. Do not merge or deploy it until the original questions pass a fresh live evaluation, including rewind and episode-switch checks.** The provider activation steps below describe the earlier connection. The current repair requires both `20261015153000_caption_context_revision.sql` and `20261015195500_companion_answer_revision.sql` alongside both edge functions. Subtitle revision 3 excludes older caption caches; conversation revision 3 excludes answers accepted by the previous verification contract. Historical rows are preserved, but do not appear as current companion history or prompt memory. Do not use the earlier migration-free deployment instruction unchanged for this repair.

1. Only after the acceptance gate passes, merge the reviewed change to GitHub main so Lovable syncs the source.
2. Apply both migrations above and confirm subtitle and conversation revision 3 are available. The revised saving RPC rejects requests from older function versions before charging, so deploy the matching backend immediately afterward. Preserve `OPENROUTER_API_KEY` in CineGeek's Cloud secrets; never paste it into Lovable chat or commit it.
3. Deploy **both** `spoiler-free-companion` and `process-subtitles`, including their shared imports. Deploy the reviewed frontend history changes as well. The caption revision migration is required for this repair.
4. Set `COMPANION_AI_PROVIDER=openrouter` after both functions are deployed. Adding the API key alone does not activate the provider.
5. Confirm function deployment versions/status before claiming the public companion has switched. GitHub sync and frontend Publish alone are not backend deployment evidence.

Lovable's managed Cloud project is not a user-owned Supabase CLI project. The current documented deployment flow uses the Lovable agent and consumes build credits. Do not trigger it under a no-Lovable-credits constraint; obtain explicit permission for a narrowly scoped deployment or use a separately authorized backend migration. Secrets can be staged through the UI without an AI build request.

Suggested deployment-only instruction, **send only after the release gate passes and build-credit use is authorized**:

> Apply `20261015153000_caption_context_revision.sql` and `20261015195500_companion_answer_revision.sql`, then deploy `process-subtitles` and `spoiler-free-companion` from the reviewed GitHub main, including all `_shared` imports and the reviewed frontend changes. Preserve source exactly. No model questions, subtitle downloads or additional AI features. Report both migration results and deployment success/version for both functions. Do not print secrets. The OpenRouter key is stored separately in Cloud secrets; activation uses `COMPANION_AI_PROVIDER=openrouter` after both functions are deployed.

## Offline checks and replay

`scripts/companion-replay.ts` uses the shared retrieval, writer and checker against an exported subtitle prefix. It does not call Lovable or write production conversations. Use exports with individual cues clipped to the intended viewing point, and keep exports, keys and results outside Git.

Input JSON contains `question`, `position`, `records` and optional `history`, using the shared companion types. Without `--live`, the script writes retrieval and the writer prompt. With `--live`, it uses the same OpenRouter adapter as the backend and saves writer/checker requests, final JSON responses, token usage, safe provider error codes and the answer or refusal. It never saves credentials, raw provider error bodies or model reasoning. Errors preserve the partial audit and exit with a nonzero status. Live replay is opt-in and should only run when requested.

The OpenRouter path and replay use a 16,000-character serialized evidence budget; the legacy Groq path retains its 8,500-character cap. Both report counts and bounded timestamp ranges for omitted passages to the writer and checker. This measures selection from the supplied caption records, not source completeness or alignment with the viewer's playback edition. The source is filtered at each cue's end time before selection. Increasing the budget never increases the viewing boundary.

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

Before verification, deterministic grounding checks reject a named question subject absent from its cited passages, capitalized name/acronym candidates absent from their citations, and named speech without an explicit cited speaker label. The same checks also apply to the actual lines selected by the checker, rather than accepting a name elsewhere in the broader passage as proof. Possessive and curly-apostrophe forms are normalized. A name called aloud is not a speaker label. The writer may still explain an unlabeled conversation anonymously. These are necessary grounding conditions, not a general entity resolver or proof that every remaining claim is true. The semantic verifier remains required.

For current-moment questions, retrieval splits packets at the start of the last 30 seconds of completed captions, while retaining the earlier dialogue as background. Both writer and checker receive the same explicit recent-window IDs. The window is not a detected scene boundary. Cue-end clipping still occurs before splitting, and the window is rebuilt after a rewind or episode switch.

OpenRouter receives strict JSON schemas with only request-local passage/line IDs and bounded claim counts (two scene, six recap, three explanation). Claim completeness and the 260-character limit are checked at runtime; native string length constraints were removed after an experiment split a sentence mid-word across claims. Unknown draft fields are stripped before verification even if the provider ignores the schema. Format validity is not entailment. The draft uses direct generation, while the verifier retains reasoning with a larger total completion allowance; the shared 90-second deadline still applies. The direct-verifier experiment was rejected because it approved unsupported claims. This candidate configuration remains under the release hold: neither schema enforcement nor a positive model verdict establishes answer quality.

Memory includes only revision-3 `answered` turns from the same permitted scope. Older accepted answers are not trusted under the new validation contract, even when their timestamp is eligible. Both the backend cache check and the transactional saving RPC reject retired request IDs without returning their answer; the browser then uses a fresh ID on an explicit retry. Current-version failed answers remain visible in chat but cannot prime the next answer. Overlong replies are omitted instead of being cut mid-qualification. Retrieval and generation both enforce the viewing boundary, and the UI rejects stale responses after rewind, title/episode/account changes. Timestamp-only inputs are preserved.

Explicit references such as "your last answer" are handled without AI when no eligible assistant answer remains in prompt memory. The backend returns a fixed message stating that no previous answer is available at the selected viewing point, skips subtitle preparation and generation, and saves an uncharged `insufficient_evidence` response. The generation helper enforces the same guard for replay and other callers. Ordinary story questions still use caption evidence, and follow-ups with eligible memory still go through verification.

Offline tests cover the provider requests, free-only routing, quota failures and the real writer/checker request bodies after rewind or episode switches. They do not establish model answer quality or guarantee that a model will never hallucinate. Deployment status is reported separately.

## 15 October offline follow-up

The saved Social Network input at 05:00 contained 177 completed cues. Its full serialized evidence was 8,632 characters: only 132 over the legacy cap. Whole-passage selection consequently dropped the 03:48.02–04:55.45 exchange, leaving four passages and an incomplete explanation context. The OpenRouter budget now retains all five passages, including that exchange. The saved Breaking Bad S1E1 27:13 recap likewise retains all 17 supplied passages (15,625 characters), compared with nine under the old cap. These measurements use saved exports, not a newly captured production request.

Offline rechecks reject both captured Breaking Bad scene verdicts that accepted invented cleanup action, plus the saved Gladiator and Social Network drafts with unsupported named attribution. Captured checker verdicts are always evaluated against their original request-local passage aliases, never aliases generated by a new retrieval run. The six original input fixtures pass retrieval/boundary checks; the rewind fixture intentionally omits some irrelevant earlier-episode excerpts while retaining the current episode prefix. Later history is absent after rewind and episode switch.

No model API calls were made for this follow-up. These are rejection and retrieval results, **not successful new answers**. The earlier live recap was provider-filtered, The Social Network checker timed out, Gladiator verification was incomplete, and the scene answer still invented activity before the final guards. The larger context and new grounding rules must pass fresh live quality and latency checks after the free allowance resets. Subtitle edition/timing alignment also remains unverified.

## 15 October live recheck

Free access accepted all 15 model requests for six replays of candidate commit `4c8b897`; every returned usage record reported zero cost. No paid fallback or deployment was used. These were direct model replays from saved exports, not tests of the published website.

| Original case | Manual outcome |
| --- | --- |
| The Social Network, 05:00 disagreement | Improved coverage, but still not cleared: the answer adds a named institution absent from the captions and describes a disputed accusation imprecisely. The model checker approved it; manual review did not. |
| Breaking Bad S1E2, 05:00 scene | Still invents activity from sounds. Deterministic guards reject the positive checker verdict, withholding the answer. Usefulness fails. |
| Gladiator, 15:00 relationship | Still contains unsupported attribution and treats reported/speculative claims as objective facts. The replacement check also uses invalid source-line references. No answer returned. |
| Breaking Bad S1E1, 27:13 recap | All 17 supplied passages reach the writer, but it still invents events. The verifier hits its output allowance (`finish_reason=length`); no unchecked draft is published. |
| Rewind S1E2 to 03:15 | Future history/cues remain excluded, but the model guesses an unresolved reference and fails to acknowledge the unavailable previous answer. This triggered the new memory guard. |
| Switch to S1E1 at 05:00 | Later history/cues remain excluded and the model returns insufficient evidence. |

After that evaluation, both exact boundary questions pass the deterministic memory guard with no network or credential permissions and zero model calls. This is not a fresh model-quality result or deployment confirmation. The automated suite passes 182 tests, including available-memory follow-ups, unavailable-memory variants, ordinary story questions, UI transitions and database charging. The four content questions remain release failures; keep the PR in draft and do not deploy.

## 15 October continuation: current-window and proof checks

The schema/direct-generation experiment returned valid JSON quickly, but its direct verifier approved unsupported visual events, identities and chronology. It is **not** a quality pass. A separate source-first drafting probe also invented details and was not integrated; its verifier response was provider-filtered. The retained candidate uses reasoning for verification and adds deterministic checks against the actual selected proof lines. The same free route remains pinned. No main-branch update or deployment occurred.

| Original case | Latest candidate result |
| --- | --- |
| Breaking Bad S1E2, 05:00 | The latest caption window is now a separate seventh packet, starting at 04:32.397. All permitted earlier context remains. Both drafts still inferred actions/causes or lacked their claimed support; the answer was withheld. Usefulness fails. |
| The Social Network, 05:00 | All five passages remain available. The model still misstates the dispute and its chronology. The checker selected proof outside one claim's citations or without its named identities; deterministic checks withheld the answer despite positive model checks. Usefulness fails. |
| Gladiator, 15:00 | The first draft still substitutes a different character for Maximus. The replacement still makes unsupported speaker/successor attribution, and its proof does not establish the identity. Withheld. The supplied plain captions cannot establish the requested personal relationship reliably. |
| Breaking Bad S1E1, 27:13 | All 17 passages remain available. The latest request received HTTP 400 before a draft; one diagnostic retry also returned 400 without a recognized safe error category. The cause is unresolved, and this is not a content-quality pass. No automatic retry/fallback was added. |
| Rewind to S1E2 03:15 | Exact question passes the deterministic unavailable-memory guard without network or credentials. Filtered future history never enters the prompt or answer. |
| Switch to S1E1 05:00 | Exact question passes the same guard without network or credentials. The other episode's answer is unavailable. |

Across the format experiment, source-first probe, latest four content replays and one diagnostic retry, 22 model requests were attempted. Twenty returned usage records, all with cost zero; the two HTTP 400 requests returned no usage. No 429 occurred. These are saved-input replays, not tests of the published website. Subtitle/playback-edition alignment remains unverified, and the two plain-caption fixtures were not replaced with newly downloaded SDH tracks.

Validation: 191 automated tests, production build, Deno checks, scoped ESLint, and the six-input/four-captured-failure offline regression pass. Added coverage includes recent/background packet separation, exact boundary and episode transitions, removal of untrusted draft fields, schema IDs, proof-level identity checks, and possessive/accented names. This establishes those implementation behaviors, **not useful new model answers**. Keep the PR in draft until all original questions pass manual evidence review and the deployment gate is explicitly cleared.

## 15 October follow-up: retired memory and incomplete claims

Three more retained fixes address observed failure paths. Claims ending mid-word or mid-sentence cannot reach verification; the native string length constraint no longer forces truncation. Named attributions such as “is arguing”, “has complained”, “accuses” and “expresses concern” now require the same explicit speaker label as “says”. Conversation revision 3 prevents previously accepted bad answers from reappearing in prompt memory, visible history or idempotent responses. A new database migration preserves old records, rejects old in-flight writers before charging, and refuses retired request IDs. These are safety and correctness fixes, not a claim that content quality has passed.

The saved Social Network question was replayed with complete permitted context. Dots still inserted an institution absent from the captions and guessed identities. The Liquid comparison also reversed the speakers, made unsupported causal claims, or exhausted its verifier output. The existing Groq comparison likewise reversed speakers and causality; verification returned a provider error. None of the experimental prompts or provider changes were integrated. Inkling rejected non-agentic-harness use, and the Gemma and Poolside comparisons returned rate-limit errors; no access restrictions or account privacy settings were changed. No model comparison is cleared for release.

The recap's AtlasCloud HTTP 400 was reproduced with native-schema, ordinary JSON and reasoning configurations. Its upstream message remained a generic bad request, so the cause is unresolved; there is no evidence that changing the response format fixed it. The subtitle inspection also confirmed that the Social Network ASS file's Name fields are all “Unknown”; there are no hidden speaker names for the importer to recover.

Both exact rewind/switch questions pass with synthetic history advanced to revision 3. This avoids accidentally passing merely because an old history version was excluded. The original questions, captions and future-memory sentinel are unchanged; no credentials or network permission are available during those checks. Separate tests cover retirement of revision-2 history and cached request IDs. All 203 automated tests pass, along with the production build, Deno checks and scoped ESLint. Subtitle/playback edition alignment remains unverified. The four original content cases still have no passing release evaluation, and the published website has not been changed.

## 16 October reset replay

Candidate `dab608a` was replayed against the same four saved content questions after the user reported the free limit had reset. Nine model calls returned HTTP 200 and reported cost zero. The recap returned HTTP 400 before producing a draft. One previously blocked Gemma comparison returned HTTP 429 again. Eleven model requests were attempted in total; no provider settings, account privacy settings, production conversations or deployed code were changed.

| Original case | Result after reset |
| --- | --- |
| The Social Network, 05:00 | Still fails: the first draft mixes who makes the complaints and who leaves to study. Its positive verifier also cites outside a claim's own passages. The fresh draft reverses who ends the relationship. Withheld. All five permitted passages are present. |
| Breaking Bad S1E2, 05:00 | Still no useful answer returned. The engine-start narrative is plausible, but asserts success, intent and celebration from sounds and acknowledgements; the current proof guard rejects both positive verdicts. This does not establish that the described scene could not have happened. |
| Gladiator, 15:00 | Still fails: the draft answers about another character, turns speculation into fact, and supplies unsupported attribution instead of establishing the requested relationship. Withheld. |
| Breaking Bad S1E1, 27:13 | All 17 passages remain present; the writer again returns HTTP 400. Cause unresolved. |
| Rewind to S1E2 03:15 | Pass: no eligible previous answer and no future history in the prompt; no AI calls. |
| Switch to S1E1 05:00 | Pass: the other episode's answer remains unavailable; no AI calls. |

The boundary fixtures retain revision-3 synthetic future history so they exercise timestamp/episode isolation, not just old-version rejection. The same production retrieval and answer helpers were used, but these are saved-input replays, not published-site tests. Subtitle edition alignment remains unverified. The four content cases still fail the release gate, so keep the PR in draft.

The only code change following this replay corrects the HTTP 429 message to say the free service is rate-limited. A 429 alone does not establish that the user's daily account allowance is exhausted. No automatic retry, paid fallback or new provider was introduced. The 26 transport/answer-boundary tests pass; scoped ESLint and Deno checks pass. The last full suite remains 203 passing tests from `dab608a`.

## 16 October continuation: limited scene context

When a current-scene explanation fails verification, the response can now show complete caption packets from the latest 30-second window, within the same movie or episode. The server copies the permitted captions verbatim, labels them as limited context, and makes no inferred claim about actions, identities or causes. This response remains `insufficient_evidence`: it uses no question or coins and cannot enter trusted conversation memory. The existing rewind and episode filters still govern its visibility in chat. Dense/overlong packets are withheld rather than truncated; earlier-episode packets and stale dialogue cannot be displayed as current context. Explicit references to unavailable assistant memory take priority over all excerpts.

The edge function and replay share the same response assembly helper. Replay reports now distinguish a checked answer from the actual limited response returned to the UI; retrieval-only runs and provider failures do not manufacture a response. Provider failures still surface as errors and do not trigger an automatic retry or fallback. Caption sources are labeled as such in the UI.

All six captured reset cases were replayed offline. Each reused generation was accepted only when its writer/verifier request exactly matched the saved request. This used zero model calls. The Breaking Bad S1E2 scene case now supplies the permitted 04:32–04:59 caption packet as an uncharged limitation response. The Social Network and Gladiator explanations remain withheld, the recap retains its provider error, and the rewind/episode-switch questions retain their no-memory response without exposing the future-memory sentinel. **These are response and boundary regressions, not fresh model-quality passes.** The caption excerpt does not count as a completed scene explanation or clear the release gate.

A separate experimental context format made speaker continuity explicitly unknown and requested individual points instead of a two-person narrative. Two free Social Network writer calls still mixed identities and complaints, and the replacement inserted an institution not present in the captions. Both calls reported zero cost. That experiment was not integrated. The production writer, verifier, provider and evidence selection remain unchanged.

Validation: 215 automated tests, the production build, Deno checks and scoped ESLint pass. New tests cover limited-response charging and memory exclusion, caption rendering as literal text, cutoff-crossing cues, rewinds, episode/movie isolation, denials and complete-packet limits. A stale provider-selection test was updated to expect the corrected rate-limit message. The four original content cases remain release failures; subtitle/playback alignment remains unverified. Keep PR 11 in draft and do not merge or deploy.

## 16 October: offline speaker-alignment experiment

`scripts/lib/align-dialogue-speakers.ts` is an offline preparation helper, **not connected to the serving functions**. It accepts structured screenplay dialogue turns and a matching title/episode caption track. It clips captions before matching, requires exact normalized token spans within a single script turn, and refuses ambiguous matches, conflicting existing labels, overlaps and long gaps. Adjacent cues can share a label only when their combined text matches one turn; there is no alternating-speaker or nearest-name rule. Normalization preserves contractions: “we’re” must not match “were”. Script character names, scene descriptions, extra cue metadata and future dialogue are not exported. Neutral labels are local to a scene and request, so they cannot reveal a script identity across scenes. A textual match does not establish final-cut or playback alignment; external source review is still required.

A public copy of the [Social Network screenplay](https://stanzedicinema.com/wp-content/uploads/2011/01/thesocialnetwork_screenplay.pdf) supplied dialogue turns for the opening sequence. Its PDF layout was inspected and the original caption words/times were preserved. The initial prototype annotated 115 of 177 permitted cues. One local live replay with those annotations used two model calls, both reporting zero cost. The answer avoided the previous named-speaker reversal in that sample, but asserted a departure where the proof only established an intention to leave. The model checker accepted it; manual review rejected it. It also remained too vague about the sources of the disagreement. **This was not a quality pass.** The subsequent stricter contraction handling retains 112 annotations and has not been live-evaluated; the earlier evaluated inputs and outputs are preserved separately.

The helper and 11 synthetic alignment regressions are retained for further data preparation work. No screenplay content, real caption corpus, private question history or credentials are committed. The production evidence path and AI prompts are unchanged. The final suite has **226 passing tests**, with Deno and scoped ESLint passing; the production build passed after the response/UI changes. Neither the limited caption response nor the alignment experiment clears the four outstanding content failures. Keep the release hold.

## 16 October: recap transport and unsupported actions

The recap HTTP 400 was reproduced with the first nine passages; the first four, middle five and final eight succeeded separately. The provider returned only a generic bad-request message, so the exact upstream limit/cause is unconfirmed. A compact full request then succeeded with all 17 passages. `modelCaptionLines` removes only the repeated leading display timestamp on each model-input line. It preserves every caption word, denial, sound label, blank line and line ID; passage time ranges remain explicit. Original evidence and citation timestamps remain intact. Timestamp/episode filtering still happens before formatting. Both writer and verifier use this format and are told not to invent finer timing than the supplied ranges.

Two full-recap writer attempts in the production replay returned HTTP 200. A separate verifier transport probe also returned HTTP 200 with all 17 passages and a manually prepared grounded claim. That probe is **not a generated-answer quality pass**. The generated recap still invented details, including occupations, unseen actions and named roles; preflight checks withheld it. An experimental reasoning-enabled writer on the same free model also produced unsupported drafts and was not adopted.

The new action guard rejects unqualified departures, success/celebration, and selected sound-to-emotion assertions before a draft can reach the checker. It requires a speech/intent qualification in the same clause and prevents an earlier attribution from licensing an appended action such as “says goodbye and leaves.” Literal sound captions remain allowed. The guard is intentionally conservative and covers observed failure classes; it is not a general semantic proof and does not guarantee that every invented action is detected. The independent verifier, source-line checks and manual release gate remain necessary.

All six original questions were replayed from their preserved inputs. The subsequent outcome guard was live-tested on the scene failure; the final sound-to-emotion extension was checked offline against the captured drafts, not presented as another live replay.

| Case | Manual result |
| --- | --- |
| Breaking Bad S1E1, 27:13 recap | Transport error no longer reproduced with compact full context; both generated drafts remain unsupported and withheld. Quality fail. |
| Breaking Bad S1E2, 05:00 scene | Initial compact replay asserted success from engine noises and exclamations, despite a positive model check. After the outcome guard, the live replay withheld the drafts and returned uncharged limited captions. Safe withholding is not a useful full-answer pass. |
| The Social Network, 05:00 disagreement | Three supported reports of complaints/denials, with no physical departure claim. Still only a partial explanation: it misses the central condescending offer and miscommunication, and repeats terminology corrected later in the captions. Not a full quality pass. |
| Gladiator, 15:00 relationship | The checker approved an answer about succession and the emperor, but it did not address the requested Maximus relationship. Relevance fail. |
| Rewind to S1E2 03:15 | Pass: no eligible previous answer, no model calls, no future-memory sentinel in response or prompt conversation. |
| Switch to S1E1 05:00 | Pass: previous-episode answer excluded, no model calls, no future-memory sentinel in response or prompt conversation. |

The recorded diagnostics/replays used 19 requests: 18 completed responses reported zero cost; the reproduced HTTP 400 supplied no usage. All used the pinned zero-price endpoint. No paid fallback or provider change was introduced. Captured departure, success and excitement drafts are rejected by the final guard in an offline regression. Automated validation: **255 tests pass**, with scoped ESLint and Deno checks passing. These are local saved-input evaluations; edition/playback alignment remains unverified. **The four content cases do not clear the release gate. Do not merge or deploy.**

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

Those earlier experiments retained retrieval and diagnostic improvements only. The current flow above supersedes the earlier verification contract. Switching only the provider requires its explicit backend setting; the subsequent caption revision repair additionally needs the migration described in the deployment hold above.
