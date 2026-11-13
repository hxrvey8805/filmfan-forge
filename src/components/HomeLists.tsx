import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Clapperboard, Clock3, ListVideo, Pencil, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import PosterRow from "./PosterRow";
import { SmartListInterpretation } from "./SmartListInterpretation";
import { SmartListSources } from "./SmartListSources";
import { dependsOn, resolveList, savedTitles, type LibraryShelf, type ListSource, type SmartList } from "@/lib/list-sources";
import "./home-lists.css";
import SearchModal from "./SearchModal";
import { describeRule, ruleFromName, titleKey, uniqueTitles, type HomeList, type LibraryTitle, type ListRule } from "@/lib/home-lists";
import { homeListKey, listChangeEvent, readLists, writeLists } from "@/lib/home-list-storage";
import { listMetadata } from "@/lib/list-metadata";
import { localDateKey } from "@/lib/list-release";

type Props = { viewer: string; shelves: LibraryShelf[]; onOpen: (t: LibraryTitle) => void };
const examples = ["Action", "Comedy movies", "Horror under 90 minutes", "Friday options"];

function SmartShelf({ list, sources, allTitles, onOpen }: {
  list: SmartList; sources: Map<string, ListSource>; allTitles: LibraryTitle[]; onOpen: Props["onOpen"];
}) {
  const pool = useMemo(() => resolveList(list, sources, allTitles, new Map()), [list, sources, allTitles]);
  const [calendar, setCalendar] = useState(() => ({today:localDateKey(),hour:Math.floor(Date.now()/3_600_000)}));
  const dateSensitive = pool.fields.includes("release");
  useEffect(() => {
    if (!dateSensitive) return;
    const refresh = () => {
      const today = localDateKey(), hour = Math.floor(Date.now()/3_600_000);
      setCalendar(old => old.today === today && old.hour === hour ? old : {today,hour});
    };
    const resume = () => { if (document.visibilityState === "visible") refresh(); };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", resume);
    refresh();
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", resume); };
  }, [dateSensitive]);
  const [attempt, retry] = useState(0);
  const [result, setResult] = useState<Awaited<ReturnType<typeof listMetadata>> | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const candidates = pool.candidates.map(item => item.title);
    setResult(null);
    listMetadata(candidates, controller.signal, pool.fields).then(value => {
      if (!controller.signal.aborted) setResult(value);
    }).catch(() => { if (!controller.signal.aborted) setResult({facts: new Map(), failed: true}); });
    return () => controller.abort();
  }, [pool, attempt, calendar]);
  if (!result) return <p role="status" className="text-sm text-muted-foreground">Checking your saved titles…</p>;
  const { candidates, missing } = resolveList(list, sources, allTitles, result.facts, calendar.today);
  const matches = candidates.filter(item => item.verified).map(item => item.title);
  const unknown = candidates.length - matches.length;
  const sourceNames = list.sources?.flatMap(id => sources.get(id)?.name ?? []);
  const from = sourceNames === undefined ? "All lists" : sourceNames.join(", ") || "No available lists";
  return <>
    <p className="list-source-caption">From: {from}</p>
    {dateSensitive && <p className="text-xs text-muted-foreground">Upcoming first releases · updates as dates change.</p>}
    {missing.size > 0 && <p className="text-xs text-muted-foreground">A source list was removed. You can choose another in Edit rule.</p>}
    {matches.length ? <PosterRow title={list.name} items={matches} onPosterClick={onOpen} /> :
      <p className="text-sm text-muted-foreground">{unknown ? "No confirmed matches yet." : list.sources === undefined ?
        "No matches in your library yet. Matching titles appear here when you save them." :
        "No matches in the selected lists yet."}</p>}
    {unknown > 0 && <p role="status" className="text-xs text-muted-foreground">{unknown} {unknown === 1 ? "title is" : "titles are"} missing verified details.{result.failed && <button className="ml-2 py-2 text-primary" onClick={() => retry(n => n + 1)}>Try again</button>}</p>}
  </>;
}

