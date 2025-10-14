import { useState } from "react";
import { Film } from "lucide-react";
import PosterRow from "@/components/PosterRow";
import TitleDetailModal from "@/components/TitleDetailModal";

interface Title {
  id: number;
  title: string;
  type: "movie" | "tv";
  posterPath: string;
  year?: number;
  progress?: number;
}

const Index = () => {
  const [selectedTitle, setSelectedTitle] = useState<Title | null>(null);
  const [watchList, setWatchList] = useState<Title[]>([
    { id: 1, title: "Inception", type: "movie", posterPath: "https://image.tmdb.org/t/p/w500/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg", year: 2010 },
    { id: 2, title: "Breaking Bad", type: "tv", posterPath: "https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg", year: 2008 },
    { id: 3, title: "The Dark Knight", type: "movie", posterPath: "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg", year: 2008 },
    { id: 4, title: "Stranger Things", type: "tv", posterPath: "https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg", year: 2016 },
    { id: 5, title: "Interstellar", type: "movie", posterPath: "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg", year: 2014 },
  ]);
  const [currentlyWatching, setCurrentlyWatching] = useState<Title[]>([
    { id: 6, title: "The Office", type: "tv", posterPath: "https://image.tmdb.org/t/p/w500/7DJKHzAi83BmQrWLrYYOqcoKfhR.jpg", year: 2005, progress: 45 },
    { id: 7, title: "Parasite", type: "movie", posterPath: "https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg", year: 2019, progress: 67 },
    { id: 8, title: "The Crown", type: "tv", posterPath: "https://image.tmdb.org/t/p/w500/1M876KPjulVwppEpldhdc8V4o68.jpg", year: 2016, progress: 23 },
  ]);

  const handleAddToWatchList = (title: Title) => {
    if (!watchList.find(item => item.id === title.id)) {
      setWatchList([...watchList, title]);
    }
  };

  const handleAddToCurrentlyWatching = (title: Title) => {
    if (!currentlyWatching.find(item => item.id === title.id)) {
      setCurrentlyWatching([...currentlyWatching, title]);
    }
  };


  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent flex items-center gap-2">
              <Film className="h-6 w-6 text-primary" />
              CineDraft
            </h1>
            <div className="flex items-center gap-4">
              <div className="text-sm text-muted-foreground">
                <span className="text-primary font-semibold">1,250</span> Coins
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 space-y-12">
        {/* Watch List Row */}
        <PosterRow 
          title="Watch List" 
          items={watchList}
          onPosterClick={setSelectedTitle}
          onAddClick={() => {/* TODO: Add search modal */}}
        />

        {/* Currently Watching Row */}
        <PosterRow 
          title="Currently Watching" 
          items={currentlyWatching}
          onPosterClick={setSelectedTitle}
          onAddClick={() => {/* TODO: Add search modal */}}
        />
      </main>

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
    </div>
  );
};

export default Index;
