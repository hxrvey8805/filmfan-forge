# Architecture rules

- Keep reviewed tier RPC contracts in `src/lib/tier-rpc.ts` and reuse the existing authenticated client; generated live-schema types must remain untouched while a release is staged.