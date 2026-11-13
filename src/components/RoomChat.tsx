import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ArrowUp, ChevronDown, Clock3, MessagesSquare, Pencil, X } from "lucide-react";
import type { CompanionMessage } from "@/hooks/use-companion";
import { CompanionAnswer } from "./CompanionAnswer";
import { CineGeekFrames } from "./GlassesWithLenses";
import { formatTimestamp } from "../../supabase/functions/_shared/companion";
import { CompanionTimestamp } from "./CompanionTimestamp";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";

export function RoomPositionEditor({ seconds, maxMinutes, onSave, onClose, onReturnFocus }: {
  seconds: number; maxMinutes: number; onSave: (seconds: number) => void; onClose: () => void; onReturnFocus: () => void;
}) {
  const [draft, setDraft] = useState(seconds);
  const [valid, setValid] = useState(seconds <= maxMinutes * 60);
  const heading = useRef<HTMLHeadingElement>(null);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="room-time-sheet" onOpenAutoFocus={e => { e.preventDefault(); heading.current?.focus(); }}
      onCloseAutoFocus={e => { e.preventDefault(); onReturnFocus(); }}>
      <DialogTitle ref={heading} tabIndex={-1}>Watching at</DialogTitle>
      <DialogDescription>Match the time on your screen. Geek will use this point when you set it.</DialogDescription>
      <CompanionTimestamp minutes={draft / 60} maxMinutes={maxMinutes} onChange={([m]) => setDraft(Math.round(m * 60))}
        onValidityChange={setValid} preview />
      <div className="room-time-actions"><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button disabled={!valid || draft > maxMinutes * 60} onClick={() => onSave(draft)}>Set time</Button></div>
    </DialogContent>
  </Dialog>;
}

const prompts = [
  ["Scene", "What is happening at this moment?"],
  ["Meaning", "Why does this exchange matter?"],
  ["Recap", "What has happened so far?"],
] as const;

interface ChatProps {
  focusAction?: ReactNode;
  expanded: boolean; onExpand: (open: boolean) => void;
  timestamp: string; valid: boolean; onEditPosition: () => void; positionButton: RefObject<HTMLButtonElement>;
  messages: CompanionMessage[]; historyError: string | null; loading: boolean;
  onAsk: (text: string) => Promise<string | undefined>;
  remainingFree: number | null; coins: number; onStore: () => void;
}
const compactTime = (time: string) => time.replace(/^00:(?=\d\d:\d\d$)/, "");

