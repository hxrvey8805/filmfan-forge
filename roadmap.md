# Approved PR #25 deployment

- [x] Verify apple-billing-ledger and apple-review-purchases plus exact shared dependencies against tested 8230033f6d3a6cdfff8c4f95073f00381bd6bbe9.
- [x] Deploy only those two functions with verify_jwt=false; both deployments succeeded.
- [x] Record submitted hashes: ledger d62fcfef8fc806966466887a3becb3f83f614942bcdb4869cb3204794fb5494c; review 06cfdcaf69ec4becaeecdee3287f7b7dbeb22b1396665f3554300128393bb307.
- [x] Confirm review switch absent; existing ledger and Production settings untouched. No SQL, activation, enrollment, secrets, purchases or publishing.

The older preview-error task is replaced and must not be resumed.