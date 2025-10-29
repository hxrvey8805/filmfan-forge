import { useState, useEffect } from "react";
import { Film } from "lucide-react";
import PosterRow from "@/components/PosterRow";
import TitleDetailModal from "@/components/TitleDetailModal";
import SearchModal from "@/components/SearchModal";
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

const Index = () => {
  const navigate = useNavigate();
  const [selectedTitle, setSelectedTitle] = useState<Title | null>(null);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchModalType, setSearchModalType] = useState<"watchlist" | "watching">("watchlist");
  const [watchList, setWatchList] = useState<Title[]>([]);
  const [currentlyWatching, setCurrentlyWatching] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);
  const [watchListFilter, setWatchListFilter] = useState<string>("all");

  useEffect(() => {
    checkAuth();
  }, []);

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

      setWatchList(watchlistItems);
      setCurrentlyWatching(watchingItems);
    } catch (error) {
      console.error("Error loading titles:", error);
      toast.error("Failed to load your lists");
    } finally {
      setLoading(false);
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

      setWatchList(watchList.filter(item => item.id !== title.id));
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

  const openSearchModal = (type: "watchlist" | "watching") => {
    setSearchModalType(type);
    setSearchModalOpen(true);
  };

  const handleSearchSelect = (title: Title) => {
    if (searchModalType === "watchlist") {
      handleAddToWatchList(title);
    } else {
      handleAddToCurrentlyWatching(title);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Film className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const filteredWatchList = watchListFilter === "all" 
    ? watchList 
    : watchList.filter(item => item.type === watchListFilter);

  return (
    <div className="space-y-8 animate-fade-in max-w-7xl mx-auto">
      {/* Watch List Row */}
      <PosterRow 
        title="Watch List" 
        items={filteredWatchList}
        onPosterClick={setSelectedTitle}
        onAddClick={() => openSearchModal("watchlist")}
        onDeleteClick={handleDeleteFromWatchList}
        filterValue={watchListFilter}
        onFilterChange={setWatchListFilter}
      />

      {/* Currently Watching Row */}
      <PosterRow 
        title="Currently Watching" 
        items={currentlyWatching}
        onPosterClick={setSelectedTitle}
        onAddClick={() => openSearchModal("watching")}
        onDeleteClick={handleDeleteFromCurrentlyWatching}
      />

      {/* Title Detail Modal */}
      {selectedTitle && (
        <TitleDetailModal
          title={selectedTitle}
          open={!!selectedTitle}
          onOpenChange={(open) => !open && setSelectedTitle(null)}
          onAddToWatchList={handleAddToWatchList}
          onAddToCurrentlyWatching={handleAddToCurrentlyWatching}
        />
      )}

      {/* Search Modal */}
      <SearchModal
        open={searchModalOpen}
        onOpenChange={setSearchModalOpen}
        onSelect={handleSearchSelect}
        listType={searchModalType}
      />
    </div>
  );
};

export default Index;
