import { localDateKey, upcomingRelease, type ReleaseDate } from "./list-release";
import type { Scope, FactField, ListRule } from "../../supabase/functions/_shared/list-interpretation";
export type { Scope, FactField, ListRule } from "../../supabase/functions/_shared/list-interpretation";

export type LibraryTitle = { id: number; type: "movie" | "tv"; title: string; posterPath: string; year?: number };
export const titleKey = (t: Pick<LibraryTitle, "type" | "id">) => t.type + ":" + t.id;
export const uniqueTitles = (titles: LibraryTitle[]) => [...new Map(titles.map(t => [titleKey(t), t])).values()];
export type MetadataField = FactField | "runtime" | "release";
export type HomeList = { id: string; name: string } & (
  { mode: "manual"; titles: LibraryTitle[] } | { mode: "smart"; rule: ListRule; sources?: string[]; request?: string }
);
export type TitleFacts = {
  directors: string[]; genres: string[]; minutes: number[];
  actors?: string[]; countries?: string[]; languages?: string[]; studios?: string[]; topics?: string[];
  entities?: Partial<Record<FactField, string[]>>;
  releaseDates?: ReleaseDate[];
};
export const normalize = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
  .replace(/[’']/g, "").replace(/[-‐‑]/g, " ").replace(/\s+/g, " ").trim();
export { ruleFromName, interpretListName } from "./list-intent";

export function ruleFields(rule: ListRule): MetadataField[] {
  if (rule.kind === "all" || rule.kind === "any") return [...new Set(rule.rules.flatMap(ruleFields))];
  if (rule.kind === "not") return ruleFields(rule.rule);
  return rule.kind === "year" ? [] : [rule.kind];
}

export function describeRule(rule: ListRule): string {
  const what = rule.scope === "movie" ? "Movies" : rule.scope === "tv" ? "TV shows" : "Movies and TV shows";
  if (rule.kind === "runtime") return "Movies " + (rule.inclusive ? "up to " : "under ") + rule.minutes + " minutes";
  if (rule.kind === "year") return what + (rule.from === rule.to ? ` from ${rule.from}` : ` from ${rule.from}–${rule.to}`);
  if (rule.kind === "release") return what + " not released yet";
  if (rule.kind === "all" || rule.kind === "any") {
    const parts = rule.rules.map(r => {
      if (r.scope !== rule.scope && r.scope !== "all") return describeRule(r);
      if (r.kind === "genre") return r.value;
      const text = describeRule(r).replace(/^(Movies and TV shows|Movies|TV shows) /, "");
      return r.kind === "all" || r.kind === "any" ? `(${text})` : text;
    });
    return `${what} matching ${rule.kind === "all" ? "all" : "either"}: ${parts.join(rule.kind === "all" ? "; " : " or ")}`;
  }
  if (rule.kind === "not") return "Exclude: " + describeRule(rule.rule);
  const relation = { director: "directed by", actor: "starring", country: "from", language: "originally in", studio: "produced by", topic: "about", genre: "in" };
  return `${what} ${relation[rule.kind]} ${rule.value}`;
}

export function matchesRule(t: LibraryTitle, facts: TitleFacts | undefined, rule: ListRule, today = localDateKey()): boolean | null {
  if (rule.scope !== "all" && rule.scope !== t.type) return false;
  if (rule.kind === "all" || rule.kind === "any") {
    const results = rule.rules.map(r => matchesRule(t, facts, r, today));
    if (!results.length) return null;
    return rule.kind === "all" ? results.includes(false) ? false : results.includes(null) ? null : true
      : results.includes(true) ? true : results.includes(null) ? null : false;
  }
  if (rule.kind === "not") {
    const result = matchesRule(t, facts, rule.rule, today);
    return result === null ? null : !result;
  }
  if (rule.kind === "year") return Number.isInteger(t.year) ? t.year! >= rule.from && t.year! <= rule.to : null;
  if (!facts) return null;
  if (rule.kind === "release") return upcomingRelease(facts.releaseDates, today);
  // Different cuts can have different runtimes. All reported lengths must qualify.
  if (rule.kind === "runtime") return facts.minutes.length ? facts.minutes.every(n => rule.inclusive ? n <= rule.minutes : n < rule.minutes) : null;
  const fields = { director: "directors", genre: "genres", actor: "actors", country: "countries", language: "languages", studio: "studios", topic: "topics" } as const;
  const values = facts[fields[rule.kind]] ?? [];
  const ids = facts.entities?.[rule.kind] ?? [];
  if (!values.length && !ids.length) return null;
  if (rule.entityId) return ids.includes(rule.entityId);
  const normalizedValue = (s: string) => rule.kind === "genre" ? normalize(s).replace(/\bromantic\b/g, "romance").replace(/\banimated\b/g, "animation") : normalize(s);
  const needle = normalizedValue(rule.value);
  return values.some(value => {
    const label = normalizedValue(value);
    if (rule.kind === "genre" && needle === "anime") return /\banime(?:$| (?:film|television|tv|series|short|original|ova|ona)\b)/.test(label) && !/\banime influenced\b/.test(label);
    return rule.kind === "genre" || rule.kind === "topic" ? (` ${label} `).includes(` ${needle} `) : label === needle;
  });
}
