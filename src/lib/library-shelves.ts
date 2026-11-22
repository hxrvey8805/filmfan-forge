export type LibraryShelfId = 'watchlist' | 'watching' | 'favourite' | 'watched';
export const SHELF_LABELS: Record<LibraryShelfId,string> = {
  watchlist:'Watchlist', watching:'Watching', favourite:'Favourites', watched:'Watched',
};
export const SHELF_CONFLICTS: Record<LibraryShelfId,LibraryShelfId[]> = {
  watchlist:['watching','watched','favourite'], watching:['watchlist','watched'],
  watched:['watchlist','watching'], favourite:['watchlist'],
};
export function conflictingShelf(destination: LibraryShelfId, memberships: string[]): LibraryShelfId | undefined {
  if (memberships.includes(destination)) return destination;
  return SHELF_CONFLICTS[destination].find(shelf => memberships.includes(shelf));
}
export function shelfConflictMessage(title: string, existing: LibraryShelfId, destination: LibraryShelfId) {
  return existing === destination ? `“${title}” is already in ${SHELF_LABELS[existing]}.`
    : `“${title}” is in ${SHELF_LABELS[existing]}. Remove it there first, or use its three-dot menu to move it.`;
}
