import { useState, useEffect } from "react";
import { GlassesWithLenses } from "@/components/GlassesWithLenses";
import PosterRow from "@/components/PosterRow";
import TitleDetailModal from "@/components/TitleDetailModal";
import SearchModal from "@/components/SearchModal";
import CustomFilterDialog from "@/components/CustomFilterDialog";
import PersonalListDialog from "@/components/PersonalListDialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";

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

interface PersonalList {
  id: string;
  name: string;
  titleIds: number[];
}

const Index = () => {
  const navigate = useNavigate();
  const [selectedTitle, setSelectedTitle] = useState<Title | null>(null);
  const [selectedTitleSource, setSelectedTitleSource] = useState<"favourite" | "watchlist" | "watching" | "watched">("watchlist");
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchModalType, setSearchModalType] = useState<"favourite" | "watchlist" | "watching" | "watched">("watchlist");
  const [favourites, setFavourites] = useState<Title[]>([]);
  const [watchList, setWatchList] = useState<Title[]>([]);
  const [currentlyWatching, setCurrentlyWatching] = useState<Title[]>([]);
  const [watched, setWatched] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);
  const [watchListFilter, setWatchListFilter] = useState<string>("all");
  const [favouritesFilter, setFavouritesFilter] = useState<string>("all");
  const [currentlyWatchingFilter, setCurrentlyWatchingFilter] = useState<string>("all");
  const [watchedFilter, setWatchedFilter] = useState<string>("all");
  const [customFilters, setCustomFilters] = useState<CustomFilter[]>([]);
  const [customFilterDialogOpen, setCustomFilterDialogOpen] = useState(false);
  const [sortedWatchList, setSortedWatchList] = useState<Title[]>([]);
  const [isSorting, setIsSorting] = useState(false);

  // Personal list state
  const [personalLists, setPersonalLists] = useState<PersonalList[]>([]);
  const [personalListDialogOpen, setPersonalListDialogOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [pendingListName, setPendingListName] = useState("");
  const [selectedTitleIds, setSelectedTitleIds] = useState<number[]>([]);

  useEffect(() => {
    checkAuth();
    loadCustomFilters();
    loadPersonalLists();
  }, []);

  const loadPersonalLists = () => {
    const stored = localStorage.getItem("personalLists");
    if (stored) {
      try {
        setPersonalLists(JSON.parse(stored));
      } catch (error) {
        console.error("Error loading personal lists:", error);
      }
    }
  };

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
      navigate("/auth");
      return;
    }
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

  const handleAddToFavourites = async (title: Title) => {
    if (favourites.find(item => item.id === title.id)) {
      toast.info(`"${title.title}" is already in your Favourites`);
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("user_titles").insert({
        user_id: user.id, title_id: title.id, title: title.title, type: title.type,
        poster_path: title.posterPath, year: title.year, list_type: "favourite",
      });
      if (error) throw error;
      setFavourites([...favourites, title]);
      toast.success(`Added "${title.title}" to Favourites`);
    } catch (error) {
      console.error("Error adding to favourites:", error);
      toast.error("Failed to add to Favourites");
    }
  };

  const handleAddToWatchList = async (title: Title) => {
    if (watchList.find(item => item.id === title.id)) {
      toast.info(`"${title.title}" is already in your Watch List`);
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("user_titles").insert({
        user_id: user.id, title_id: title.id, title: title.title, type: title.type,
        poster_path: title.posterPath, year: title.year, list_type: "watchlist",
      });
      if (error) throw error;
      setWatchList([...watchList, title]);
      setSortedWatchList([...watchList, title]);
      toast.success(`Added "${title.title}" to Watch List`);
    } catch (error) {
      console.error("Error adding to watchlist:", error);
      toast.error("Failed to add to Watch List");
    }
  };

  const handleAddToCurrentlyWatching = async (title: Title) => {
    if (currentlyWatching.find(item => item.id === title.id)) {
      toast.info(`"${title.title}" is already in Currently Watching`);
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("user_titles").insert({
        user_id: user.id, title_id: title.id, title: title.title, type: title.type,
        poster_path: title.posterPath, year: title.year, list_type: "watching",
      });
      if (error) throw error;
      setCurrentlyWatching([...currentlyWatching, title]);
      toast.success(`Added "${title.title}" to Currently Watching`);
    } catch (error) {
      console.error("Error adding to watching:", error);
      toast.error("Failed to add to Currently Watching");
    }
  };

  const handleAddToWatched = async (title: Title) => {
    if (watched.find(item => item.id === title.id)) {
      toast.info(`"${title.title}" is already in your Watched list`);
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("user_titles").insert({
        user_id: user.id, title_id: title.id, title: title.title, type: title.type,
        poster_path: title.posterPath, year: title.year, list_type: "watched",
      });
      if (error) throw error;
      setWatched([...watched, title]);
      toast.success(`Added "${title.title}" to Watched`);
    } catch (error) {
      console.error("Error adding to watched:", error);
      toast.error("Failed to add to Watched");
    }
  };

  const handleMoveToCurrentlyWatching = async (title: Title) => {
    if (currentlyWatching.find(item => item.id === title.id)) {
      toast.info(`"${title.title}" is already in Currently Watching`);
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error: deleteError } = await supabase.from("user_titles").delete()
        .eq("user_id", user.id).eq("title_id", title.id).eq("list_type", "watchlist");
      if (deleteError) throw deleteError;
      const { error: insertError } = await supabase.from("user_titles").insert({
        user_id: user.id, title_id: title.id, title: title.title, type: title.type,
        poster_path: title.posterPath, year: title.year, list_type: "watching",
      });
      if (insertError) throw insertError;
      const updatedWatchList = watchList.filter((item) => item.id !== title.id);
      setWatchList(updatedWatchList);
      setSortedWatchList(updatedWatchList);
      setCurrentlyWatching([...currentlyWatching, title]);
      toast.success(`Moved "${title.title}" to Currently Watching`);
    } catch (error) {
      console.error("Error moving to currently watching:", error);
      toast.error("Failed to move to Currently Watching");
    }
  };

  const handleMoveToWatched = async (title: Title) => {
    if (watched.find(item => item.id === title.id)) {
      toast.info(`"${title.title}" is already in Watched`);
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error: deleteError } = await supabase.from("user_titles").delete()
        .eq("user_id", user.id).eq("title_id", title.id).eq("list_type", "watching");
      if (deleteError) throw deleteError;
      const { error: insertError } = await supabase.from("user_titles").insert({
        user_id: user.id, title_id: title.id, title: title.title, type: title.type,
        poster_path: title.posterPath, year: title.year, list_type: "watched",
      });
      if (insertError) throw insertError;
      setCurrentlyWatching(currentlyWatching.filter((item) => item.id !== title.id));
      setWatched([...watched, title]);
      toast.success(`Moved "${title.title}" to Watched`);
    } catch (error) {
      console.error("Error moving to watched:", error);
      toast.error("Failed to move to Watched");
    }
  };

  const handleDeleteFromFavourites = async (title: Title) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("user_titles").delete()
        .eq("user_id", user.id).eq("title_id", title.id).eq("list_type", "favourite");
      if (error) throw error;
      setFavourites(favourites.filter((item) => item.id !== title.id));
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
        .eq("user_id", user.id).eq("title_id", title.id).eq("list_type", "watchlist");
      if (error) throw error;
      const updatedList = watchList.filter((item) => item.id !== title.id);
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
        .eq("user_id", user.id).eq("title_id", title.id).eq("list_type", "watching");
      if (error) throw error;
      setCurrentlyWatching(currentlyWatching.filter(item => item.id !== title.id));
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
        .eq("user_id", user.id).eq("title_id", title.id).eq("list_type", "watched");
      if (error) throw error;
      setWatched(watched.filter((item) => item.id !== title.id));
      toast.success(`Removed "${title.title}" from Watched`);
    } catch (error) {
      console.error("Error removing from watched:", error);
      toast.error("Failed to remove from Watched");
    }
  };

  const openSearchModal = (type: "favourite" | "watchlist" | "watching" | "watched") => {
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

  // Personal list handlers
  const handlePersonalListCreated = (name: string) => {
    setPendingListName(name);
    setSelectedTitleIds([]);
    setSelectionMode(true);
    toast.info("Tap posters in your Watch List to add them to your list, then press Done.");
  };

  const handleToggleSelection = (titleId: number) => {
    setSelectedTitleIds(prev =>
      prev.includes(titleId)
        ? prev.filter(id => id !== titleId)
        : [...prev, titleId]
    );
  };

  const handleConfirmPersonalList = () => {
    if (selectedTitleIds.length === 0) {
      toast.error("Select at least one poster");
      return;
    }
    const newList: PersonalList = {
      id: `plist_${Date.now()}`,
      name: pendingListName,
      titleIds: selectedTitleIds,
    };
    const updated = [...personalLists, newList];
    setPersonalLists(updated);
    localStorage.setItem("personalLists", JSON.stringify(updated));
    setSelectionMode(false);
    setSelectedTitleIds([]);
    setPendingListName("");
    setWatchListFilter(newList.id);
    toast.success(`Created list "${newList.name}" with ${selectedTitleIds.length} titles`);
  };

  const handleCancelSelection = () => {
    setSelectionMode(false);
    setSelectedTitleIds([]);
    setPendingListName("");
  };

  const handleDeletePersonalList = (listId: string) => {
    const updated = personalLists.filter(l => l.id !== listId);
    setPersonalLists(updated);
    localStorage.setItem("personalLists", JSON.stringify(updated));
    if (watchListFilter === listId) {
      setWatchListFilter("all");
    }
    toast.success("Personal list deleted");
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

  const handleSearchSelect = (title: Title) => {
    if (searchModalType === "favourite") handleAddToFavourites(title);
    else if (searchModalType === "watchlist") handleAddToWatchList(title);
    else if (searchModalType === "watching") handleAddToCurrentlyWatching(title);
    else if (searchModalType === "watched") handleAddToWatched(title);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <GlassesWithLenses className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Filter displayed items
  const personalList = personalLists.find(l => l.id === watchListFilter);
  const displayedWatchList = personalList
    ? sortedWatchList.filter(item => personalList.titleIds.includes(item.id))
    : watchListFilter === "all"
    ? sortedWatchList
    : watchListFilter === "movie" || watchListFilter === "tv"
    ? sortedWatchList.filter(item => item.type === watchListFilter)
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
    <div className="space-y-8 animate-fade-in max-w-7xl mx-auto relative">
      {/* Selection Mode Banner */}
      {selectionMode && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Creating: {pendingListName}</span>
            <span className="text-sm opacity-80">({selectedTitleIds.length} selected)</span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleCancelSelection} className="text-primary-foreground hover:bg-primary-foreground/20">
              Cancel
            </Button>
            <Button size="sm" onClick={handleConfirmPersonalList} className="bg-primary-foreground text-primary hover:bg-primary-foreground/90">
              <Check className="h-4 w-4 mr-1" />
              Done
            </Button>
          </div>
        </div>
      )}

      {selectionMode && <div className="h-12" />}

      {/* Favourites Row */}
      <div className={selectionMode ? "opacity-30 select-none [&_button]:pointer-events-none" : ""}>
        <PosterRow 
          title="Favourites" 
          items={displayedFavourites}
          onPosterClick={(title) => {
            setSelectedTitle(title);
            setSelectedTitleSource("favourite");
          }}
          onAddClick={() => openSearchModal("favourite")}
          onDeleteClick={handleDeleteFromFavourites}
          filterValue={favouritesFilter}
          onFilterChange={handleFavouritesFilterChange}
        />
      </div>

      {/* Watch List Row */}
      <PosterRow 
        title="Watch List" 
        items={selectionMode ? sortedWatchList : (isSorting ? [] : displayedWatchList)}
        onPosterClick={(title) => {
          setSelectedTitle(title);
          setSelectedTitleSource("watchlist");
        }}
        onAddClick={selectionMode ? undefined : () => openSearchModal("watchlist")}
        onDeleteClick={selectionMode ? undefined : handleDeleteFromWatchList}
        filterValue={watchListFilter}
        onFilterChange={selectionMode ? undefined : handleFilterChange}
        customFilters={customFilters}
        onAddCustomFilter={() => setCustomFilterDialogOpen(true)}
        onDeleteCustomFilter={handleDeleteCustomFilter}
        personalLists={personalLists}
        onAddPersonalList={() => setPersonalListDialogOpen(true)}
        onDeletePersonalList={handleDeletePersonalList}
        selectionMode={selectionMode}
        selectedTitleIds={selectedTitleIds}
        onToggleSelection={handleToggleSelection}
      />

      {/* Currently Watching Row */}
      <div className={selectionMode ? "opacity-30 select-none [&_button]:pointer-events-none" : ""}>
        <PosterRow 
          title="Currently Watching" 
          items={displayedCurrentlyWatching}
          onPosterClick={(title) => {
            setSelectedTitle(title);
            setSelectedTitleSource("watching");
          }}
          onAddClick={() => openSearchModal("watching")}
          onDeleteClick={handleDeleteFromCurrentlyWatching}
          filterValue={currentlyWatchingFilter}
          onFilterChange={handleCurrentlyWatchingFilterChange}
        />
      </div>

      {/* Watched Row */}
      <div className={selectionMode ? "opacity-30 select-none [&_button]:pointer-events-none" : ""}>
        <PosterRow 
          title="Watched" 
          items={displayedWatched}
          onPosterClick={(title) => {
            setSelectedTitle(title);
            setSelectedTitleSource("watched");
          }}
          onAddClick={() => openSearchModal("watched")}
          onDeleteClick={handleDeleteFromWatched}
          filterValue={watchedFilter}
          onFilterChange={handleWatchedFilterChange}
        />
      </div>

      {/* Title Detail Modal */}
      {selectedTitle && (
        <TitleDetailModal
          title={selectedTitle}
          open={!!selectedTitle}
          onOpenChange={(open) => !open && setSelectedTitle(null)}
          onAddToFavourites={handleAddToFavourites}
          onAddToWatchList={handleAddToWatchList}
          onAddToCurrentlyWatching={handleAddToCurrentlyWatching}
          onAddToWatched={handleAddToWatched}
          onMoveToCurrentlyWatching={handleMoveToCurrentlyWatching}
          onMoveToWatched={handleMoveToWatched}
          sourceList={selectedTitleSource}
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

      {/* Personal List Dialog */}
      <PersonalListDialog
        open={personalListDialogOpen}
        onOpenChange={setPersonalListDialogOpen}
        onListCreated={handlePersonalListCreated}
      />
    </div>
  );
};

export default Index;
