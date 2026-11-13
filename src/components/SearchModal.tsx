import { useState } from "react";
import { Search, Clapperboard, Tv } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";

interface Title {
  id: number;
  title: string;
  type: "movie" | "tv";
  posterPath: string;
  year?: number;
}

interface SearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (title: Title) => void;
  listName?: string;
  listType: "companion" | "favourite" | "watchlist" | "watching" | "watched";
}

const SearchModal = ({ open, onOpenChange, onSelect, listType, listName }: SearchModalProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Title[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('search-content', {
        body: { query, type: 'both' }
      });

      if (error) throw error;
      
      if (data?.results) {
        setSearchResults(data.results);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelect = (title: Title) => {
    onSelect(title);
    setSearchQuery("");
    setSearchResults([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-32px)] max-w-2xl max-h-[85dvh] rounded-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {listType === "companion" ? "Ask your geek" : "Add to " + (
              listName ?? (listType === "favourite" ? "Favourites" :
              listType === "watchlist" ? "Watch List" : 
              listType === "watching" ? "Currently Watching" :
              "Watched"))
            }
          </DialogTitle>
          <DialogDescription>{listType === "companion" ? "Choose the movie or show you’re watching." : "Find a film or series for your library."}</DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search for movies or TV shows..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          <ScrollArea className="h-[min(400px,50dvh)]">
            {isSearching ? (
              <div className="text-center py-8 text-muted-foreground">
                Searching...
              </div>
            ) : searchResults.length > 0 ? (
              <div className="grid gap-3">
                {searchResults.map((result) => (
                  <button
                    key={result.type + ":" + result.id}
                    onClick={() => handleSelect(result)}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors text-left"
                  >
                    <img
                      src={result.posterPath}
                      alt={result.title}
                      className="w-12 h-16 object-cover rounded"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {result.type === "movie" ? (
                          <Clapperboard className="h-4 w-4 text-primary" />
                        ) : (
                          <Tv className="h-4 w-4 text-accent" />
                        )}
                        <h3 className="font-semibold">{result.title}</h3>
                      </div>
                      {result.year && (
                        <p className="text-sm text-muted-foreground">{result.year}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ) : searchQuery.length >= 2 ? (
              <div className="text-center py-8 text-muted-foreground">
                No results found
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Start typing to search...
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SearchModal;
