import type { HomeList } from "./home-lists";

export const homeListKey = (viewer: string) => "cinegeek.home-lists.v1." + viewer;
export const listChangeEvent = "cinegeek:home-lists-changed";

export function readLists(key: string): HomeList[] {
  const lists = JSON.parse(localStorage.getItem(key) ?? "[]");
  if (!Array.isArray(lists)) throw Error("Invalid list storage");
  return lists;
}

export function writeLists(key: string, lists: HomeList[]) {
  localStorage.setItem(key, JSON.stringify(lists));
  window.dispatchEvent(new CustomEvent(listChangeEvent, { detail: key }));
}
