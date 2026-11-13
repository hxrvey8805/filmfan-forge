import { titleKey, type LibraryTitle, type TitleFacts, type MetadataField, type FactField } from "./home-lists";
import { catalogueReleaseDate } from "./list-release";

const cache = new Map<string, { facts: TitleFacts; until: number }>();
interface Cell { value: string }
type Binding = Partial<Record<"id" | "field" | "value" | "entity" | "amount" | "unit" | "date" | "precision", Cell>>;
const paths: Record<FactField, string> = {
  director: "wdt:P57", actor: "wdt:P161", country: "wdt:P495", language: "wdt:P364", studio: "wdt:P272",
  // Anime can be a class, not a genre. Follow subclasses for narrow categories as well.
  genre: "(wdt:P136|wdt:P31)/wdt:P279*", topic: "(wdt:P921|wdt:P136)/wdt:P279*",
};
const fieldKeys = { director: "directors", genre: "genres", actor: "actors", country: "countries", language: "languages", studio: "studios", topic: "topics" } as const;
export function metadataQuery(type: LibraryTitle["type"], ids: number[], fields: MetadataField[]) {
  const safeIds = [...new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0))];
  const branches = [...new Set(fields)].flatMap(field => {
    if (field === "runtime") return type === "movie" ? [`{ BIND("runtime" AS ?field) ?work p:P2047 ?statement . ?statement a wikibase:BestRank ; psv:P2047 ?duration . ?duration wikibase:quantityAmount ?amount ; wikibase:quantityUnit ?unit . }`] : [];
    if (field === "release") {
      const properties = type === "tv" ? ["P577", "P580"] : ["P577"];
      return properties.map(property => `{ BIND("release" AS ?field) ?work p:${property} ?statement . ?statement wikibase:rank ?rank ; psv:${property} ?release . FILTER(?rank != wikibase:DeprecatedRank) ?release wikibase:timeValue ?date ; wikibase:timePrecision ?precision ; wikibase:timeCalendarModel wd:Q1985727 . }`);
    }
    if (!(field in paths)) return [];
    return [`{ BIND("${field}" AS ?field) ?work ${paths[field]} ?entity . OPTIONAL { ?entity rdfs:label ?value . FILTER(LANG(?value)="en") } }`];
  });
  if (!safeIds.length || !branches.length) return null;
  // UNION avoids multiplying every cast member by every genre and runtime.
  return `SELECT DISTINCT ?id ?field ?value ?entity ?amount ?unit ?date ?precision WHERE {
    VALUES ?id { ${safeIds.map(id => '"' + id + '"').join(" ")} }
    ?work wdt:${type === "movie" ? "P4947" : "P4983"} ?id .
    ${branches.join(" UNION ")}
  }`;
}

export function factsFromBindings(type: LibraryTitle["type"], ids: number[], rows: Binding[]) {
  const result = new Map<string, TitleFacts>(ids.map(id => [type + ":" + id, { directors: [], genres: [], minutes: [], entities: {} }]));
  for (const row of rows) {
    const facts = result.get(type + ":" + row.id?.value);
    if (!facts) continue;
    const field = row.field?.value;
    if (field && Object.prototype.hasOwnProperty.call(fieldKeys, field)) {
      const kind = field as FactField, key = fieldKeys[kind];
      const values = facts[key] ?? (facts[key] = []);
      if (row.value && !values.includes(row.value.value)) values.push(row.value.value);
      const id = row.entity?.value.split("/").pop();
      if (id && /^Q\d+$/.test(id)) {
        const entities = facts.entities![kind] ?? (facts.entities![kind] = []);
        if (!entities.includes(id)) entities.push(id);
      }
    }
    if (field === "runtime" && row.amount && row.unit) {
      const factor = { Q7727: 1, Q11574: 1 / 60, Q25235: 60 }[row.unit.value.split("/").pop()!];
      const n = Number(row.amount.value) * (factor ?? 0);
      if (Number.isFinite(n) && n > 0 && !facts.minutes.includes(n)) facts.minutes.push(n);
    }
    if (field === "release" && row.date && row.precision) {
      const release = catalogueReleaseDate(row.date.value, Number(row.precision.value));
      const releases = facts.releaseDates ?? (facts.releaseDates = []);
      if (release && !releases.some(r => r.date === release.date && r.precision === release.precision)) releases.push(release);
    }
  }
  return result;
}

// Only public catalogue IDs are sent. No list names, account IDs or watch progress.
async function loadBatch(type: LibraryTitle["type"], ids: number[], signal: AbortSignal, fields: MetadataField[]) {
  const query = metadataQuery(type, ids, fields);
  if (!query) return;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal.aborted) throw new DOMException("List closed", "AbortError");
  signal.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(cancel, 18000);
  try {
    const response = await fetch("https://query.wikidata.org/sparql?" + new URLSearchParams({ query, format: "json" }), {
      signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer",
    });
    if (!response.ok) throw Error("Could not load title details");
    const rows = (await response.json()).results?.bindings;
    if (!Array.isArray(rows)) throw Error("Invalid title details");
    const result = factsFromBindings(type, ids, rows);
    for (const [key, facts] of result) cache.set(key + ":" + fields.join(","), { facts, until: Date.now() + 3_600_000 });
  } finally {
    clearTimeout(timeout); signal.removeEventListener("abort", cancel);
  }
}

export async function listMetadata(titles: LibraryTitle[], signal: AbortSignal, requested: MetadataField[] = ["director", "genre", "runtime"]) {
  const fields = [...new Set(requested)].sort();
  const suffix = ":" + fields.join(",");
  const facts = new Map<string, TitleFacts>();
  let failed = false;
  if (!fields.length) return { facts, failed };
  for (const type of ["movie", "tv"] as const) {
    const ids = [...new Set(titles.filter(t => t.type === type && Number.isSafeInteger(t.id) && t.id > 0 && (cache.get(titleKey(t) + suffix)?.until ?? 0) < Date.now()).map(t => t.id))];
    for (let i = 0; i < ids.length; i += 20) {
      try { await loadBatch(type, ids.slice(i, i + 20), signal, fields); }
      catch (error) { if (signal.aborted) throw error; failed = true; break; }
    }
  }
  for (const title of titles) {
    const key = titleKey(title), item = cache.get(key + suffix);
    if (item && item.until > Date.now()) facts.set(key, item.facts);
  }
  return { facts, failed };
}
