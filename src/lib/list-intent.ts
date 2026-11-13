import { normalize, type FactField, type ListRule, type Scope } from "./home-lists";

const genres: Record<string, string> = {
  horror: "Horror", scary: "Horror", comedy: "Comedy", comedies: "Comedy", funny: "Comedy", comedic: "Comedy",
  thriller: "Thriller", thrillers: "Thriller", drama: "Drama", dramas: "Drama", dramatic: "Drama", action: "Action",
  romance: "Romance", romantic: "Romance", romances: "Romance", animation: "Animation", animated: "Animation", anime: "Anime",
  fantasy: "Fantasy", documentary: "Documentary", documentaries: "Documentary", docs: "Documentary",
  "sci fi": "Science fiction", scifi: "Science fiction", "science fiction": "Science fiction", crime: "Crime", mystery: "Mystery",
  mysteries: "Mystery", adventure: "Adventure", western: "Western", westerns: "Western", musical: "Musical", musicals: "Musical",
  family: "Family", superhero: "Superhero", superheroes: "Superhero", "rom com": "Romantic comedy", "rom coms": "Romantic comedy",
  romcom: "Romantic comedy", romcoms: "Romantic comedy", "romantic comedy": "Romantic comedy", "romantic comedies": "Romantic comedy",
  "psychological thriller": "Psychological thriller", "psychological horror": "Psychological horror", "science fiction horror": "Science fiction horror",
};
const countries: Record<string, string> = { japanese: "Japan", korean: "South Korea", "south korean": "South Korea", french: "France", british: "United Kingdom", american: "United States of America", indian: "India", italian: "Italy", spanish: "Spain", german: "Germany", australian: "Australia", canadian: "Canada", chinese: "China", irish: "Ireland" };
const media = /\b(?:movies?|films?|tv shows?|television shows?|shows?|series)\b/gi;
export type ListLookup = { term: string; field: FactField | "category"; scope: Scope };
export type ListResolution = { term: string; field: ListLookup["field"]; rule: Extract<ListRule, {kind:FactField}> };

