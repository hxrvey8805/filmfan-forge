import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Send, Clock, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ContentItem {
  title: string;
  type: "tv" | "movie";
  year?: number | null;
  seasons?: number;
  id: number;
  posterPath?: string | null;
}

interface Message {
  id: number;
  question: string;
  answer: string;
  context: string;
  timestamp: string;
}

const Companion = () => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [searchResults, setSearchResults] = useState<ContentItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [seasons, setSeasons] = useState<{ seasonNumber: number; name: string; episodeCount: number }[]>([]);
  const [episodes, setEpisodes] = useState<{ episodeNumber: number; name: string; runtime: number }[]>([]);
  const [selectedSeason, setSelectedSeason] = useState("");
  const [selectedEpisode, setSelectedEpisode] = useState("");
  const [timestampMinutes, setTimestampMinutes] = useState([30]); // Default 30 minutes
  const [maxRuntime, setMaxRuntime] = useState(180); // Default 3 hours
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  // Search TMDB when query changes
  useEffect(() => {
    const searchContent = async () => {
      if (!searchQuery || searchQuery.length < 2) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const { data, error } = await supabase.functions.invoke('search-content', {
          body: { query: searchQuery }
        });

        if (error) throw error;
        setSearchResults(data.results || []);
      } catch (error) {
        console.error('Error searching content:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    const timeoutId = setTimeout(searchContent, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // Fetch seasons when TV show is selected
  useEffect(() => {
    const fetchSeasons = async () => {
      if (!selectedContent || selectedContent.type !== 'tv') {
        setSeasons([]);
        setEpisodes([]);
        setSelectedSeason("");
        setSelectedEpisode("");
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('search-content', {
          body: { tvId: selectedContent.id }
        });

        if (error) throw error;
        setSeasons(data.seasons || []);
      } catch (error) {
        console.error('Error fetching seasons:', error);
        setSeasons([]);
      }
    };

    fetchSeasons();
  }, [selectedContent]);

  // Fetch episodes when season is selected
  useEffect(() => {
    const fetchEpisodes = async () => {
      if (!selectedContent || !selectedSeason || selectedContent.type !== 'tv') {
        setEpisodes([]);
        setSelectedEpisode("");
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('search-content', {
          body: { tvId: selectedContent.id, season: parseInt(selectedSeason) }
        });

        if (error) throw error;
        setEpisodes(data.episodes || []);
      } catch (error) {
        console.error('Error fetching episodes:', error);
        setEpisodes([]);
      }
    };

    fetchEpisodes();
  }, [selectedContent, selectedSeason]);

  // Fetch runtime when content or episode is selected
  useEffect(() => {
    const fetchRuntime = async () => {
      if (!selectedContent) {
        setMaxRuntime(180);
        setTimestampMinutes([30]);
        return;
      }

      try {
        if (selectedContent.type === 'movie') {
          const { data, error } = await supabase.functions.invoke('search-content', {
            body: { movieId: selectedContent.id }
          });

          if (error) throw error;
          const runtime = data.runtime || 120;
          setMaxRuntime(runtime);
          setTimestampMinutes([Math.min(30, runtime)]);
        } else if (selectedContent.type === 'tv' && selectedSeason && selectedEpisode) {
          const { data, error } = await supabase.functions.invoke('search-content', {
            body: { 
              tvId: selectedContent.id, 
              season: parseInt(selectedSeason),
              episodeNumber: parseInt(selectedEpisode)
            }
          });

          if (error) throw error;
          const runtime = data.runtime || 45;
          setMaxRuntime(runtime);
          setTimestampMinutes([Math.min(30, runtime)]);
        }
      } catch (error) {
        console.error('Error fetching runtime:', error);
        setMaxRuntime(180);
      }
    };

    fetchRuntime();
  }, [selectedContent, selectedSeason, selectedEpisode]);

  // Convert minutes to HH:MM:SS format
  const formatTimestamp = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    const secs = Math.floor((minutes % 1) * 60);
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const timestamp = formatTimestamp(timestampMinutes[0]);

  const handleAskQuestion = async () => {
    if (!question.trim()) {
      toast({
        title: "Question required",
        description: "Please enter a question",
        variant: "destructive"
      });
      return;
    }

    if (!selectedContent) {
      toast({
        title: "Content required",
        description: "Please select a movie or TV show",
        variant: "destructive"
      });
      return;
    }

    if (selectedContent.type === "tv" && (!selectedSeason || !selectedEpisode)) {
      toast({
        title: "Episode required",
        description: "Please select a season and episode for TV shows",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      const contextInfo = selectedContent.type === "tv" 
        ? `S${selectedSeason}E${selectedEpisode} @ ${timestamp}`
        : `@ ${timestamp}`;

      const { data, error } = await supabase.functions.invoke('spoiler-free-companion', {
        body: {
          tmdbId: selectedContent.id,
          mediaType: selectedContent.type,
          seasonNumber: selectedContent.type === 'tv' ? parseInt(selectedSeason) : undefined,
          episodeNumber: selectedContent.type === 'tv' ? parseInt(selectedEpisode) : undefined,
          title: selectedContent.title,
          timestamp,
          question: question.trim(),
        }
      });

      if (error) throw error;

      const newMessage: Message = {
        id: messages.length + 1,
        question: question,
        answer: data.answer,
        context: contextInfo,
        timestamp: "Just now"
      };

      setMessages([newMessage, ...messages]);
      setQuestion("");
      
      toast({
        title: "Answer received",
        description: "Spoiler-free response generated!",
      });
    } catch (error) {
      console.error('Error asking question:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to get answer. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold mb-2">Spoiler-Free Companion</h2>
        <p className="text-muted-foreground">
          Ask questions about your show without spoilers
        </p>
      </div>

      {/* Input Section */}
      <Card className="p-4 space-y-4 bg-gradient-to-br from-card to-secondary border-border">
        {/* Selected Content Display */}
        {selectedContent && (
          <div className="flex items-center gap-4 p-3 bg-background/50 rounded-lg border border-border">
            <div className="flex-1">
              <h3 className="font-semibold text-lg">{selectedContent.title}</h3>
              <p className="text-sm text-muted-foreground">
                {selectedContent.year} • {selectedContent.type === "tv" ? "TV Show" : "Movie"}
              </p>
            </div>
            {selectedContent.posterPath && (
              <img 
                src={`https://image.tmdb.org/t/p/w154${selectedContent.posterPath}`}
                alt={selectedContent.title}
                className="w-20 h-28 object-cover rounded shadow-lg"
              />
            )}
          </div>
        )}

        {/* Content Search */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Movie or TV Show</label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between bg-background/50 text-left font-normal"
              >
                {selectedContent ? (
                  <span className="flex items-center gap-2">
                    {selectedContent.title}
                    {selectedContent.year && (
                      <span className="text-xs text-muted-foreground">({selectedContent.year})</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      • {selectedContent.type === "tv" ? "TV Show" : "Movie"}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">Search movies & TV shows...</span>
                )}
                <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput 
                  placeholder="Type to search all movies & TV..." 
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                />
                <CommandList>
                  {isSearching ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                      Searching...
                    </div>
                  ) : searchResults.length === 0 && searchQuery.length >= 2 ? (
                    <CommandEmpty>No results found. Try a different search.</CommandEmpty>
                  ) : searchQuery.length < 2 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      Type at least 2 characters to search
                    </div>
                  ) : (
                    <CommandGroup>
                      {searchResults.map((item) => (
                        <CommandItem
                          key={`${item.type}-${item.id}`}
                          value={item.title}
                          onSelect={() => {
                            setSelectedContent(item);
                            setSearchQuery("");
                            setOpen(false);
                            if (item.type === "movie") {
                              setSelectedSeason("");
                              setSelectedEpisode("");
                            }
                          }}
                        >
                          <div className="flex items-center gap-3 w-full">
                            {item.posterPath && (
                              <img 
                                src={`https://image.tmdb.org/t/p/w92${item.posterPath}`}
                                alt={item.title}
                                className="w-10 h-14 object-cover rounded"
                              />
                            )}
                            <div className="flex items-center justify-between flex-1">
                              <div className="flex items-center gap-2">
                                <span>{item.title}</span>
                                {item.year && (
                                  <span className="text-xs text-muted-foreground">({item.year})</span>
                                )}
                              </div>
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                item.type === "tv" 
                                  ? "bg-accent/20 text-accent"
                                  : "bg-primary/20 text-primary"
                              }`}>
                                {item.type === "tv" ? "TV" : "Movie"}
                              </span>
                            </div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Season & Episode Selects (only for TV shows) */}
        {selectedContent?.type === "tv" && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Season</label>
              <Select value={selectedSeason} onValueChange={setSelectedSeason}>
                <SelectTrigger className="bg-background/50">
                  <SelectValue placeholder="Select season" />
                </SelectTrigger>
                <SelectContent>
                  {seasons.map((season) => (
                    <SelectItem key={season.seasonNumber} value={season.seasonNumber.toString()}>
                      {season.name} ({season.episodeCount} episodes)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Episode</label>
              <Select 
                value={selectedEpisode} 
                onValueChange={setSelectedEpisode}
                disabled={!selectedSeason}
              >
                <SelectTrigger className="bg-background/50">
                  <SelectValue placeholder="Select episode" />
                </SelectTrigger>
                <SelectContent>
                  {episodes.map((episode) => (
                    <SelectItem key={episode.episodeNumber} value={episode.episodeNumber.toString()}>
                      Ep {episode.episodeNumber}: {episode.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        
        {/* Timestamp Slider */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Timestamp
            </label>
            <span className="text-sm font-mono text-primary">{timestamp}</span>
          </div>
          <Slider
            value={timestampMinutes}
            onValueChange={setTimestampMinutes}
            max={maxRuntime}
            step={0.5}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>00:00:00</span>
            <span>{formatTimestamp(maxRuntime)}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <Textarea
            placeholder="Ask a question about the story so far..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="min-h-[80px] bg-background/50"
          />
        </div>

        <Button 
          onClick={handleAskQuestion}
          disabled={isLoading}
          className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              Ask Question
            </>
          )}
        </Button>
      </Card>

      {/* Messages */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Previous Questions</h3>
        {messages.length === 0 ? (
          <Card className="p-6 text-center bg-card border-border">
            <p className="text-muted-foreground">
              No questions yet. Ask your first spoiler-free question!
            </p>
          </Card>
        ) : (
          messages.map((msg) => (
          <Card key={msg.id} className="p-4 space-y-3 bg-card border-border hover:border-primary/50 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="font-medium text-foreground">{msg.question}</p>
                <p className="text-sm text-muted-foreground mt-2">{msg.answer}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground border-t border-border pt-3">
              <span className="px-2 py-1 bg-secondary rounded text-primary font-mono">
                {msg.context}
              </span>
              <span>{msg.timestamp}</span>
            </div>
          </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default Companion;
