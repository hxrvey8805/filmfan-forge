import { useContext, useState, useEffect, useMemo, useRef } from "react";
import { GeekViewer } from "@/hooks/use-geek-outfit";
import { saveBookmark, startingPosition } from "@/lib/viewing-bookmark";
import { ContentLoading } from "@/components/ContentLoading";
import { WatchingSpotlight } from "@/components/WatchingSpotlight";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MoveTitleMenu, type MoveRequest, type MoveTarget, type ShelfId } from "@/components/MoveTitleMenu";
import { homeListKey, readLists, writeLists } from "@/lib/home-list-storage";
import { usePosterOrder } from "@/hooks/use-poster-order";
import PosterRow from "@/components/PosterRow";
import TitleDetailModal from "@/components/TitleDetailModal";
import SearchModal from "@/components/SearchModal";
import CustomFilterDialog from "@/components/CustomFilterDialog";
import type { LibraryShelf } from "@/lib/list-sources";
import { HomeLists } from "@/components/HomeLists";
import { titleKey } from "@/lib/home-lists";
import { addLibraryTitle, moveLibraryTitle, LibraryConflictError } from "@/lib/library-title-service";
import { SHELF_LABELS } from "@/lib/library-shelves";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";

interface Title {
  id: number;
  title: string;
  type: "movie" | "tv";
  posterPath: string;
  year?: number;
  progress?: number;
}

interface CustomFilter {
  id: string;
  name: string;
  criteria: string;
  inspirationType: string;
}

