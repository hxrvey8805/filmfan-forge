import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Film } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import PosterRow from "@/components/PosterRow";
import TitleDetailModal from "@/components/TitleDetailModal";
import SearchModal from "@/components/SearchModal";
import { toast } from "sonner";

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
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check authentication and load data
    const initializeAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/auth");
        return;
      }

      setUserId(session.user.id);
      await loadUserTitles(session.user.id);
      setLoading(false);
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUserId(session.user.id);
        loadUserTitles(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const loadUserTitles = async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from("user_titles")
        .select("*")
        .eq("user_id", uid);

      if (error) throw error;

      const watchlist = data
        ?.filter((item) => item.list_type === "watchlist")
        .map((item) => ({
          id: item.title_id,
          title: item.title,
          type: item.type as "movie" | "tv",
          posterPath: item.poster_path,
          year: item.year,
          progress: item.progress,
        })) || [];

      const watching = data
        ?.filter((item) => item.list_type === "watching")
        .map((item) => ({
          id: item.title_id,
          title: item.title,
          type: item.type as "movie" | "tv",
          posterPath: item.poster_path,
          year: item.year,
          progress: item.progress,
        })) || [];

      setWatchList(watchlist);
      setCurrentlyWatching(watching);
    } catch (error: any) {
      toast.error("Failed to load your lists");
      console.error(error);
    }
  };

  const handleAddToWatchList = async (title: Title) => {
    if (!userId) return;

    if (watchList.find(item => item.id === title.id)) {
      toast.info(`"${title.title}" is already in your Watch List`);
      return;
    }

    try {
      const { error } = await supabase.from("user_titles").insert({
        user_id: userId,
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
    } catch (error: any) {
      toast.error("Failed to add to Watch List");
      console.error(error);
    }
  };

  const handleAddToCurrentlyWatching = async (title: Title) => {
    if (!userId) return;

    if (currentlyWatching.find(item => item.id === title.id)) {
      toast.info(`"${title.title}" is already in Currently Watching`);
      return;
    }

    try {
      const { error } = await supabase.from("user_titles").insert({
        user_id: userId,
        title_id: title.id,
        title: title.title,
        type: title.type,
        poster_path: title.posterPath,
        year: title.year,
        progress: title.progress,
        list_type: "watching",
      });

      if (error) throw error;

      setCurrentlyWatching([...currentlyWatching, title]);
      toast.success(`Added "${title.title}" to Currently Watching`);
    } catch (error: any) {
      toast.error("Failed to add to Currently Watching");
      console.error(error);
    }
  };

  const handleDeleteFromWatchList = async (title: Title) => {
    if (!userId) return;

    try {
      const { error } = await supabase
        .from("user_titles")
        .delete()
        .eq("user_id", userId)
        .eq("title_id", title.id)
        .eq("list_type", "watchlist");

      if (error) throw error;

      setWatchList(watchList.filter(item => item.id !== title.id));
      toast.success(`Removed "${title.title}" from Watch List`);
    } catch (error: any) {
      toast.error("Failed to remove from Watch List");
      console.error(error);
    }
  };

  const handleDeleteFromCurrentlyWatching = async (title: Title) => {
    if (!userId) return;

    try {
      const { error } = await supabase
        .from("user_titles")
        .delete()
        .eq("user_id", userId)
        .eq("title_id", title.id)
        .eq("list_type", "watching");

      if (error) throw error;

      setCurrentlyWatching(currentlyWatching.filter(item => item.id !== title.id));
      toast.success(`Removed "${title.title}" from Currently Watching`);
    } catch (error: any) {
      toast.error("Failed to remove from Currently Watching");
      console.error(error);
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
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="space-y-8 animate-fade-in max-w-7xl mx-auto">
      {/* Watch List Row */}
      <PosterRow 
        title="Watch List" 
        items={watchList}
        onPosterClick={setSelectedTitle}
        onAddClick={() => openSearchModal("watchlist")}
        onDeleteClick={handleDeleteFromWatchList}
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
