import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Film, Tv, Clock, Send, Loader2, Plus, Eye, Heart, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Title {
  id: number;
  title: string;
  type: "movie" | "tv";
  posterPath: string;
  year?: number;
  progress?: number;
}

interface Message {
  id: number;
  question: string;
  answer: string;
  context: string;
  timestamp: string;
}

interface TitleDetailModalProps {
  title: Title;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddToWatchList?: (title: Title) => void;
  onAddToCurrentlyWatching?: (title: Title) => void;
  onMoveToCurrentlyWatching?: (title: Title) => void;
  sourceList?: "watchlist" | "watching";
}

const TitleDetailModal = ({ title, open, onOpenChange, onAddToWatchList, onAddToCurrentlyWatching, onMoveToCurrentlyWatching, sourceList }: TitleDetailModalProps) => {
  const { toast } = useToast();
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  
  // TV-specific state
  const [selectedSeason, setSelectedSeason] = useState("1");
  const [selectedEpisode, setSelectedEpisode] = useState("1");
  const [seasons, setSeasons] = useState<{ seasonNumber: number; name: string; episodeCount: number }[]>([]);
  const [episodes, setEpisodes] = useState<{ episodeNumber: number; name: string; runtime: number }[]>([]);
  
  // Timestamp state
  const [timestampMinutes, setTimestampMinutes] = useState([30]);
  const [maxRuntime, setMaxRuntime] = useState(120);

  // Fetch seasons for TV shows
  useEffect(() => {
    const fetchSeasons = async () => {
      if (title.type !== 'tv') return;

      try {
        const { data, error } = await supabase.functions.invoke('search-content', {
          body: { tvId: title.id }
        });

        if (error) throw error;
        setSeasons(data.seasons || []);
      } catch (error) {
        console.error('Error fetching seasons:', error);
      }
    };

    fetchSeasons();
  }, [title]);

  // Fetch episodes when season changes
  useEffect(() => {
    const fetchEpisodes = async () => {
      if (title.type !== 'tv' || !selectedSeason) return;

      try {
        const { data, error } = await supabase.functions.invoke('search-content', {
          body: { tvId: title.id, season: parseInt(selectedSeason) }
        });

        if (error) throw error;
        setEpisodes(data.episodes || []);
      } catch (error) {
        console.error('Error fetching episodes:', error);
      }
    };

    fetchEpisodes();
  }, [title, selectedSeason]);

  // Fetch runtime
  useEffect(() => {
    const fetchRuntime = async () => {
      try {
        if (title.type === 'movie') {
          const { data, error } = await supabase.functions.invoke('search-content', {
            body: { movieId: title.id }
          });

          if (error) throw error;
          const runtime = data.runtime || 120;
          setMaxRuntime(runtime);
          setTimestampMinutes([Math.min(30, runtime)]);
        } else if (selectedSeason && selectedEpisode) {
          const { data, error } = await supabase.functions.invoke('search-content', {
            body: { 
              tvId: title.id, 
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
      }
    };

    fetchRuntime();
  }, [title, selectedSeason, selectedEpisode]);

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

    setIsLoading(true);

    try {
      const contextInfo = title.type === "tv" 
        ? `S${selectedSeason}E${selectedEpisode} @ ${timestamp}`
        : `@ ${timestamp}`;

      const { data, error } = await supabase.functions.invoke('spoiler-free-companion', {
        body: {
          tmdbId: title.id,
          mediaType: title.type,
          seasonNumber: title.type === 'tv' ? parseInt(selectedSeason) : undefined,
          episodeNumber: title.type === 'tv' ? parseInt(selectedEpisode) : undefined,
          title: title.title,
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
        description: error instanceof Error ? error.message : "Failed to get answer",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="space-y-6">
          {/* Header with Poster and Meta */}
          <div className="flex gap-6">
            <div className="relative aspect-[2/3] w-48 flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20">
              {title.posterPath ? (
                <img 
                  src={title.posterPath} 
                  alt={title.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  {title.type === "movie" ? (
                    <Film className="h-16 w-16 text-muted-foreground/50" />
                  ) : (
                    <Tv className="h-16 w-16 text-muted-foreground/50" />
                  )}
                </div>
              )}
              <Badge 
                variant={title.type === "tv" ? "default" : "secondary"}
                className="absolute top-2 left-2"
              >
                {title.type === "tv" ? "TV Show" : "Movie"}
              </Badge>
            </div>

            <div className="flex-1 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-3xl font-bold">{title.title}</h2>
                  {title.year && (
                    <p className="text-muted-foreground">{title.year}</p>
                  )}
                </div>
                
                <div className="flex gap-2">
                  {sourceList === "watching" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        toast({ description: "Favourite feature coming soon!" });
                      }}
                    >
                      <Heart className="h-4 w-4 mr-1" />
                      Favourite
                    </Button>
                  ) : sourceList === "watchlist" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        onMoveToCurrentlyWatching?.(title);
                        onOpenChange(false);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Move to Currently Watching
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        onAddToWatchList?.(title);
                        toast({ description: "Added to Watch List" });
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Watch List
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold">Spoiler-Free AI Companion</h3>
                <p className="text-sm text-muted-foreground">
                  Ask questions about the story up to a specific point without spoilers
                </p>
              </div>
            </div>
          </div>

          {/* Companion Interface */}
          <Card className="p-4 space-y-4 bg-gradient-to-br from-card to-secondary border-border">
            {/* Season & Episode for TV */}
            {title.type === "tv" && (
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
                          {season.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Episode</label>
                  <Select value={selectedEpisode} onValueChange={setSelectedEpisode}>
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

            {/* Question Input */}
            <div className="space-y-2">
              <Textarea
                placeholder="Ask a question about the story so far..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="min-h-[80px] bg-background/50"
              />
              <Button 
                onClick={handleAskQuestion}
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90"
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
            </div>
          </Card>

          {/* Messages */}
          {messages.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold">Conversation</h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {messages.map((msg) => (
                  <Card key={msg.id} className="p-4 space-y-2 bg-card border-border">
                    <div className="flex items-start justify-between">
                      <p className="font-medium text-sm">{msg.question}</p>
                      <Badge variant="outline" className="text-xs">{msg.context}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{msg.answer}</p>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TitleDetailModal;
