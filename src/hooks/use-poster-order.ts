import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { type LibraryTitle, titleKey } from "@/lib/home-lists";
import { orderedTitles, posterOrderKey, readPosterOrder, reorderVisible } from "@/lib/poster-order";

const changed = "cinegeek:poster-order";
export function usePosterOrder<T extends LibraryTitle>(items: T[], viewer: string | null, list: string) {
  const key = viewer ? posterOrderKey(viewer, list) : null;
  const [saved, setSaved] = useState(() => ({ key, order: key ? readPosterOrder(key) : [] }));
  const order = saved.key === key ? saved.order : key ? readPosterOrder(key) : [];
  const titles = useMemo(() => orderedTitles(items, order), [items, order]);
  useEffect(() => {
    const reload = () => setSaved({ key, order: key ? readPosterOrder(key) : [] });
    const storage = (event: StorageEvent) => { if (event.key === key || event.key === null) reload(); };
    const local = (event: Event) => { if ((event as CustomEvent).detail === key) reload(); };
    reload();
    window.addEventListener("storage", storage); window.addEventListener(changed, local);
    return () => { window.removeEventListener("storage", storage); window.removeEventListener(changed, local); };
  }, [key]);
  function reorder(visible: LibraryTitle[]) {
    if (!key) return false;
    const next = reorderVisible(titles, visible).map(titleKey);
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setSaved({ key, order: next });
      window.dispatchEvent(new CustomEvent(changed, { detail: key }));
      return true;
    } catch { toast.error("Couldn’t save that order on this device. Please try again."); return false; }
  }
  return { titles, reorder };
}