const Index = () => {
  const viewer = useContext(GeekViewer);
  const navigate = useNavigate();
  const [chosenShelf, setShelf] = useState<string>();
  const [detail, setDetail] = useState<{
    title: Title; source?: "favourite" | "watchlist" | "watching" | "watched";
  } | null>(null);
  const openWatching = (title: Title) => {
    saveBookmark(viewer, startingPosition(viewer, title));
    setDetail({ title, source: "watching" });
  };
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchModalType, setSearchModalType] = useState<ShelfId | "companion">("companion");
  const [favouritesItems, setFavourites] = useState<Title[]>([]);
  const [watchListItems, setWatchList] = useState<Title[]>([]);
  const [currentlyWatchingItems, setCurrentlyWatching] = useState<Title[]>([]);
  const [watchedItems, setWatched] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);
  const [watchListFilter, setWatchListFilter] = useState<string>("all");
  const [favouritesFilter, setFavouritesFilter] = useState<string>("all");
  const [currentlyWatchingFilter, setCurrentlyWatchingFilter] = useState<string>("all");
  const [watchedFilter, setWatchedFilter] = useState<string>("all");
  const [customFilters, setCustomFilters] = useState<CustomFilter[]>([]);
  const [customFilterDialogOpen, setCustomFilterDialogOpen] = useState(false);
  const [sortedWatchList, setSortedWatchList] = useState<Title[]>([]);
  const [isSorting, setIsSorting] = useState(false);

  const [accountId, setAccountId] = useState<string | null>(null);
  const [moveRequest, setMoveRequest] = useState<MoveRequest | null>(null);
  const favouriteOrder = usePosterOrder(favouritesItems, accountId, "shelf:favourite");
  const watchOrder = usePosterOrder(watchListItems, accountId, "shelf:watchlist");
  const watchingOrder = usePosterOrder(currentlyWatchingItems, accountId, "shelf:watching");
  const watchedOrder = usePosterOrder(watchedItems, accountId, "shelf:watched");
  const favourites = favouriteOrder.titles, watchList = watchOrder.titles;
  const currentlyWatching = watchingOrder.titles, watched = watchedOrder.titles;
  const moving = useRef(false);
  const libraryShelves = useMemo<LibraryShelf[]>(() => [
    { id: "shelf:watchlist", name: "Watch list", mode: "shelf", titles: watchList },
    { id: "shelf:watching", name: "Watching", mode: "shelf", titles: currentlyWatching },
    { id: "shelf:favourite", name: "Favourites", mode: "shelf", titles: favourites },
    { id: "shelf:watched", name: "Watched", mode: "shelf", titles: watched },
  ], [watchList, currentlyWatching, favourites, watched]);
  const openLibraryTitle = (title: Title) => {
    const contains = (items: Title[]) => items.some(item => titleKey(item) === titleKey(title));
    if (contains(currentlyWatching)) openWatching(title);
    else setDetail({ title, source: contains(watchList) ? "watchlist" : contains(watched) ? "watched" : contains(favourites) ? "favourite" : undefined });
  };

  useEffect(() => {
    checkAuth();
    loadCustomFilters();
  }, []);

  const loadCustomFilters = () => {
    const stored = localStorage.getItem("customFilters");
    if (stored) {
      try {
        setCustomFilters(JSON.parse(stored));
      } catch (error) {
        console.error("Error loading custom filters:", error);
      }
    }
  };

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/", { replace: true });
      return;
    }
    setAccountId(session.user.id);
    loadUserTitles();
  };

  const loadUserTitles = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("user_titles")
        .select("*")
        .eq("user_id", user.id);

      if (error) throw error;

      const favouriteItems = data
        ?.filter((item) => item.list_type === "favourite")
        .map((item) => ({
          id: item.title_id,
          title: item.title,
          type: item.type as "movie" | "tv",
          posterPath: item.poster_path,
          year: item.year,
        })) || [];

      const watchlistItems = data
        ?.filter((item) => item.list_type === "watchlist")
        .map((item) => ({
          id: item.title_id,
          title: item.title,
          type: item.type as "movie" | "tv",
          posterPath: item.poster_path,
          year: item.year,
        })) || [];

      const watchingItems = data
        ?.filter((item) => item.list_type === "watching")
        .map((item) => ({
          id: item.title_id,
          title: item.title,
          type: item.type as "movie" | "tv",
          posterPath: item.poster_path,
          year: item.year,
          progress: item.progress,
        })) || [];

      const watchedItems = data
        ?.filter((item) => item.list_type === "watched")
        .map((item) => ({
          id: item.title_id,
          title: item.title,
          type: item.type as "movie" | "tv",
          posterPath: item.poster_path,
          year: item.year,
        })) || [];

      setFavourites(favouriteItems);
      setWatchList(watchlistItems);
      setCurrentlyWatching(watchingItems);
      setWatched(watchedItems);
      setSortedWatchList(watchlistItems);
    } catch (error) {
      console.error("Error loading titles:", error);
      toast.error("Failed to load your lists");
    } finally {
      setLoading(false);
    }
  };

  const addToShelf = async (title: Title, destination: ShelfId) => {
    if (moving.current) return;
    moving.current = true;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.id !== accountId) return;
      await addLibraryTitle(user.id, title, destination);
      await loadUserTitles();
      toast.success(`Added “${title.title}” to ${SHELF_LABELS[destination]}`);
    } catch (error) {
      if (error instanceof LibraryConflictError) toast.info(error.message);
      else toast.error(`Couldn’t add to ${SHELF_LABELS[destination]}. Please try again.`);
    } finally { moving.current = false; }
  };
  const handleAddToFavourites = (title: Title) => addToShelf(title, "favourite");
  const handleAddToWatchList = (title: Title) => addToShelf(title, "watchlist");
  const handleAddToCurrentlyWatching = (title: Title) => addToShelf(title, "watching");
  const handleAddToWatched = (title: Title) => addToShelf(title, "watched");

  function openMove(source: string, title: Title, anchor: HTMLElement) {
    if (moving.current || !accountId) return;
    const targets: MoveTarget[] = libraryShelves.filter(s => s.id !== "shelf:" + source).map(s => ({
      id: s.id, label: s.name, already: s.titles.some(t => titleKey(t) === titleKey(title)),
    }));
    try {
      for (const list of readLists(homeListKey(accountId)).reverse()) {
        if (list.mode === "manual") targets.push({ id: list.id, label: list.name, personal: true, already: list.id === source || list.titles.some(t => titleKey(t) === titleKey(title)) });
      }
    } catch { toast.error("Your personal lists couldn’t be read on this device."); }
    setMoveRequest({ source, title, anchor, targets, sourceLabel: libraryShelves.find(s => s.id === "shelf:" + source)?.name ?? "this list" });
  }

  async function moveTitle(source: string, title: Title, target: MoveTarget) {
    if (moving.current || target.already) return;
    moving.current = true;
    setMoveRequest(null);
    let savedOnDevice = false;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.id !== accountId) { toast.error("Sign in again to move this title."); return; }
      const same = (t: Title) => titleKey(t) === titleKey(title);
      const shelf = libraryShelves.find(s => s.id === target.id);
      if (!target.personal && (!shelf || shelf.id === "shelf:" + source)) return;
      if (shelf?.titles.some(same)) { toast.info("This title is already in " + shelf.name + "."); return; }
      if (target.personal) {
        // A personal list is local. Save the destination first so a storage error cannot lose a title.
        const key = homeListKey(user.id), lists = readLists(key);
        const list = lists.find(l => l.id === target.id);
        if (!list || list.mode !== "manual") { toast.error("That list is no longer available."); return; }
        if (!list.titles.some(same)) writeLists(key, lists.map(l => l.id === list.id ? { ...list, titles: [...list.titles, title] } : l));
        savedOnDevice = true;
      }
      const destination = shelf?.id.slice("shelf:".length) as ShelfId | undefined;
      if (!libraryShelves.some(s => s.id === "shelf:" + source)) {
        if (destination) {
          await moveLibraryTitle(title, destination, null);
          savedOnDevice = true;
        }
        const key = homeListKey(user.id);
        writeLists(key, readLists(key).map(list => list.id !== source ? list : list.mode === "manual"
          ? {...list, titles:list.titles.filter(t => !same(t))}
          : {...list, excluded:[...new Set([...(list.excluded ?? []),titleKey(title)])]}));
        await loadUserTitles();
        toast.success("Moved “" + title.title + "” to " + target.label + ".");
        return;
      }
      const table = supabase.from("user_titles");
      // Assigning a shelf keeps compatible copies (e.g. Watching + Favourites).
      // The database removes conflicting statuses in this same transaction.
      const result = target.personal
        ? await table.delete().eq("user_id", user.id).eq("title_id", title.id).eq("type", title.type)
          .eq("list_type", source).select("id").maybeSingle()
        : { data: await moveLibraryTitle(title, destination!, source as ShelfId), error: null };
      if (result.error) throw result.error;
      if (!result.data) {
        await loadUserTitles();
        toast.info(savedOnDevice ? "Saved to " + target.label + ". Your shelves have been refreshed." : "This title changed elsewhere. Your shelves have been refreshed.");
        return;
      }
      // Refresh every shelf, including compatible copies and preserved progress.
      await loadUserTitles();
      setShelf(source);
      toast.success((target.personal ? "Moved “" : "Saved “") + title.title + "” to " + target.label + ".");
    } catch {
      toast.error(savedOnDevice ? "Saved to " + target.label + ", but the shelf move couldn’t be confirmed. You can retry safely." : "Couldn’t move this title. Please try again.");
    } finally { moving.current = false; }
  }

  const handleDeleteFromFavourites = async (title: Title) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("user_titles").delete()
        .eq("user_id", user.id).eq("title_id", title.id).eq("type", title.type).eq("list_type", "favourite");
      if (error) throw error;
      setFavourites(favourites.filter((item) => titleKey(item) !== titleKey(title)));
      toast.success(`Removed "${title.title}" from Favourites`);
    } catch (error) {
      console.error("Error removing from favourites:", error);
      toast.error("Failed to remove from Favourites");
    }
  };

  const handleDeleteFromWatchList = async (title: Title) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("user_titles").delete()
        .eq("user_id", user.id).eq("title_id", title.id).eq("type", title.type).eq("list_type", "watchlist");
      if (error) throw error;
      const updatedList = watchList.filter((item) => titleKey(item) !== titleKey(title));
      setWatchList(updatedList);
      setSortedWatchList(updatedList);
      toast.success(`Removed "${title.title}" from Watch List`);
    } catch (error) {
      console.error("Error removing from watchlist:", error);
      toast.error("Failed to remove from Watch List");
    }
  };

  const handleDeleteFromCurrentlyWatching = async (title: Title) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("user_titles").delete()
        .eq("user_id", user.id).eq("title_id", title.id).eq("type", title.type).eq("list_type", "watching");
      if (error) throw error;
      setCurrentlyWatching(currentlyWatching.filter(item => titleKey(item) !== titleKey(title)));
      toast.success(`Removed "${title.title}" from Currently Watching`);
    } catch (error) {
      console.error("Error removing from watching:", error);
      toast.error("Failed to remove from Currently Watching");
    }
  };

  const handleDeleteFromWatched = async (title: Title) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("user_titles").delete()
        .eq("user_id", user.id).eq("title_id", title.id).eq("type", title.type).eq("list_type", "watched");
      if (error) throw error;
      setWatched(watched.filter((item) => titleKey(item) !== titleKey(title)));
      toast.success(`Removed "${title.title}" from Watched`);
    } catch (error) {
      console.error("Error removing from watched:", error);
      toast.error("Failed to remove from Watched");
    }
  };

  function removeRequestedTitle() {
    if (!moveRequest || !accountId) return;
    const { source, title } = moveRequest;
    setMoveRequest(null);
    const remove = {watchlist:handleDeleteFromWatchList, watching:handleDeleteFromCurrentlyWatching,
      favourite:handleDeleteFromFavourites, watched:handleDeleteFromWatched}[source];
    if (remove) { void remove(title); return; }
    try {
      const key = homeListKey(accountId);
      writeLists(key, readLists(key).map(list => list.id !== source ? list : list.mode === "manual"
        ? {...list, titles:list.titles.filter(t => titleKey(t) !== titleKey(title))}
        : {...list, excluded:[...new Set([...(list.excluded ?? []),titleKey(title)])]}));
      toast.success("Removed from this list");
    } catch { toast.error("Couldn’t save your list on this device."); }
  }

  const openSearchModal = (type: ShelfId | "companion") => {
    setSearchModalType(type);
    setSearchModalOpen(true);
  };

  const handleFilterAdded = (filter: CustomFilter) => {
    const updated = [...customFilters, filter];
    setCustomFilters(updated);
    localStorage.setItem("customFilters", JSON.stringify(updated));
  };

  const handleDeleteCustomFilter = (filterId: string) => {
    const updated = customFilters.filter(f => f.id !== filterId);
    setCustomFilters(updated);
    localStorage.setItem("customFilters", JSON.stringify(updated));
    if (watchListFilter === filterId) {
      setWatchListFilter("all");
      setSortedWatchList(watchList);
    }
    toast.success("Custom filter deleted");
  };

  const handleFilterChange = async (value: string) => {
    setWatchListFilter(value);

    const customFilter = customFilters.find(f => f.id === value);

    if (customFilter) {
      setIsSorting(true);
      try {
        const { data, error } = await supabase.functions.invoke("sort-by-custom-filter", {
          body: {
            titles: watchList,
            criteria: customFilter.criteria,
            inspirationType: customFilter.inspirationType,
          },
        });
        if (error) throw error;
        if (!data || !data.sortedTitles) throw new Error("Invalid response");
        setSortedWatchList(data.sortedTitles);
        toast.success(`Sorted by: ${customFilter.name}`);
      } catch (error) {
        console.error("Error sorting with custom filter:", error);
        toast.error("Failed to sort with custom filter");
        setSortedWatchList(watchList);
      } finally {
        setIsSorting(false);
      }
    } else {
      setSortedWatchList(watchList);
    }
  };

  const handleFavouritesFilterChange = (value: string) => setFavouritesFilter(value);
  const handleCurrentlyWatchingFilterChange = (value: string) => setCurrentlyWatchingFilter(value);
  const handleWatchedFilterChange = (value: string) => setWatchedFilter(value);

  const handleSearchSelect = async (title: Title) => {
    if (searchModalType === "companion") {
      openLibraryTitle(title);
      return;
    }
    setShelf(searchModalType);
    if (searchModalType === "favourite") handleAddToFavourites(title);
    else if (searchModalType === "watchlist") await handleAddToWatchList(title);
    else if (searchModalType === "watching") handleAddToCurrentlyWatching(title);
    else if (searchModalType === "watched") handleAddToWatched(title);
  };

  if (loading) return <ContentLoading label="Loading your library" />;

  const shelfSizes = [
    ["watchlist", watchList.length], ["watching", currentlyWatching.length],
    ["favourite", favourites.length], ["watched", watched.length],
  ] as const;
  const shelf = chosenShelf ?? shelfSizes.find(([, count]) => count > 0)?.[0] ?? "watchlist";

  // Filter displayed items
  const displayedWatchList = watchListFilter === "all" ? watchList
    : watchListFilter === "movie" || watchListFilter === "tv"
    ? watchList.filter(item => item.type === watchListFilter)
    : sortedWatchList;

  const displayedFavourites = favouritesFilter === "all"
    ? favourites
    : favouritesFilter === "movie" || favouritesFilter === "tv"
    ? favourites.filter(item => item.type === favouritesFilter)
    : favourites;

  const displayedCurrentlyWatching = currentlyWatchingFilter === "all"
    ? currentlyWatching
    : currentlyWatchingFilter === "movie" || currentlyWatchingFilter === "tv"
    ? currentlyWatching.filter(item => item.type === currentlyWatchingFilter)
    : currentlyWatching;

  const displayedWatched = watchedFilter === "all"
    ? watched
    : watchedFilter === "movie" || watchedFilter === "tv"
    ? watched.filter(item => item.type === watchedFilter)
    : watched;

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in max-w-7xl mx-auto relative">
      <>
        <div className="home-heading">
          <div className="min-w-0"><p className="eyebrow">Home</p><h1 className="screen-heading mt-1.5">What’s on next?</h1></div>
          <button onClick={() => openSearchModal("companion")} className="home-search" aria-label="Find a title to ask your geek">
            <Search size={19} aria-hidden="true" /><span className="hidden sm:inline">Ask your geek</span>
          </button>
        </div>
        <WatchingSpotlight titles={currentlyWatching} onFindTitle={() => openSearchModal("watching")}
          onOpen={openWatching} />
      </>

      <section aria-label="Your library" className="home-library">
        <div className="flex items-center justify-between"><h2 className="text-xl sm:text-2xl font-semibold tracking-tight">Your library</h2><a href="#my-lists" className="px-2 py-2 text-sm text-primary">My lists ↓</a></div>
        <Tabs value={shelf} onValueChange={setShelf}>
          <TabsList aria-label="Library shelves" className="library-tabs">
            {([["watchlist", "Watch list"], ["watching", "Watching"], ["favourite", "Favourites"], ["watched", "Watched"]] as const)
              .map(([id, label]) => <TabsTrigger key={id} value={id} className="library-tab">{label}</TabsTrigger>)}
          </TabsList>
          <TabsContent value="watching" className="mt-3">
            <PosterRow
              title="Currently Watching"
              items={displayedCurrentlyWatching}
              onPosterClick={title => openWatching(title)}
              onAddClick={() => openSearchModal("watching")}
              onMoveRequest={(title, anchor) => openMove("watching", title, anchor)}
              onReorder={watchingOrder.reorder}
              onDeleteClick={handleDeleteFromCurrentlyWatching}
              filterValue={currentlyWatchingFilter}
              onFilterChange={handleCurrentlyWatchingFilterChange}
            />
          </TabsContent>
          <TabsContent value="watchlist" className="mt-3">
            <PosterRow
              title="Watch List"
              items={isSorting ? [] : displayedWatchList}
              onPosterClick={title => setDetail({ title, source: "watchlist" })}
              onAddClick={() => openSearchModal("watchlist")}
              onMoveRequest={(title, anchor) => openMove("watchlist", title, anchor)}
              onReorder={titles => {
                if (watchOrder.reorder(titles) && !["all", "movie", "tv"].includes(watchListFilter)) setSortedWatchList(titles);
              }}
              onDeleteClick={handleDeleteFromWatchList}
              filterValue={watchListFilter}
              onFilterChange={handleFilterChange}
              customFilters={customFilters}
              onAddCustomFilter={() => setCustomFilterDialogOpen(true)}
              onDeleteCustomFilter={handleDeleteCustomFilter}
            />
          </TabsContent>
          <TabsContent value="favourite" className="mt-3">
            <PosterRow
              title="Favourites"
              items={displayedFavourites}
              onPosterClick={title => setDetail({ title, source: "favourite" })}
              onAddClick={() => openSearchModal("favourite")}
              onMoveRequest={(title, anchor) => openMove("favourite", title, anchor)}
              onReorder={favouriteOrder.reorder}
              onDeleteClick={handleDeleteFromFavourites}
              filterValue={favouritesFilter}
              onFilterChange={handleFavouritesFilterChange}
            />
          </TabsContent>
          <TabsContent value="watched" className="mt-3">
            <PosterRow
              title="Watched"
              items={displayedWatched}
              onPosterClick={title => setDetail({ title, source: "watched" })}
              onAddClick={() => openSearchModal("watched")}
              onMoveRequest={(title, anchor) => openMove("watched", title, anchor)}
              onReorder={watchedOrder.reorder}
              onDeleteClick={handleDeleteFromWatched}
              filterValue={watchedFilter}
              onFilterChange={handleWatchedFilterChange}
            />
          </TabsContent>
        </Tabs>
      </section>

      {accountId && <HomeLists key={accountId} viewer={accountId} shelves={libraryShelves} onTitleActions={openMove} onOpen={openLibraryTitle} />}

      {moveRequest && <MoveTitleMenu request={moveRequest} onClose={() => setMoveRequest(null)}
        onMove={target => void moveTitle(moveRequest.source, moveRequest.title, target)}
        onRemove={removeRequestedTitle} />}

      {/* Title Detail Modal */}
      {detail && (
        <TitleDetailModal
          title={detail.title}
          open
          onOpenChange={(open) => !open && setDetail(null)}
          onAddToFavourites={handleAddToFavourites}
          onAddToWatchList={handleAddToWatchList}
          onAddToCurrentlyWatching={handleAddToCurrentlyWatching}
          onAddToWatched={handleAddToWatched}
          onMoveToCurrentlyWatching={title => void moveTitle("watchlist", title, { id: "shelf:watching", label: "Watching" })}
          onMoveToWatched={title => void moveTitle("watching", title, { id: "shelf:watched", label: "Watched" })}
          sourceList={detail.source}
        />
      )}

      {/* Search Modal */}
      <SearchModal
        open={searchModalOpen}
        onOpenChange={setSearchModalOpen}
        onSelect={handleSearchSelect}
        listType={searchModalType}
      />

      {/* Custom Filter Dialog */}
      <CustomFilterDialog
        open={customFilterDialogOpen}
        onOpenChange={setCustomFilterDialogOpen}
        onFilterAdded={handleFilterAdded}
      />

    </div>
  );
};

export default Index;
