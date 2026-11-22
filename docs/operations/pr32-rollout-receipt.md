# CineGeek PR #32 — stopped at read-only preflight

## Result

**No migration or deployment occurred. Do not distribute TestFlight build 34.** The exact reviewed resolver passed 62 of 80 identities and rejected 18 at its unique normalized-name identity check. Failed entries have no verified ID; no identity was substituted, rerolled or corrected.

## Source and private backup

- Synced HEAD: `6e36d794d9b6d1bb7dbe84b9bea151f548432afe`; contains approved merge `1f8ea4d64a61e80bb158ff3f31e8285c45fc871e`.
- Runtime source, app, migration files, docs and tests match tested `381bdf94835746d9f38c5d21afc0eb8ee3db2928`; the only tree difference is generated `src/integrations/supabase/types.ts`. Working tree was clean before receipt-only edits.
- Fresh private read-only backup verified: 215 user_titles, 29 user_collection, 248 user_packs. No private rows or credentials included in this receipt. The previously reported owner-local backup was not available in this sandbox; the fresh backup is saved separately as private metadata.
- Exact cleanup predicate: **2 removable rows**, MobLand and Vinland Saga in Watchlist, each with Watching retained and recorded progress present. No additional conflict; approval covers these two only. Neither row was removed.

## Migration state and file hashes

- Both requested revisions remain absent: `20261122210000` and `20261122220000`; new move/store-pick RPCs and reveal_pick/card_rarity/catalogue_version columns are absent.
- Prior daily reward and private test grant versions are recorded; game recheck is recorded by Drizzle journal ID 10, reviewed hash `82407b870cf8b91045ae22a296bd66e54a67778d454224defe8535e3c0cfd324`. No prior migration was reapplied.
- Exclusive shelves SQL SHA-256: `aa612ff5731597911f3c3d0deac6a36b38c19d3428c7e7b692b558d557bd34ea`.
- Six-card SQL SHA-256: `b879c948b347debedafe1492a70a50c69fb1d4f8ddfcf12bef33d40f630fce38`.
- Both exact files contain BEGIN/COMMIT, which the migration tool does not accept. The first also performs legacy cleanup DELETE, which must use the permitted data-change path rather than be submitted as migration DML. No SQL was rewritten or submitted; exact-file/tool compatibility remains a later prerequisite in addition to identity correction.

## Deployment state

- open-pack **not deployed**; no deployment receipt or new active revision. Existing active revision was not exposed/read back.
- Reviewed index.ts SHA-256: `a6ea408af5b6dc25bb8b8a3905a20cb342d6289bfb3787a4261bf452c2cd3f37`.
- pack-service.ts SHA-256: `a20987912af799e78e796bc264ab8186387de1d5b558786eee31bb10b6762cea`.
- pack-catalogue.ts SHA-256: `36a06b43a2e89cd46348c7f46ded7629ae95e75ced38e5ea0463bfef8a9655f9`.
- Existing open-pack verify_jwt=false and server auth.getUser validation untouched. These are file hashes, not submitted bundle hashes.

## Read-only safeguard findings

- Production enabled=true, sales_enabled=false; real purchases remain disabled.
- AI overall budget enabled=true, cap **$5**, committed **$1.193650**, no halt.
- Question limit enabled=true, **$0.35/question**, **$3/account-month**, no daily cap, 64 provider calls/question.
- Existing claim_cinegeek_pack and store_cinegeek_reveal EXECUTE: postgres/service_role only. decide_cinegeek_pack EXECUTE: postgres/authenticated only. New store-pick/move RPC permissions cannot be verified live because they are not installed.
- Existing daily reward v2 EXECUTE: postgres/authenticated only. Daily reward source, odds and XP prices were not changed.
- Direct wallet/unlocks/event tables: no SELECT/INSERT/UPDATE/DELETE for anon, authenticated or service_role; access remains through reviewed definer RPCs.
- user_collection and user_packs: anon/authenticated SELECT only, service_role SELECT/INSERT/UPDATE/DELETE. user_titles: anon/authenticated/service_role SELECT/INSERT/UPDATE/DELETE; existing row-level policies still apply. No grants or policies changed.
- Owner enrollment, Sandbox settings, all game/spin receipts, inventory and balances untouched. No purchases, live AI, wins, spins, XP or skin grants; no credentials, model, context, spoiler rules, budgets or frontend publication changed.

## Live verification limitation

No transaction-rollback reward/library tests were run: deployment was halted at the mandatory identity gate. Six-card/seventh-card/replacement, move preservation, Keep/Skip replay, wrong-owner denial, frozen draw and legacy reveal checks remain pending; none is claimed to have passed live. No everyday user's XP was spent or granted. A corrected reviewed release is needed before rollout can continue.

## Exact resolver results — v1 names and types

