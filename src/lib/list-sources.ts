import { matchesRule, titleKey, uniqueTitles, type HomeList, type LibraryTitle, type TitleFacts, ruleFields, type MetadataField } from "./home-lists";
import { localDateKey } from "./list-release";

export type LibraryShelf = { id: string; name: string; mode: "shelf"; titles: LibraryTitle[] };
export type ListSource = HomeList | LibraryShelf;
export type SmartList = Extract<HomeList, { mode: "smart" }>;

export function dependsOn(source: ListSource, targetId: string, sources: Map<string, ListSource>, visited = new Set<string>()): boolean {
  if (source.id === targetId) return true;
  if (visited.has(source.id) || source.mode !== "smart") return false;
  visited.add(source.id);
  return source.sources?.some(id => {
    const parent = sources.get(id);
    return parent && dependsOn(parent, targetId, sources, visited);
  }) ?? false;
}

type Candidate = { title: LibraryTitle; verified: boolean };
export function resolveList(list: SmartList, sources: Map<string, ListSource>, allTitles: LibraryTitle[], facts: Map<string, TitleFacts>, today = localDateKey()) {
  const memo = new Map<string, Candidate[]>();
  const missing = new Set<string>();
  const visiting = new Set<string>();
  const fields = new Set<MetadataField>();
  const asCandidates = (titles: LibraryTitle[]) => titles.map(title => ({ title, verified: true }));

  function read(source: ListSource): Candidate[] {
    const cached = memo.get(source.id);
    if (cached) return cached;
    if (visiting.has(source.id)) return [];
    if (source.mode !== "smart") return asCandidates(source.titles);
    visiting.add(source.id);
    ruleFields(source.rule).forEach(field => fields.add(field));
    // Older smart lists have no source selection. All lists means the union of the underlying saved titles.
    const pool = source.sources === undefined ? asCandidates(allTitles) : source.sources.flatMap(id => {
      const parent = sources.get(id);
      if (!parent) { missing.add(id); return []; }
      return read(parent);
    });
    const union = new Map<string, Candidate>();
    for (const item of pool) {
      const key = titleKey(item.title);
      if (!union.has(key) || item.verified) union.set(key, item);
    }
    const result: Candidate[] = [];
    for (const [key, item] of union) {
      const match = matchesRule(item.title, facts.get(key), source.rule, today);
      if (match !== false) result.push({title: item.title, verified: item.verified && match === true});
    }
    visiting.delete(source.id);
    memo.set(source.id, result);
    return result;
  }
  return { candidates: read(list), missing, fields: [...fields].sort() };
}

export function savedTitles(sources: ListSource[]) {
  return uniqueTitles(sources.flatMap(s => s.mode === "smart" ? [] : s.titles));
}
