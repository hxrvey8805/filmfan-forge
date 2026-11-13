import type { FactField, ListRule } from "./home-lists";
import type { ListLookup } from "./list-intent";

export type CatalogueChoice = { id: string; label: string; description: string; roles: FactField[] };
const entity = /^Q[1-9]\d*$/;

/** User picks the meaning and, for people, the role. Search ranking never decides membership. */
export function catalogueChoices(data: unknown): CatalogueChoice[] {
  if (!data || typeof data !== "object" || !Array.isArray((data as { search?: unknown }).search)) return [];
  return (data as { search: Record<string, unknown>[] }).search.flatMap(row => {
    if (typeof row.id !== "string" || !entity.test(row.id) || typeof row.label !== "string") return [];
    const description = typeof row.description === "string" ? row.description : "";
    const person = /\b(actor|actress|director|filmmaker|producer|screenwriter)\b/i.test(description);
    const work = /\b(?:album|song|single|video game|arcade game|novel|webcomic|comic strip|Wikimedia disambiguation page)\b/i.test(description) || /\b(?:19\d\d|20\d\d)\b.*\b(?:film|series|movie)\b/i.test(description);
    if (work && !person) return []; // A similarly named film is not a category.
    const roles: FactField[] = person ? ["actor", "director"] : /\b(?:studio|production company)\b/i.test(description) ? ["studio"]
      : /\b(?:country|sovereign state)\b/i.test(description) ? ["country"]
      : /\blanguage\b/i.test(description) ? ["language"]
      : /\b(?:genre|subgenre|type of .*film|animation style)\b/i.test(description) ? ["genre"] : ["topic"];
    return [{ id: row.id, label: row.label.slice(0,100), description: description.slice(0,220), roles }];
  }).slice(0, 6);
}

export async function findListCategories(request: ListLookup, signal: AbortSignal): Promise<CatalogueChoice[]> {
  if (!request.term.trim() || request.term.length > 70) return [];
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal.aborted) throw new DOMException("Search cancelled", "AbortError");
  signal.addEventListener("abort", cancel, {once:true});
  const timeout = setTimeout(cancel, 12000);
  try {
    const params = new URLSearchParams({ action: "wbsearchentities", search: request.term, language: "en", uselang: "en", type: "item", limit: "8", format: "json", origin: "*" });
    const response = await fetch("https://www.wikidata.org/w/api.php?" + params, {signal:controller.signal, credentials:"omit",referrerPolicy:"no-referrer"});
    if (!response.ok) throw Error("Category search is unavailable. Try again shortly.");
    const data = await response.json();
    if (data.error) throw Error("Category search is unavailable. Try again shortly.");
    return catalogueChoices(data).filter(c => request.field === "category" || c.roles.includes(request.field as FactField) || request.field === "topic");
  } finally { clearTimeout(timeout); signal.removeEventListener("abort", cancel); }
}

export function ruleForChoice(choice: CatalogueChoice, kind: FactField, lookup: ListLookup): Extract<ListRule, {kind:FactField}> {
  if (!entity.test(choice.id) || !choice.roles.includes(kind) && lookup.field !== "topic") throw Error("Invalid category choice");
  return { kind, value: choice.label, entityId: choice.id, scope: lookup.scope };
}