function duration(text: string): number | null {
  const s = text.replace(/\b(one|an?)\b/g, "1").replace(/\btwo\b/g, "2").replace(/and 1 half/g, "30 minutes").trim();
  const m = /^(?:(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\s*)?(?:(\d+)\s*(?:minutes?|mins?|m))?$/.exec(s);
  if (!m || (!m[1] && !m[2])) return null;
  const minutes = Number(m[1] || 0) * 60 + Number(m[2] || 0);
  return Number.isInteger(minutes) && minutes > 0 && minutes <= 1440 ? minutes : null;
}
const combine = (rules: ListRule[], scope: Scope, kind: "all" | "any" = "all"): ListRule => {
  const only = kind === "all" ? rules.find(r => r.scope !== "all")?.scope : undefined;
  return rules.length === 1 ? rules[0] : { kind, rules, scope: scope === "all" && only ? only : scope };
};
const scopeOf = (text: string, inherited: Scope): Scope => {
  const movie = /\b(movies?|films?)\b/i.test(text), tv = /\b(tv shows?|television shows?|shows?|series)\b/i.test(text);
  return movie && tv ? "all" : movie ? "movie" : tv ? "tv" : inherited;
};

/** Consume the whole request. An unknown clause must never be silently ignored. */
export function interpretListName(name: string, resolution?: ListResolution): { rule: ListRule | null; lookup: ListLookup | null; message: string } {
  const unresolved: ListLookup[] = [];
  let invalid = false;
  const lookup = (term: string, field: ListLookup["field"], scope: Scope): ListRule | null => {
    if (!term || term.length > 70 || /[\d<>!?{}]/.test(term) || /\b(?:not|without|except|best|worst|top|rated|rating|like|similar|but|and|or|under|over|before|after)\b/i.test(term)) { invalid = true; return null; }
    if (resolution && normalize(resolution.term) === normalize(term) && resolution.field === field) return {...resolution.rule, scope};
    unresolved.push({ term, field, scope }); return null;
  };
  function parse(raw: string, inherited: Scope, depth = 0): ListRule | null {
    if (depth > 8) { invalid = true; return null; }
    let text = normalize(raw.replace(/(\d{4})\s*-\s*(\d{4})/g, "$1 to $2")).replace(/^\s*(?:please\s+)?(?:show me|find me|find|i want|give me|a list of|list of)\s+/, "")
      .replace(/\s+(?:list|please)$/, "").trim();
    // Recognise release phrases before treating “not” as an exclusion.
    text = text.replace(/\b(?:not (?:out|released) yet|not yet (?:out|released)|(?:havent|hasnt) (?:come out|been released) yet|yet to (?:come out|be released)|coming soon|unreleased)\b/g, "upcoming");
    if (!text) return null;
    const scope = scopeOf(text, inherited);
    // OR applies to complete clauses. Shared trailing constraints are deliberately not guessed.
    const alternatives = text.split(/\s+or\s+/);
    if (alternatives.length > 1) {
      if (alternatives.length > 6 || /\b(?:under|up to|before|after|from|starring|directed|without|excluding|except|not|upcoming)\b/.test(text)) { invalid = true; return null; }
      const rules = alternatives.map(s => parse(s, scope, depth + 1));
      return rules.every(Boolean) ? combine(rules as ListRule[], scope, "any") : null;
    }
    const hasMovie = /\b(?:movies?|films?)\b/.test(text), hasTV = /\b(?:tv shows?|shows?|series)\b/.test(text);
    if (hasMovie && hasTV && !/\b(?:movies?|films?)\s+and\s+(?:tv shows?|shows?|series)\b/.test(text)) { invalid = true; return null; }
    const exclusion = /^(.*?)\s+(?:but\s+)?(?:without|excluding|except|not)\s+(.+)$/.exec(text);
    if (exclusion) {
      const positive = parse(exclusion[1], scope, depth + 1), negative = parse(exclusion[2], "all", depth + 1);
      if (negative?.kind === "all" || negative?.kind === "any") { invalid = true; return null; }
      return positive && negative ? combine([positive, { kind: "not", rule: negative, scope }], scope) : null;
    }
    const rules: ListRule[] = [];
    const take = (pattern: RegExp, build: (m: RegExpExecArray) => ListRule | null) => {
      const m = pattern.exec(text);
      if (!m) return;
      const rule = build(m); if (!rule) invalid = true; else rules.push(rule);
      text = (text.slice(0, m.index) + " " + text.slice(m.index + m[0].length)).trim();
    };
    // Limit runtime requests to movies: a series' total length is not its episode length.
    take(/\bupcoming\b/, () => ({ kind: "release", state: "upcoming", scope }));
    take(/\b(under|shorter than|less than|up to|at most)\s+((?:(?:\d+(?:\.\d+)?|one|two|an?|a)\s*(?:hours?|hrs?|h)(?:\s+and\s+a\s+half)?\s*)?(?:\d+\s*(?:minutes?|mins?|m))?)(?=$|\s+(?:and|from|released|without|starring|directed|with)\b)/, m => {
      const minutes = duration(m[2]);
      return minutes && scope !== "tv" ? { kind: "runtime", minutes, inclusive: ["up to", "at most"].includes(m[1]), scope: "movie" } : null;
    });
    take(/\b(?:from\s+|released\s+in\s+|in\s+)?(18\d{2}|19\d{2}|20\d{2})\s*(?:to|through|–|—)\s*(18\d{2}|19\d{2}|20\d{2})\b/, m => Number(m[1]) <= Number(m[2]) ? { kind: "year", from: +m[1], to: +m[2], scope } : null);
    take(/\b(?:from\s+(?:the\s+)?|in\s+(?:the\s+)?|the\s+)?((?:19|20)?\d0)s\b/, m => {
      const year = m[1].length === 2 ? +m[1] + (+m[1] >= 30 ? 1900 : 2000) : +m[1];
      return { kind: "year", from: year, to: year + 9, scope };
    });
    take(/\b(?:released\s+)?(before|after|since|from|in)\s+(18\d{2}|19\d{2}|20\d{2})\b/, m => ({ kind: "year", from: m[1] === "before" ? 1800 : +m[2] + (m[1] === "after" ? 1 : 0), to: ["after", "since"].includes(m[1]) ? 2999 : +m[2] - (m[1] === "before" ? 1 : 0), scope }));
    // Roles are explicit. “With” means cast, never an invented director.
    const role = /\b(directed by|by|starring|with|featuring|produced by|about|in the genre of)\s+(.+)$/.exec(text);
    if (role) {
      const field: FactField = ["directed by", "by"].includes(role[1]) ? "director" : role[1] === "produced by" ? "studio" : role[1] === "about" ? "topic" : role[1] === "in the genre of" ? "genre" : "actor";
      const term = role[2].trim();
      const value: ListRule | null = role[1] !== "with" && ["director", "actor", "studio"].includes(field) && /^[\p{L}][\p{L} .’'\-]{1,69}$/u.test(term) && !/\b(?:and|or|without|under|over)\b/.test(term)
        ? { kind: field, value: term, scope } : lookup(term, field, scope);
      if (value) rules.push(value);
      text = text.slice(0, role.index).trim();
    }
    // A language suffix is explicit; “French films” means origin, not language.
    take(/\b(?:in\s+)?([a-z]+)\s+language\b/, m => ({ kind: "language", value: m[1], scope }));
    text = text.replace(media, " ").replace(/\b(?:and|from the|from|the)\b/g, " ").replace(/\s+/g, " ").trim();
    if (text) {
      const atoms: ListRule[] = [];
      let remaining = text;
      const aliases = [...Object.keys(genres), ...Object.keys(countries)].sort((a,b) => b.length - a.length);
      while (remaining) {
        const alias = aliases.find(a => remaining === a || remaining.startsWith(a + " "));
        if (!alias) break;
        atoms.push({ kind: genres[alias] ? "genre" : "country", value: genres[alias] ?? countries[alias], scope });
        remaining = remaining.slice(alias.length).trim();
      }
      if (!remaining) rules.push(...atoms);
      else {
        // Unknown multiword categories need a catalogue interpretation, not a guessed person.
        rules.push(...atoms);
        const value = lookup(remaining, "category", scope); if (value) rules.push(value);
      }
    }
    return rules.length ? combine(rules, scope) : null;
  }
  const rule = name.trim().length <= 160 ? parse(name, "all") : null;
  const pending = unresolved.length === 1 && !invalid ? unresolved[0] : null;
  return {
    rule: !invalid && !unresolved.length ? rule : null, lookup: pending,
    message: pending ? `Find a catalogue match for “${pending.term}”.` : "Try a genre, person, topic, country, year, movie length or “not out yet”. You can combine them, like “upcoming horror movies”.",
  };
}
export const ruleFromName = (name: string): ListRule | null => interpretListName(name).rule;
