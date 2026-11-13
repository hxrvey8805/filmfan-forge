import { compareBilling, type GameCastMember } from "../../supabase/functions/_shared/actor-cast";

export function orderedGameCast(cast: GameCastMember[], media: string, version?: number) {
  // The old movie service returned 999 for both zero and missing billing. Only repair
  // the recognizable one-based list with one displaced credit; leave ambiguous lists alone.
  const legacyMovie = media === "movie" && version === undefined;
  const displaced = legacyMovie && cast[0]?.order === 1 && !cast.some(actor => actor.order === 0)
    && cast.filter(actor => actor.order === 999).length === 1;
  return cast.map(actor => legacyMovie && actor.order === 999
    ? { ...actor, order: displaced ? 0 : null } : actor).sort(compareBilling);
}
