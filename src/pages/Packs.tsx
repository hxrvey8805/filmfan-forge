import { useCallback, useEffect, useRef, useState } from "react";
import { Clapperboard, Coins, Layers3, Package, UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PackOpeningModal from "@/components/PackOpeningModal";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";

type CastCard = Tables<"user_collection">;
type Pack = Tables<"user_packs">;
const tier = (value: number) => value >= 400 ? "Legendary" : value >= 250 ? "A-List" : value >= 150 ? "Established" : value >= 80 ? "Professional" : value >= 30 ? "Emerging" : "Minor";

export default function Packs({ onStore, onBalance }: { onStore: () => void; onBalance: (coins: number) => void }) {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [cards, setCards] = useState<CastCard[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [shelf, setShelf] = useState<"actor" | "director">("actor");
  const [packId, setPackId] = useState("");
  const [selected, setSelected] = useState<CastCard | null>(null);
  const [quote, setQuote] = useState<number | "error" | null>(null);
  const [retry, setRetry] = useState(0);
  const [selling, setSelling] = useState(false);
  const shelfButton = useRef<HTMLButtonElement>(null);
  const cardButton = useRef<HTMLButtonElement | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setState("loading");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error();
      const [inventory, collection] = await Promise.all([
        supabase.from("user_packs").select("*").eq("user_id",user.id).eq("is_opened",false).order("earned_at",{ ascending:false }),
        supabase.from("user_collection").select("*").eq("user_id",user.id).order("collected_at",{ ascending:false }),
      ]);
      if (inventory.error || collection.error) throw new Error();
      setPacks(inventory.data ?? []); setCards(collection.data ?? []); setState("ready");
    } catch { setState("error"); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    setQuote(null);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("calculate-person-value", { body: {
          personName: selected.person_name, personType: selected.person_type, personId: selected.person_id,
        } });
        if (error || !Number.isFinite(data?.price) || data.price <= 0) throw new Error();
        if (active) setQuote(data.price);
      } catch { if (active) setQuote("error"); }
    })();
    return () => { active = false; };
  }, [selected, retry]);
  async function sell() {
    if (!selected || typeof quote !== "number" || selling) return;
    setSelling(true);
    try {
      const { data, error } = await supabase.functions.invoke("sell-card", { body: { cardId: selected.id } });
      if (error || !Number.isFinite(data?.newBalance)) throw error ?? new Error();
      onBalance(data.newBalance); setCards(rows => rows.filter(row => row.id !== selected.id));
      setSelected(null); toast({ variant: "success", title: "Card sold", description: data.message });
    } catch { toast({ title: "Couldn’t sell this card", description: "Your collection will refresh.", variant: "destructive" }); await load(); setSelected(null); }
    finally { setSelling(false); }
  }
  const closePack = () => { setPackId(""); void load(); };
  const visible = cards.filter(c => c.person_type === shelf);
  return <div className="space-y-4">
    <header className="play-subhead"><p className="arcade-kicker"><i /> Card counter</p><h1>Your collection</h1><p className="play-muted">Open packs and build your cast of actors and directors.</p></header>
    {state === "loading" ? <p role="status" className="play-muted">Loading your collection…</p> : state === "error"
      ? <div className="play-panel"><p>Couldn’t load your collection.</p><button className="play-action mt-2" onClick={load}>Try again</button></div> : <>
      <section className="pack-list" aria-labelledby="packs-heading"><h2 id="packs-heading" className="play-section-title">Unopened packs</h2>
        {packs.length === 0 ? <div className="play-panel pack-item"><Package /><div><strong>No unopened packs</strong><small>Find your first pack in the store.</small></div><button className="play-action" onClick={onStore}>Browse store</button></div>
          : (["actor","director"] as const).flatMap(type => (["standard","premium"] as const).map(level => {
              const group = packs.filter(p => p.pack_type === type && (p.pack_tier || "standard") === level);
              return group.length ? <div key={type+level} className="play-panel pack-item"><Package /><div><strong className="capitalize">{type} pack</strong><small>{level === "premium" ? "Premium" : "Standard"} · {group.length} unopened</small></div><button className="play-action" onClick={() => setPackId(group[0].id)}>Open pack</button></div> : null;
          }))}
      </section>
      <section aria-labelledby="cards-heading"><h2 id="cards-heading" className="play-section-title">Your cards</h2>
        <div className="play-segments" role="group" aria-label="Card shelf">{(["actor","director"] as const).map(t => <button ref={t === shelf ? shelfButton : undefined} key={t} aria-pressed={shelf === t} onClick={() => setShelf(t)}>{t === "actor" ? "Actors" : "Directors"} · {cards.filter(c => c.person_type === t).length}/5</button>)}</div>
        {visible.length ? <div className="play-cards">{visible.map(c => <button key={c.id} className="person-card" aria-label={`View ${c.person_name} card`} onClick={e => { cardButton.current = e.currentTarget; setQuote(null); setSelected(c); }}>
          {c.profile_path ? <img src={`https://image.tmdb.org/t/p/w342${c.profile_path}`} alt="" loading="lazy"/> : <span><UserRound /></span>}<strong>{c.person_name}</strong>
        </button>)}</div> : <div className="arcade-empty"><Layers3 /><div><strong>No {shelf} cards yet</strong><p className="play-muted">Open a pack to add one to this shelf.</p></div></div>}
      </section>
    </>}
    <PackOpeningModal isOpen={Boolean(packId)} packId={packId} onClose={closePack} onPackOpened={closePack} />
    <Dialog open={!!selected} onOpenChange={open => { if (!open && !selling) setSelected(null); }}>
      <DialogContent className="w-[calc(100%-2rem)] rounded-2xl" onCloseAutoFocus={e => { e.preventDefault(); (cardButton.current?.isConnected ? cardButton.current : shelfButton.current)?.focus(); }}>
        <DialogHeader><DialogTitle>{selected?.person_name}</DialogTitle><DialogDescription className="capitalize">{selected?.person_type} card</DialogDescription></DialogHeader>
        {typeof quote === "number" ? <><p className="text-sm"><Clapperboard className="inline mr-2 w-4" />{tier(quote)} · Estimated value: {quote} coins</p><p className="text-sm text-muted-foreground">Selling removes this card from your collection.</p>
          <button className="play-action" disabled={selling} onClick={sell}><Coins/>{selling ? "Selling…" : "Sell card"}</button></>
          : quote === "error" ? <div><p>Card value is unavailable.</p><button className="play-action mt-2" onClick={() => setRetry(n => n+1)}>Retry value</button></div> : <p role="status">Checking card value…</p>}
      </DialogContent>
    </Dialog>
  </div>;
}
