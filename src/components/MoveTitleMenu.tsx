import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Bookmark, Check, CircleCheck, Heart, ListVideo, Play, Pointer, X } from "lucide-react";
import type { LibraryTitle } from "@/lib/home-lists";
import { CineGeekFrames } from "./GlassesWithLenses";
import { PosterArtwork } from "./PosterArtwork";
import "./move-title-menu.css";

export type ShelfId = "watchlist" | "watching" | "favourite" | "watched";
export type MoveTarget = { id: string; label: string; personal?: boolean; already?: boolean };
export type MoveRequest = { title: LibraryTitle; source: ShelfId; anchor: HTMLElement; fromHold: boolean; targets: MoveTarget[] };
const icons = { "shelf:watchlist": Bookmark, "shelf:watching": Play, "shelf:favourite": Heart, "shelf:watched": CircleCheck };

export function MoveTitleMenu({ request, onClose, onMove }: {
  request: MoveRequest; onClose: () => void; onMove: (target: MoveTarget) => void;
}) {
  const shelves = request.targets.filter(target => !target.personal);
  const personalLists = request.targets.filter(target => target.personal);

  function destinationRow(target: MoveTarget) {
    const Icon = icons[target.id as keyof typeof icons] ?? ListVideo;
    return (
      <button key={target.id} type="button" className="move-title-option"
        data-move-option={target.id} disabled={target.already} onClick={() => onMove(target)}>
        <span className="move-title-icon"><Icon size={17} strokeWidth={1.8} aria-hidden="true" /></span>
        <span className="move-title-label">{target.label}</span>
        {target.already
          ? <small><Check size={13} aria-hidden="true" />Already here</small>
          : <ArrowUpRight className="move-title-arrow" size={15} aria-hidden="true" />}
      </button>
    );
  }

  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="move-title-backdrop" />
      <div className="move-title-bounds">
        <Dialog.Content tabIndex={-1} className="move-title-panel"
          onOpenAutoFocus={event => {
            event.preventDefault();
            (event.currentTarget as HTMLElement)?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={event => {
            event.preventDefault();
            const anchor = request.anchor.isConnected ? request.anchor : document.querySelector<HTMLElement>('.library-tab[aria-selected="true"]');
            anchor?.focus({ preventScroll: true });
          }}>
          <header className="move-title-header">
            {request.title.posterPath && <div className="move-title-atmosphere" aria-hidden="true">
              <img key={request.title.posterPath} src={request.title.posterPath} alt=""
                onError={event => { event.currentTarget.hidden = true; }} />
            </div>}
            <div className="move-title-poster"><PosterArtwork src={request.title.posterPath} type={request.title.type} /></div>
            <div className="move-title-copy">
              <div className="move-title-kicker"><CineGeekFrames aria-hidden="true" />Move to list</div>
              <Dialog.Title>{request.title.title}</Dialog.Title>
              <p>{request.title.type === "tv" ? "TV series" : "Movie"}{request.title.year ? " · " + request.title.year : ""}</p>
            </div>
            <Dialog.Close className="move-title-close" aria-label="Cancel move"><X size={14} aria-hidden="true" /></Dialog.Close>
          </header>
          <div className="move-title-choices">
            {shelves.map(destinationRow)}
            {personalLists.length > 0 && <>
              <h3>My lists <span>On this device</span></h3>
              {personalLists.map(destinationRow)}
            </>}
          </div>
          <Dialog.Description className={request.fromHold ? "move-title-hint" : "sr-only"}>
            {request.fromHold && <Pointer size={13} aria-hidden="true" />}
            {request.fromHold ? "Slide and release, or tap a list." : "Choose a destination list."}
          </Dialog.Description>
        </Dialog.Content>
      </div>
    </Dialog.Portal>
  </Dialog.Root>;
}
