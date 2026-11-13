import { useEffect, useRef, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { findListCategories, ruleForChoice, type CatalogueChoice } from "@/lib/list-catalogue";
import { describeRule, interpretListName, ruleFields, type FactField, type ListRule } from "@/lib/home-lists";
import type { ListLookup } from "@/lib/list-intent";
import { interpretListWithAI, type ListInterpretation } from "@/lib/list-ai";

const roleNames: Record<FactField,string> = { director:"Directed by",actor:"Starring",genre:"Genre or format",country:"Country of origin",language:"Original language",studio:"Produced by",topic:"Topic" };
export function SmartListInterpretation({request, rule, viewer, onResolve, onRefine}: {request:string;rule:ListRule|null;viewer:string;onResolve:(rule:ListRule)=>void;onRefine:()=>void}) {
  const interpretation = interpretListName(request);
  const lookup = interpretation.lookup;
  const [results, setResults] = useState<CatalogueChoice[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<ListInterpretation | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const controller = useRef<AbortController>();
  useEffect(() => {
    controller.current?.abort(); setResults(null); setError(""); setBusy(false); setProposal(null); setAiBusy(false);
    return () => controller.current?.abort();
  }, [request, viewer]);
  async function askGeek() {
    controller.current?.abort();
    const next = new AbortController(); controller.current = next;
    setAiBusy(true); setError(""); setResults(null); setProposal(null);
    try {
      const suggestion = await interpretListWithAI(request, viewer, next.signal);
      if (!next.signal.aborted) setProposal(suggestion);
    } catch (error) {
      if (!next.signal.aborted) setError(error instanceof Error ? error.message : "Geek couldn’t interpret that right now.");
    } finally { if (!next.signal.aborted) setAiBusy(false); }
  }
  async function search(target: ListLookup) {
    controller.current?.abort();
    const next = new AbortController(); controller.current = next;
    setBusy(true); setError(""); setResults(null);
    try {
      const matches = await findListCategories(target, next.signal);
      if (!next.signal.aborted) setResults(matches);
    } catch { if (!next.signal.aborted) setError("The catalogue couldn’t be reached. Try again shortly."); }
    finally { if (!next.signal.aborted) setBusy(false); }
  }
  function choose(choice: CatalogueChoice, field: FactField) {
    if (!lookup) return;
    const selected = ruleForChoice(choice, field, lookup);
    const parsed = interpretListName(request, {term:lookup.term,field:lookup.field,rule:selected}).rule;
    if (parsed) onResolve(parsed);
  }
  if (rule) return <div className="smart-interpretation" role="status"><strong>Let Geek sort for you</strong><p>{describeRule(rule)}.</p>
    {ruleFields(rule).includes("release") && <p>Based on the first release anywhere. For TV, this means a new show, not its next season. Unconfirmed dates stay out.</p>}</div>;
  return <div className="smart-interpretation">
    <strong>Let Geek sort for you</strong>
    <p role="status">{request.trim() ? interpretation.message : "Choose your lists and Geek will find the titles that fit."}</p>
    {request.trim().length >= 2 && <>
      <Button type="button" size="sm" variant="outline" disabled={busy || aiBusy} onClick={askGeek}><Sparkles size={15}/>{aiBusy ? "Geek is thinking…" : "Ask Geek to interpret"}</Button>
      <small>Uses free AI via OpenRouter. Only this description is sent. You’ll review the rule before saving.</small>
    </>}
    {lookup && !proposal && <Button type="button" size="sm" variant="ghost" disabled={busy || aiBusy} onClick={() => search(lookup)}><Search size={15}/>{busy ? "Finding meanings…" : "Find a match"}</Button>}
    {proposal?.kind === "suggestion" && <div className="smart-proposal" role="status">
      <strong>Here’s how I’d sort it</strong><p>{describeRule(proposal.rule)}.</p>
      {ruleFields(proposal.rule).includes("release") && <p>First release anywhere. For TV, this means a new show, not its next season.</p>}
      <small>Check the meaning and any limits. Only titles with matching catalogue details will be included.</small>
      <div><Button type="button" size="sm" onClick={() => onResolve(proposal.rule)}>Use this rule</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onRefine}>Change description</Button></div>
    </div>}
    {proposal?.kind === "clarify" && <div className="smart-proposal" role="status">
      <strong>{proposal.reason === "ambiguous_person" ? "Which connection did you mean?" : proposal.reason === "unsupported" ? "Let’s make that more specific" : "What belongs in this list?"}</strong>
      <p>{proposal.reason === "ambiguous_person" ? "Do you mean films they directed, or titles they appear in? Add the role to your description." : proposal.reason === "unsupported" ? "I can match genres, people, topics, countries, languages, studios, years, movie lengths and upcoming releases. I can’t reliably check every part of this request." : "Keep your list name, and describe the kind of watch you want—for example, comedy movies under 90 minutes."}</p>
      <Button type="button" size="sm" variant="outline" onClick={onRefine}>Describe what you mean</Button>
    </div>}
    {error && <p role="alert">{error}</p>}
    {results && !results.length && <p>No clear catalogue match yet. Try a genre, a named person or a more specific topic, or choose Pick titles.</p>}
    {!!results?.length && <fieldset className="smart-meanings"><legend>Which did you mean?</legend>{results.map(choice => <div key={choice.id}>
      <strong>{choice.label}</strong>{choice.description && <small>{choice.description}</small>}
      <div>{(lookup?.field === "topic" ? ["topic" as const] : choice.roles).map(field => <Button key={field} type="button" size="sm" variant="outline" onClick={() => choose(choice, field)}>{roleNames[field]}: {choice.label}</Button>)}</div>
    </div>)}</fieldset>}
  </div>;
}
