import { titleKey, type LibraryTitle } from "./home-lists";

export const posterOrderKey = (viewer: string, list: string) => `cinegeek.poster-order.v1.${viewer}.${list}`;
export function readPosterOrder(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === "string" && /^(movie|tv):\d+$/.test(v)))] : [];
  } catch { return []; }
}
export function orderedTitles<T extends LibraryTitle>(items: T[], order: string[]): T[] {
  const positions = new Map(order.map((key, index) => [key, index]));
  return [...items].sort((a, b) => (positions.get(titleKey(a)) ?? Infinity) - (positions.get(titleKey(b)) ?? Infinity));
}
// Reordering a Movies/TV filter only changes its occupied slots. Hidden titles
// stay in place; a stale gesture can never add, remove, or duplicate a title.
export function reorderVisible<T extends LibraryTitle>(all: T[], visible: LibraryTitle[]): T[] {
  const lookup = new Map(all.map(item => [titleKey(item), item]));
  const keys = [...new Set(visible.map(titleKey))].filter(key => lookup.has(key));
  const affected = new Set(keys);
  let next = 0;
  return all.map(item => affected.has(titleKey(item)) ? lookup.get(keys[next++])! : item);
}
