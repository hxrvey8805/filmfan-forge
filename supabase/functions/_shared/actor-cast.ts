export interface GameCastMember {
  id: number;
  name: string;
  character: string;
  profilePath: string;
  order: number | null;
  episodeCount?: number;
}

interface Credit {
  id: number;
  name: string;
  order?: number | null;
  character?: string;
  profile_path?: string | null;
  total_episode_count?: number;
  episode_count?: number;
  roles?: { character?: string; episode_count?: number }[];
}

export function compareBilling(a: GameCastMember, b: GameCastMember) {
  const aRank = a.order ?? Infinity;
  const bRank = b.order ?? Infinity;
  if (aRank !== bRank) return aRank - bRank;
  return (b.episodeCount ?? 0) - (a.episodeCount ?? 0);
}

export function titleCast(credits: Credit[]): GameCastMember[] {
  const people = new Map<number, GameCastMember>();
  for (const credit of credits) {
    if (!credit?.id || !credit.name) continue;
    const roles = [...(credit.roles ?? [])].sort((a, b) => (b.episode_count ?? 0) - (a.episode_count ?? 0));
    const names = [...new Set([credit.character, ...roles.map(role => role.character)].filter(Boolean))];
    const member: GameCastMember = {
      id: credit.id, name: credit.name, profilePath: credit.profile_path || "",
      character: names.join(" / "),
      order: typeof credit.order === "number" && Number.isInteger(credit.order) && credit.order >= 0 ? credit.order : null,
      episodeCount: credit.total_episode_count ?? credit.episode_count ?? roles[0]?.episode_count ?? 0,
    };
    const prior = people.get(member.id);
    if (!prior) { people.set(member.id, member); continue; }
    const first = compareBilling(member, prior) < 0 ? member : prior;
    const other = first === member ? prior : member;
    people.set(member.id, {
      ...first, profilePath: first.profilePath || other.profilePath,
      character: [...new Set([first.character, other.character].filter(Boolean))].join(" / "),
    });
  }
  return [...people.values()].sort(compareBilling);
}