export function HomeLists({ viewer, shelves, onOpen }: Props) {
  const key = homeListKey(viewer);
  const [lists, setLists] = useState<HomeList[]>(() => { try { return readLists(key); } catch { return []; } });
  const [legacy, setLegacy] = useState(() => { try { return Boolean(localStorage.getItem("personalLists")); } catch { return false; } });
  const [active, setActive] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const newListButton = useRef<HTMLButtonElement>(null);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const [titleQuery, setTitleQuery] = useState("");
  const [editor, setEditor] = useState<"new" | "edit" | null>(null);
  const [name, setName] = useState("");
  const [showRequest, setShowRequest] = useState(false);
  const [request, setRequest] = useState<string | null>(null);
  const [confirmedRule, setConfirmedRule] = useState<{request:string;rule:ListRule} | null>(null);
  const [choice, setChoice] = useState<"manual" | "smart" | null>(null);
  const [sourceSelection, setSourceSelection] = useState<string[] | undefined>();
  const [picked, setPicked] = useState<LibraryTitle[]>([]);
  const [searching, setSearching] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const selected = lists.find(l => l.id === active);
  const criteria = request ?? name;
  const rule = confirmedRule?.request === criteria ? confirmedRule.rule : ruleFromName(criteria);
  const mode = choice ?? (rule ? "smart" : "manual");
  const sourceList = useMemo(() => [...shelves, ...lists], [shelves, lists]);
  const sources = useMemo(() => new Map(sourceList.map(s => [s.id, s])), [sourceList]);
  const allTitles = useMemo(() => savedTitles(sourceList), [sourceList]);
  const sourceOptions = sourceList.filter(s => editor !== "edit" || !active || !dependsOn(s, active, sources));
  const validSources = sourceSelection?.filter(id => sourceOptions.some(s => s.id === id));
  const canSave = !!name.trim() && (mode === "manual" || (!!rule && (validSources === undefined || validSources.length > 0)));
  const candidates = uniqueTitles([...allTitles, ...picked]).filter(t => t.title.toLocaleLowerCase().includes(titleQuery.trim().toLocaleLowerCase()));
  const newestFirst = [...lists].reverse();
  const visibleLists = showAll ? newestFirst : newestFirst.slice(0, 3);
  function focusList(id: string | null) {
    requestAnimationFrame(() => {
      const row = id ? document.getElementById("list-button-" + id) : null;
      (row ?? newListButton.current)?.focus();
    });
  }
  useEffect(() => {
    const reload = () => { try { setLists(readLists(key)); } catch { /* Keep the current display. */ } };
    const sync = (event: StorageEvent) => { if (event.key === key || event.key === null) reload(); };
    const local = (event: Event) => { if ((event as CustomEvent).detail === key) reload(); };
    window.addEventListener("storage", sync);
    window.addEventListener(listChangeEvent, local);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener(listChangeEvent, local); };
  }, [key]);
  function save(update: (current: HomeList[]) => HomeList[]) {
    try { writeLists(key, update(readLists(key))); return true; }
    catch { toast.error("Couldn’t save your lists on this device."); return false; }
  }
  function edit(editing: boolean) {
    setName(editing ? selected!.name : "");
    setChoice(editing ? selected!.mode : null);
    const savedRequest = editing && selected?.mode === "smart" ? selected.request ?? selected.name : null;
    setRequest(savedRequest);
    setShowRequest(false);
    setConfirmedRule(editing && selected?.mode === "smart" ? {request:savedRequest!,rule:selected.rule} : null);
    setPicked(editing && selected?.mode === "manual" ? selected.titles : []);
    setSourceSelection(editing && selected?.mode === "smart" ? selected.sources : undefined);
    setTitleQuery("");
    setEditor(editing ? "edit" : "new");
  }
  function submit() {
    if (!canSave) return;
    if (lists.some(l => l.name.toLowerCase() === name.trim().toLowerCase() && !(editor === "edit" && l.id === active))) {
      toast.error("You already have a list with that name."); return;
    }
    const id = editor === "edit" ? active! : crypto.randomUUID();
    const list: HomeList = mode === "smart" && rule ? { id, name: name.trim(), mode, rule, request:criteria.trim(), sources: validSources } : { id, name: name.trim(), mode: "manual", titles: picked };
    if (save(current => editor === "edit" ? current.map(l => l.id === id ? list : l) : [...current, list])) { setActive(id); setEditor(null); focusList(id); }
  }
  function importLegacy() {
    try {
      // Old lists were device-wide and stored bare numeric IDs. Prefer their own saved title, then the original Watch List order.
      const old: { id: string; name: string; titleIds: number[]; titles?: LibraryTitle[] }[] = JSON.parse(localStorage.getItem("personalLists") ?? "[]");
      const imported = old.map(l => ({ id: l.id, name: l.name, mode: "manual" as const,
        titles: uniqueTitles(l.titleIds.flatMap(id => (l.titles ?? []).find(t => t.id === id) ?? allTitles.find(t => t.id === id) ?? [])) }));
      if (save(current => [...current, ...imported.filter(l => !current.some(existing => existing.id === l.id))])) {
        localStorage.setItem(key + ".legacy-backup", JSON.stringify(old));
        localStorage.removeItem("personalLists"); setLegacy(false); setActive(imported[imported.length - 1]?.id ?? null);
      }
    } catch { toast.error("Couldn’t import the older lists."); }
  }
  return <section id="my-lists" aria-label="My lists" className="home-library scroll-mt-24">
    <div className="lists-heading">
      <div><h2 className="text-xl sm:text-2xl font-semibold tracking-tight">My lists</h2>
        <p className="text-sm text-muted-foreground">{lists.length ? `${lists.length} saved ${lists.length === 1 ? "list" : "lists"}` : "Organise your next watch."}</p>
      </div>
      <Button ref={newListButton} size="sm" variant="outline" className="lists-create" onClick={() => edit(false)}><Plus size={16} />New list</Button>
    </div>
    {legacy && <button onClick={importLegacy} className="lists-more">Import older lists from this device</button>}
    {!lists.length && <div className="lists-empty">
      <span className="list-tile" aria-hidden="true"><ListVideo size={21} /></span>
      <p>Pick your own Friday lineup, or let a smart list collect horror movies as you save them.</p>
    </div>}
    <div className="lists-stack">{visibleLists.map(list => {
      const smart = list.mode === "smart";
      const open = active === list.id;
      const Icon = smart ? list.rule.kind === "runtime" ? Clock3 : list.rule.kind === "director" ? Clapperboard : Sparkles : ListVideo;
      const detail = smart ? describeRule(list.rule) : `${list.titles.length} ${list.titles.length === 1 ? "title" : "titles"}`;
      return <article key={list.id} className="list-folder" data-mode={list.mode} data-open={open || undefined}>
        <h3><button className="list-folder-toggle" id={`list-button-${list.id}`}
          aria-label={list.name} aria-describedby={`list-summary-${list.id}`} aria-expanded={open} aria-controls={`list-body-${list.id}`}
          onClick={() => setActive(open ? null : list.id)}>
          <span aria-hidden="true" className="list-tile"><Icon size={20}/></span>
          <span className="list-row-copy"><strong>{list.name}</strong><small id={`list-summary-${list.id}`}>
            {smart ? "Smart" : "Handpicked"} · {smart && !open ? "Updates automatically" : detail}</small></span>
          <ChevronDown size={16} aria-hidden="true" className="list-chevron" />
        </button></h3>
        <div id={`list-body-${list.id}`} hidden={!open}>{open && <div className="list-folder-body">
          {smart ? <SmartShelf list={list} sources={sources} allTitles={allTitles} onOpen={onOpen}/> :
            list.titles.length ? <PosterRow title={list.name} items={list.titles} onPosterClick={onOpen} /> :
            <p className="text-sm text-muted-foreground">Add your first title from search, or pick one from your library in Edit list.</p>}
          <div className="list-folder-actions">
            {!smart && <Button size="sm" variant="secondary" onClick={() => setSearching(true)}><Search />Find a title</Button>}
            <Button size="sm" variant="ghost" onClick={() => edit(true)}><Pencil/>{smart ? "Edit rule" : "Edit list"}</Button>
          </div>
        </div>}</div>
      </article>;
    })}</div>
    {lists.length > 3 && <button className="lists-more" aria-expanded={showAll} onClick={() => {
      if (showAll && !newestFirst.slice(0, 3).some(l => l.id === active)) setActive(null);
      setShowAll(!showAll);
    }}>{showAll ? "Show fewer lists" : `See all ${lists.length} lists`}</button>}
    <Dialog open={!!editor} onOpenChange={open => { if (!open) { setEditor(null); focusList(editor === "edit" ? active : null); } }}><DialogContent onOpenAutoFocus={event => {
        if (window.matchMedia?.("(pointer: coarse)").matches) {
          event.preventDefault(); editorHeading.current?.focus();
        }
      }} className="list-editor w-[calc(100%-2rem)] rounded-2xl sm:max-w-md">
      <DialogHeader><DialogTitle ref={editorHeading} tabIndex={-1}>{editor === "edit" ? "Edit list" : "New list"}</DialogTitle><DialogDescription>Saved for your profile on this device.</DialogDescription></DialogHeader>
      <div className="list-editor-fields"><div><label htmlFor="home-list-name" className="text-sm font-medium">List name</label><Input id="home-list-name" className="mt-1 text-base" maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Friday options"/>
        {editor === "new" && !name.trim() && <div className="mt-2 flex flex-wrap gap-1.5">{examples.map(s => <button key={s} className="rounded-full bg-muted px-2.5 py-1.5 text-xs" onClick={() => {setName(s);setRequest(null);setConfirmedRule(null);setChoice(null);}}>{s}</button>)}</div>}</div>
      <div className="grid grid-cols-2 gap-2" aria-label="List type">{(["manual","smart"] as const).map(m => <Button key={m} aria-pressed={mode === m} variant={mode === m ? "secondary" : "outline"} onClick={() => setChoice(m)}>{m === "smart" ? <Sparkles size={15}/> : <ListVideo size={15}/>} {m === "smart" ? "Smart match" : "Pick titles"}</Button>)}</div>
      {mode === "smart" ? <>{showRequest && <div><label htmlFor="smart-list-request" className="text-sm font-medium">What belongs in this list?</label><Input id="smart-list-request" className="mt-1 text-base" maxLength={160} value={criteria} onChange={event => {setRequest(event.target.value);setConfirmedRule(null);}} placeholder="e.g. action, comedy movies, films starring Tom Hanks"/><p className="mt-1 text-xs text-muted-foreground">Use the name, or give your list a nickname and describe it here.</p></div>}
        <SmartListInterpretation key={viewer + ":" + criteria} viewer={viewer} request={criteria} rule={rule} onResolve={value => setConfirmedRule({request:criteria,rule:value})} onRefine={() => {
          setShowRequest(true);setRequest(criteria);setConfirmedRule(null);
          requestAnimationFrame(() => document.getElementById("smart-list-request")?.focus());
        }}/>
        {!showRequest && <button type="button" className="list-refine" onClick={() => {setShowRequest(true);setRequest(criteria);}}>Edit matching rule</button>}

        <SmartListSources options={sourceOptions} selected={validSources} onChange={setSourceSelection} /></> :
        <div><p className="text-sm text-muted-foreground mb-1">Choose from your library · {picked.length} selected</p>
        {allTitles.length > 8 && <Input aria-label="Filter your library" className="mb-2 text-base" placeholder="Find in your library" value={titleQuery} onChange={e => setTitleQuery(e.target.value)} />}
        <div className="list-editor-picks">{!candidates.length && <p className="text-xs text-muted-foreground py-2">{titleQuery ? "No titles match your search." : "You can add a title after creating your list."}</p>}{candidates.map(t => {
          const checked = picked.some(p => titleKey(p) === titleKey(t));
          return <button key={titleKey(t)} aria-pressed={checked} onClick={() => { setChoice("manual"); setPicked(checked ? picked.filter(p => titleKey(p) !== titleKey(t)) : [...picked, t]); }} className="flex w-full items-center gap-2 border-b border-white/5 py-2 text-left text-sm">
            <span className={'grid h-5 w-5 shrink-0 place-items-center rounded border ' + (checked ? 'border-primary text-primary' : 'border-white/20')}>{checked && <Check size={14}/>}</span><span>{t.title} <small className="text-muted-foreground">{t.year} · {t.type === "tv" ? "Series" : "Movie"}</small></span></button>;
        })}</div></div>}
      </div>
      <div className="list-editor-footer">{editor === "edit" && <Button variant="ghost" aria-label="Delete this list" onClick={() => { setEditor(null); setDeleting(true); }}><Trash2 size={16}/></Button>}
      <Button className="flex-1" disabled={!canSave} onClick={submit}>{editor === "edit" ? "Save changes" : "Create list"}</Button></div>
    </DialogContent></Dialog>
    <Dialog open={deleting && !!selected} onOpenChange={open => { setDeleting(open); if (!open) focusList(active); }}><DialogContent><DialogHeader><DialogTitle>Delete {selected?.name}?</DialogTitle><DialogDescription>Your library titles stay on their shelves.</DialogDescription></DialogHeader>
      <Button variant="outline" onClick={() => { setDeleting(false); focusList(active); }}>Keep list</Button><Button variant="destructive" onClick={() => {if (save(rows => rows.filter(l => l.id !== active))) {setDeleting(false);setActive(null);focusList(null);}}}>Delete list</Button></DialogContent></Dialog>
    <SearchModal open={searching} onOpenChange={setSearching} listType="watchlist" listName={selected?.name} onSelect={title => {
      save(rows => rows.map(l => l.id === active && l.mode === "manual" ? {...l, titles: uniqueTitles([...l.titles, title])} : l));
    }}/>
  </section>;
}
