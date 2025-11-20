import { useState, useEffect } from "react";
import { Glasses } from "lucide-react";
import PosterRow from "@/components/PosterRow";
import TitleDetailModal from "@/components/TitleDetailModal";
import SearchModal from "@/components/SearchModal";
import CustomFilterDialog from "@/components/CustomFilterDialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

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
    console.log("handleAddToFavourites called with:", title);
    
    if (favourites.find(item => item.id === title.id)) {
      console.log("Title already in favourites");
      toast.info(`"${title.title}" is already in your Favourites`);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      console.log("User:", user?.id);
      if (!user) {
        console.log("No user found!");
        return;
      }

      console.log("Inserting to database with list_type: favourite");
      const { error } = await supabase.from("user_titles").insert({
        user_id: user.id,
        title_id: title.id,
        title: title.title,
        type: title.type,
        poster_path: title.posterPath,
        year: title.year,
        list_type: "favourite",
      });

      if (error) {
        console.error("Database error:", error);
        throw error;
      }

      console.log("Successfully added to favourites");
      setFavourites([...favourites, title]);
      toast.success(`Added "${title.title}" to Favourites`);
    } catch (error) {
      console.error("Error adding to favourites:", error);
      const msg = (error as any)?.message || (typeof error === 'string' ? error : 'Failed to add to Favourites');
      toast.error(`Failed to add to Favourites: ${msg}`);
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
        user_id: user.id,
        title_id: title.id,
        title: title.title,
        type: title.type,
        poster_path: title.posterPath,
        year: title.year,
        list_type: "watchlist",
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
        user_id: user.id,
        title_id: title.id,
        title: title.title,
        type: title.type,
        poster_path: title.posterPath,
        year: title.year,
        list_type: "watching",
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
    console.log("handleAddToWatched called with:", title);
    
    if (watched.find(item => item.id === title.id)) {
      console.log("Title already in watched");
      toast.info(`"${title.title}" is already in your Watched list`);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      console.log("User:", user?.id);
      if (!user) {
        console.log("No user found!");
        return;
      }

      console.log("Inserting to database with list_type: watched");
      const { error } = await supabase.from("user_titles").insert({
        user_id: user.id,
        title_id: title.id,
        title: title.title,
        type: title.type,
        poster_path: title.posterPath,
        year: title.year,
        list_type: "watched",
      });

      if (error) {
        console.error("Database error:", error);
        throw error;
      }

      console.log("Successfully added to watched");
      setWatched([...watched, title]);
      toast.success(`Added "${title.title}" to Watched`);
    } catch (error) {
      console.error("Error adding to watched:", error);
      const msg = (error as any)?.message || (typeof error === 'string' ? error : 'Failed to add to Watched');
      toast.error(`Failed to add to Watched: ${msg}`);
    }
  };

  const handleMoveToCurrentlyWatching = async (title: Title) => {
    // Check if already in currently watching
    if (currentlyWatching.find(item => item.id === title.id)) {
      toast.info(`"${title.title}" is already in Currently Watching`);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      console.log("Moving title to currently watching:", title.title);

      // Delete from watchlist
      const { error: deleteError } = await supabase
        .from("user_titles")
        .delete()
        .eq("user_id", user.id)
        .eq("title_id", title.id)
        .eq("list_type", "watchlist");

      if (deleteError) {
        console.error("Delete error:", deleteError);
        throw deleteError;
      }

      console.log("Deleted from watchlist, now inserting to watching");

      // Add to currently watching
      const { error: insertError } = await supabase.from("user_titles").insert({
        user_id: user.id,
        title_id: title.id,
        title: title.title,
        type: title.type,
        poster_path: title.posterPath,
        year: title.year,
        list_type: "watching",
      });

      if (insertError) {
        console.error("Insert error:", insertError);
        throw insertError;
      }

      console.log("Successfully moved to currently watching");

      // Update state
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
    // Check if already in watched
    if (watched.find(item => item.id === title.id)) {
      toast.info(`"${title.title}" is already in Watched`);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Delete from currently watching
      const { error: deleteError } = await supabase
        .from("user_titles")
        .delete()
        .eq("user_id", user.id)
        .eq("title_id", title.id)
        .eq("list_type", "watching");

      if (deleteError) throw deleteError;

      // Add to watched
      const { error: insertError } = await supabase.from("user_titles").insert({
        user_id: user.id,
        title_id: title.id,
        title: title.title,
        type: title.type,
        poster_path: title.posterPath,
        year: title.year,
        list_type: "watched",
      });

      if (insertError) throw insertError;

      // Update state
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

      const { error } = await supabase
        .from("user_titles")
        .delete()
        .eq("user_id", user.id)
        .eq("title_id", title.id)
        .eq("list_type", "favourite");

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

      const { error } = await supabase
        .from("user_titles")
        .delete()
        .eq("user_id", user.id)
        .eq("title_id", title.id)
        .eq("list_type", "watchlist");

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

      const { error } = await supabase
        .from("user_titles")
        .delete()
        .eq("user_id", user.id)
        .eq("title_id", title.id)
        .eq("list_type", "watching");

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

      const { error } = await supabase
        .from("user_titles")
        .delete()
        .eq("user_id", user.id)
        .eq("title_id", title.id)
        .eq("list_type", "watched");

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

  const handleFilterChange = async (value: string) => {
    console.log("Filter changed to:", value);
    console.log("Available custom filters:", customFilters);
    setWatchListFilter(value);
    
    // Check if it's a custom filter
    const customFilter = customFilters.find(f => f.id === value);
    console.log("Found custom filter:", customFilter);
    
    if (customFilter) {
      console.log("Starting custom sort with:", {
        titleCount: watchList.length,
        criteria: customFilter.criteria,
        inspirationType: customFilter.inspirationType
      });
      
      setIsSorting(true);
      try {
        console.log("Invoking edge function...");
        const { data, error } = await supabase.functions.invoke("sort-by-custom-filter", {
          body: {
            titles: watchList,
            criteria: customFilter.criteria,
            inspirationType: customFilter.inspirationType,
          },
        });

        console.log("Edge function response:", { data, error });

        if (error) {
          console.error("Edge function error:", error);
          throw error;
        }
        
        if (!data || !data.sortedTitles) {
          throw new Error("Invalid response from edge function");
        }
        
        console.log("Setting sorted titles:", data.sortedTitles.length);
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
      console.log("Standard filter selected, resetting to original list");
      // Reset to original list for standard filters
      setSortedWatchList(watchList);
    }
  };

  const handleFavouritesFilterChange = (value: string) => {
    setFavouritesFilter(value);
  };

  const handleCurrentlyWatchingFilterChange = (value: string) => {
    setCurrentlyWatchingFilter(value);
  };

  const handleWatchedFilterChange = (value: string) => {
    setWatchedFilter(value);
  };

  const handleSearchSelect = (title: Title) => {
    if (searchModalType === "favourite") {
      handleAddToFavourites(title);
    } else if (searchModalType === "watchlist") {
      handleAddToWatchList(title);
    } else if (searchModalType === "watching") {
      handleAddToCurrentlyWatching(title);
    } else if (searchModalType === "watched") {
      handleAddToWatched(title);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Glasses className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const displayedWatchList = watchListFilter === "all" 
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
    <div className="space-y-8 animate-fade-in max-w-7xl mx-auto">
      {/* Favourites Row */}
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

      {/* Watch List Row */}
      <PosterRow 
        title="Watch List" 
        items={isSorting ? [] : displayedWatchList}
        onPosterClick={(title) => {
          setSelectedTitle(title);
          setSelectedTitleSource("watchlist");
        }}
        onAddClick={() => openSearchModal("watchlist")}
        onDeleteClick={handleDeleteFromWatchList}
        filterValue={watchListFilter}
        onFilterChange={handleFilterChange}
        customFilters={customFilters}
        onAddCustomFilter={() => setCustomFilterDialogOpen(true)}
        onDeleteCustomFilter={handleDeleteCustomFilter}
      />

      {/* Currently Watching Row */}
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

      {/* Watched Row */}
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
    </div>
  );
};

export default Index;