Executed the unmodified `resolvePackPerson` imported from `_shared/pack-service.ts` with every `PACK_ROSTER` entry, its original type/rarity and `cinegeek-cast-1`. The read adapter queried TMDB search/person and person combined_credits using the existing TMDB_API_KEY privately; no credential is stored in this report. FAIL means `Person could not be verified` before credit validation, not a proven wrong person.

| Type | Exact v1 name | Verified TMDB ID | Result |
|---|---|---:|---|
| actor | John Turturro | Not verified | FAIL |
| actor | Paul Dano | 17142 | PASS |
| actor | Jessie Buckley | 1498158 | PASS |
| actor | Riz Ahmed | 53240 | PASS |
| actor | Steven Yeun | 215055 | PASS |
| actor | LaKeith Stanfield | 1200864 | PASS |
| actor | Toni Collette | 3051 | PASS |
| actor | Kirsten Dunst | 205 | PASS |
| actor | Lupita Nyong’o | 1267329 | PASS |
| actor | Rebecca Ferguson | Not verified | FAIL |
| actor | Dev Patel | Not verified | FAIL |
| actor | Barry Keoghan | 1290466 | PASS |
| actor | Florence Pugh | 1373737 | PASS |
| actor | Andrew Scott | Not verified | FAIL |
| actor | Gugu Mbatha-Raw | 1216606 | PASS |
| actor | Walton Goggins | 27740 | PASS |
| actor | Christian Bale | 3894 | PASS |
| actor | Jake Gyllenhaal | 131 | PASS |
| actor | Scarlett Johansson | 1245 | PASS |
| actor | Brad Pitt | Not verified | FAIL |
| actor | Emma Stone | Not verified | FAIL |
| actor | Cillian Murphy | 2037 | PASS |
| actor | Amy Adams | Not verified | FAIL |
| actor | Viola Davis | 19492 | PASS |
| actor | Joaquin Phoenix | Not verified | FAIL |
| actor | Ryan Gosling | 30614 | PASS |
| actor | Samuel L. Jackson | 2231 | PASS |
| actor | Michelle Yeoh | 1620 | PASS |
| actor | Kate Winslet | 204 | PASS |
| actor | Matt Damon | 1892 | PASS |
| actor | Oscar Isaac | 25072 | PASS |
| actor | Javier Bardem | 3810 | PASS |
| actor | Daniel Day-Lewis | 11856 | PASS |
| actor | Robert De Niro | 380 | PASS |
| actor | Al Pacino | 1158 | PASS |
| actor | Denzel Washington | 5292 | PASS |
| actor | Leonardo DiCaprio | 6193 | PASS |
| actor | Meryl Streep | 5064 | PASS |
| actor | Tom Hanks | 31 | PASS |
| actor | Cate Blanchett | 112 | PASS |
| actor | Anthony Hopkins | 4173 | PASS |
| actor | Morgan Freeman | Not verified | FAIL |
| actor | Tom Cruise | Not verified | FAIL |
| actor | Nicole Kidman | 2227 | PASS |
| director | Jordan Peele | 291263 | PASS |
| director | Ari Aster | 1145520 | PASS |
| director | Robert Eggers | 138781 | PASS |
| director | Céline Sciamma | 68813 | PASS |
| director | Sean Baker | Not verified | FAIL |
| director | Chloé Zhao | Not verified | FAIL |
| director | Charlotte Wells | 1904110 | PASS |
| director | Justine Triet | 1175620 | PASS |
| director | Alex Garland | 2036 | PASS |
| director | Taika Waititi | 55934 | PASS |
| director | Lulu Wang | Not verified | FAIL |
| director | Emerald Fennell | 1252934 | PASS |
| director | Denis Villeneuve | 137427 | PASS |
| director | David Fincher | 7467 | PASS |
| director | Paul Thomas Anderson | 4762 | PASS |
| director | Wes Anderson | Not verified | FAIL |
| director | Bong Joon-ho | 21684 | PASS |
| director | Guillermo del Toro | 10828 | PASS |
| director | Peter Jackson | Not verified | FAIL |
| director | Spike Lee | 5281 | PASS |
| director | Alfonso Cuarón | 11218 | PASS |
| director | Joel Coen | 1223 | PASS |
| director | Ethan Coen | 1224 | PASS |
| director | Greta Gerwig | 45400 | PASS |
| director | Steven Spielberg | 488 | PASS |
| director | Martin Scorsese | 1032 | PASS |
| director | Stanley Kubrick | 240 | PASS |
| director | Alfred Hitchcock | 2636 | PASS |
| director | Quentin Tarantino | 138 | PASS |
| director | Christopher Nolan | Not verified | FAIL |
| director | Akira Kurosawa | 5026 | PASS |
| director | Francis Ford Coppola | 1776 | PASS |
| director | David Lynch | Not verified | FAIL |
| director | Ridley Scott | 578 | PASS |
| director | James Cameron | Not verified | FAIL |
| director | Hayao Miyazaki | 608 | PASS |

Receipt recorded 2026-11-22T21:50:17.591750+00:00; only receipt/task-record files were edited.