export function RoomChat({ focusAction, expanded, onExpand, timestamp, valid, onEditPosition, positionButton, messages,
  historyError, loading, onAsk, remainingFree, coins, onStore }: ChatProps) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState("");
  const [replyId, setReplyId] = useState<string>();
  const sending = useRef(false);
  const [error, setError] = useState("");
  const transcript = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const collapseButton = useRef<HTMLButtonElement>(null);
  const startY = useRef<number>();
  const cost = remainingFree === 0;
  const emptyWallet = cost && coins < 150;
  const latest = messages[0]?.id;
  // Resolve from the same timestamp-filtered history as the full transcript.
  const inlineReply = messages.find(message => message.id === replyId);
  useEffect(() => {
    const box = transcript.current;
    if (expanded && box) {
      const last = box.lastElementChild;
      // Keep the start of a long answer readable when it arrives.
      if (last) box.scrollTop = Math.min(box.scrollHeight, (last as HTMLElement).offsetTop);
    }
  }, [expanded, latest, pending]);

  function openChat() {
    input.current?.blur();
    onExpand(true);
    requestAnimationFrame(() => collapseButton.current?.focus({ preventScroll: true }));
  }
  function closeChat() {
    input.current?.blur();
    onExpand(false);
    requestAnimationFrame(() => openButton.current?.focus({ preventScroll: true }));
  }
  async function send() {
    const text = draft.trim();
    if (!text || !valid || sending.current || loading || emptyWallet) return;
    sending.current = true;
    if (!expanded) input.current?.blur();
    setReplyId(undefined);
    setError(""); setPending(text); setDraft("");
    try { setReplyId(await onAsk(text)); }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t send your question. Try again.");
      setDraft(text);
    } finally { sending.current = false; setPending(""); }
  }
  return <section className="room-chat" aria-label="Chat with Geek">
    {expanded && <button ref={collapseButton} aria-expanded={true} className="room-chat-handle" onClick={closeChat} aria-label="Collapse chat"
      onPointerDown={e => { startY.current = e.clientY; e.currentTarget.setPointerCapture?.(e.pointerId); }}
      onPointerUp={e => { if (startY.current !== undefined && e.clientY - startY.current > 32) closeChat(); startY.current = undefined; }}
      onPointerCancel={() => { startY.current = undefined; }}>
      <span className="room-grip" /><span className="room-chat-title"><CineGeekFrames aria-hidden="true"/> Chat with Geek</span><ChevronDown size={18}/>
    </button>}
    {expanded && <div className="room-transcript" ref={transcript}>
      {!messages.length && !pending && !historyError && <div className="room-conversation-start">
        <CineGeekFrames aria-hidden="true" /><p>What caught your eye?</p>
        <div className="room-prompts">{prompts.map(([label, text]) => <button key={label}
          aria-label={`Use prompt: ${text}`} onClick={() => { setDraft(text); input.current?.focus(); }}>{label}</button>)}</div>
      </div>}
      {historyError && <p role="status" className="room-chat-error">{historyError}</p>}
      {[...messages].reverse().map(message => <article className="room-exchange" key={message.id}>
        <div className="room-you"><small>You · {compactTime(formatTimestamp(message.position_seconds))}</small><p>{message.question}</p></div>
        <div className="room-geek"><small><CineGeekFrames aria-hidden="true" />Geek</small><CompanionAnswer message={message}/></div>
      </article>)}
      {pending && <div className="room-exchange"><div className="room-you"><small>You · {compactTime(timestamp)}</small><p>{pending}</p></div>
        <p role="status" className="room-typing">Geek is thinking…</p></div>}
    </div>}
    <div className="room-dock">
      {!expanded && pending && <p role="status" className="room-inline-pending"><CineGeekFrames aria-hidden="true"/>Geek is thinking…</p>}
      {!expanded && inlineReply && <article className="room-inline-reply" aria-label="Geek’s reply">
        <div className="room-inline-heading"><span><CineGeekFrames aria-hidden="true"/>Geek</span>
          <button type="button" aria-label="Dismiss reply" onClick={() => { setReplyId(undefined); openButton.current?.focus(); }}><X size={15}/></button>
        </div>
        <div className="room-inline-body" tabIndex={0}><CompanionAnswer message={inlineReply}/></div>
      </article>}
      {!expanded && <span role="status" className="sr-only">{inlineReply && "Geek’s reply is ready."}</span>}
      <div className="room-dock-controls"><button type="button" ref={positionButton} onClick={onEditPosition} className="room-position">
        <Clock3 size={15} /> {valid ? `Watching at ${compactTime(timestamp)}` : "Correct watching time"} <Pencil size={12} />
      </button>
        {!expanded && <button type="button" ref={openButton} className="room-history-button" aria-label="Open chat history" aria-expanded={false}
          onClick={openChat}><MessagesSquare size={15} aria-hidden="true"/>History</button>}
        {focusAction}
      </div>
      <form onSubmit={e => { e.preventDefault(); void send(); }}>
        {error && <p role="alert" className="room-chat-error">{error}</p>}
        <div className="room-compose"><textarea ref={input} rows={1} maxLength={2000} aria-label="Your question" enterKeyHint="send"
          placeholder="Ask Geek about this moment…" value={draft} disabled={Boolean(pending)}
          onChange={e => setDraft(e.target.value)} onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
          }} />
          <button type="submit" aria-label="Send question" disabled={!draft.trim() || !valid || loading || !!pending || emptyWallet}><ArrowUp size={18}/></button>
        </div>
        {remainingFree !== null && <p className="room-allowance">
          {cost ? `150 coins per question · ${coins} available` : `${remainingFree} free question${remainingFree === 1 ? "" : "s"} left today`}
          {cost && <button type="button" onClick={onStore}>View store</button>}</p>}
      </form>
    </div>
  </section>;
}
