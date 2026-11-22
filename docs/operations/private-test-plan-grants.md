# Private test plans

The owner requested ongoing Annual and Monthly access for two existing test
accounts on 22 November 2026. Account identifiers and the exact grant transaction
are kept in private operational receipts, not in this repository.

`20261122120000_private_test_plan_grants.sql` adds operator-managed grants for
either plan. A null expiry means no automatic expiry. Active explicit grants take
precedence over purchase and older test access; revoking or expiring the grant
restores the existing resolver behaviour. Ordinary paid and Sandbox accounts
retain their previous refund and expiry rules.

The table has row-level security and no direct privileges for anon,
authenticated or service_role. There is no client grant API. Account deletion
cascades to its private grant. Never fabricate an Apple transaction to provide
complimentary access.

The resolver uses infinity internally so existing question reservation/retry
checks work. The access RPC returns null for a plan without expiry, which the
existing app accepts. Both plans keep the usual 15 questions per monthly period;
retain an existing active grant's anchor when changing its plan so used questions
are not reset. Existing spending caps, consent and companion answer checks apply.

Validation: 89 database tests passed across Apple review (27), Apple production
(22) and tier/XP (40). Coverage includes no-expiry client parsing, owned versus all
skins, question reservation/retry and revocation, stable allowance anchors,
Sandbox receipt changes, ordinary refunds, private-table permissions and account
deletion. No provider calls or real purchases were used.

Rollout uses one guarded SQL transaction, verified account IDs and the reviewed
live function definitions. It records the migration source, applies only the two
requested grants, and aborts if purchase entitlements or purchase/budget policies
change. No edge-function deployment, frontend publication or new client build is
required. Reopen Profile / Your Plan to refresh an existing app session.

Applied and verified live on 22 November 2026 at 16:04 UTC. Both requested app
access responses report the correct plan and a null expiry; Annual exposes all
skins, Monthly exposes owned skins. Both allowance responses report 15 included
questions with finite monthly renewal dates. The prior owner's renewal anchor
is unchanged. Migration source MD5: `db109543eb758a13141b7843581027c2`.

Readback matched both reviewed function bodies and confirmed the migration
record, private table RLS, no application-role table privileges and the unchanged
authenticated-only access RPC grant. Production and Sandbox purchase-entitlement
checksums, purchase policies and all AI caps are identical to preflight. No
customer charges, provider calls or Lovable build credits were needed.
