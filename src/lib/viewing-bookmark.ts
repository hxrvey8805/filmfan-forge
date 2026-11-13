import { formatTimestamp, parseTimestamp, type ViewingPosition } from "../../supabase/functions/_shared/companion";

type TitleKey = { id: number; type: ViewingPosition["mediaType"] };
type Bookmark = { position: ViewingPosition; savedAt: number };
const tabBookmarks = new Map<string, Bookmark>();

function key(viewer: string, title: TitleKey) {
  return `cinegeek.position.v1.${viewer}.${title.type}.${title.id}`;
}

function validPosition(position: ViewingPosition, title: TitleKey) {
  return position.tmdbId === title.id && position.mediaType === title.type &&
    Number.isSafeInteger(position.seconds) && position.seconds >= 0 &&
    parseTimestamp(formatTimestamp(position.seconds)) === position.seconds &&
    (title.type === "movie"
      ? position.seasonNumber === undefined && position.episodeNumber === undefined
      : Number.isSafeInteger(position.seasonNumber) && position.seasonNumber! >= 0 &&
        Number.isSafeInteger(position.episodeNumber) && position.episodeNumber! >= 1);
}

export function readBookmark(viewer: string | null, title: TitleKey): Bookmark | null {
  if (!viewer) return null;
  const storageKey = key(viewer, title);
  const temporary = tabBookmarks.get(storageKey);
  if (temporary) return temporary;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    return saved?.position && validPosition(saved.position, title) && Number.isSafeInteger(saved.savedAt)
      ? saved : null;
  } catch { return null; }
}

export function startingPosition(viewer: string | null, title: TitleKey): ViewingPosition {
  return readBookmark(viewer, title)?.position ?? {
    tmdbId: title.id, mediaType: title.type, seconds: 0,
    ...(title.type === "tv" ? { seasonNumber: 1, episodeNumber: 1 } : {}),
  };
}

export function saveBookmark(viewer: string | null, position: ViewingPosition) {
  const title = { id: position.tmdbId, type: position.mediaType };
  if (!viewer || !validPosition(position, title)) return;
  const storageKey = key(viewer, title);
  const saved = { position, savedAt: Date.now() };
  try {
    localStorage.setItem(storageKey, JSON.stringify(saved));
    tabBookmarks.delete(storageKey);
  } catch { tabBookmarks.set(storageKey, saved); }
}
