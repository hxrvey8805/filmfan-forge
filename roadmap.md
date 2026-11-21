# Approved PR #28 rollout

- [x] Synced merge 493a1f0085bc97dd930e505f690d7b276f829a30 and tested 657f2bc6b818c597149b91206ccf6e48cf332725 have identical tree 52c576fed06ec5c2c93003a1b8b20f4898c385ad; exact SQL SHA-256 matches 9ed93781dffff3da2b25914abe44631ace4c893603aceffb5eb395bd006baef8.
- [x] Read-only preflight: v2/version/hash absent; legacy authenticated-only RPC intact, production sales false, approved AI caps and private grant intact.
- [x] Applied exact 20261121170000_daily_skin_rewards.sql once through the Lovable SQL editor at 2026-11-21 15:51 UTC after build credits exhausted. Recorded exact source in supabase_migrations.schema_migrations version 20261121170000; DO NOT REAPPLY.
- [x] Exported live postflight: v2 body MD5 46af60614f8c9ffb5e81f35033a8f51b matches reviewed source; postgres/authenticated EXECUTE only. Legacy function, table permissions, wallet/inventory/event/game content hashes, owner grant, review policy and AI/purchase settings match preflight. No live reward invoked. Private evidence: .cinegeek-private/skin-rewards-2026-11-21/migration-verification.json.
- Backend complete; do not resume the paused migration. No edge deployments, source redesign, public publishing, live rewards/AI, settings changes or older task work. Build 30 uploaded and processed successfully; testing notes saved and added to CineGeek Owner Testing (1 tester), build ID d177fb5b-668f-4345-8337-cf4f8337ef95. Real purchases remain disabled; no public App Store submission. Device installation and a naturally won live skin are not claimed as verified.

## Archived PR #27 receipt (not an active task)

- [x] Confirm merged 1b3d7231c9622e214989ebfd2cd09d5f5018cb53 exactly matches tested 9ae9afc1b4eb599e68acc7dcc20cce7c50bf8791 tree a911579a08fd29b520c3f96bfeedb27afd725225.
- [x] Deploy only actor-connect and game-result before the migration; both succeeded, existing verify_jwt=false and auth.getUser validation preserved.
- [x] Apply exact 20261121150000_game_connection_recheck.sql once as Drizzle 0009_game_connection_recheck; live journal id 10, hash 82407b870cf8b91045ae22a296bd66e54a67778d454224defe8535e3c0cfd324. Original timestamp is not separately recorded in supabase_migrations.schema_migrations; do not rerun the applied body.
- [x] Verify default 1, NOT NULL smallint, check IN (1,2); claim/finish retain postgres/service_role EXECUTE only, no PUBLIC/anon/authenticated EXECUTE and no direct client game/XP table access.
- [x] Verify all six bridges with exact gameCatalogueCast rules: The Wonder (Ruth Bradley/Florence Pugh), Avengers: Doomsday (Florence Pugh/Pedro Pascal), Avengers: Doomsday (Pedro Pascal/Letitia Wright), Black Panther (Letitia Wright/Michael B. Jordan), The Thomas Crown Affair (Michael B. Jordan/Adria Arjona), Andor (Adria Arjona/Kyle Soller): all PASS.

## Rollout receipt — 2026-11-21

- Submitted package SHA-256 (files and settings): actor-connect `3d2920b092166e50f182d9dc4bcd8e583365786ccaed9f6f0948145450a2e240`; game-result `8c32b9c833b04cd81d21c16ace656f23dd21644b5246a1502880f74ab5ab91ff`.
- index.ts SHA-256: actor-connect `593659c6220dc85f3d1b6a3c94daab39068faaa8542772e67cd4c742f28f04b2`; game-result `bac99653e93c580aab261e1a0c69740db6e13520c7312c384ee1cab5898e6b29`.
- Production sales remain false. Global enabled=true, cap 5000000 micro-USD, committed 1193650, halt NULL; question 350000, account UTC month 3000000, daily NULL, calls 64. No settings changed. Owner private grant remains unrevoked with original dates; review policy remains enabled=true/sales_enabled=true.
- Saved game 4a8c6522-1cab-4047-bf28-a9638e3102fc was on time and retains original repeated-title proof, lost status, awarded 0, verification_version 1. No authenticated recheck/award invoked: normal game-result owns that step.
- 41 reviewed catalogue, path and database tests passed. Backend source/config unchanged after deployment. Migration tooling generated journal/snapshot and schema types only; no manual runtime source edits.
- Deployment success is confirmed; numeric active revisions and independent live bundle hash readback are not exposed. TestFlight build 29 and authenticated recheck/award remain operator verification, not background tasks.

Older tasks must not be resumed. No application source edits, publishing, purchases, AI calls, key/budget changes or manual game/XP changes.