import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clapperboard, Tv, Clock, Send, Loader2, Plus, Eye, Heart, X, Zap, Coins, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
  id: string;
  question: string;
  answer: string;
  context: string;
  timestamp: string;
  created_at?: string;
}

interface TitleDetailModalProps {
  title: Title;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddToFavourites?: (title: Title) => void;
  onAddToWatchList?: (title: Title) => void;
  onAddToCurrentlyWatching?: (title: Title) => void;
  onAddToWatched?: (title: Title) => void;
  onMoveToCurrentlyWatching?: (title: Title) => void;
  onMoveToWatched?: (title: Title) => void;
  sourceList?: "favourite" | "watchlist" | "watching" | "watched";
}

const TitleDetailModal = ({ title, open, onOpenChange, onAddToFavourites, onAddToWatchList, onAddToCurrentlyWatching, onAddToWatched, onMoveToCurrentlyWatching, onMoveToWatched, sourceList }: TitleDetailModalProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [remainingFree, setRemainingFree] = useState<number | null>(null);
  const [coins, setCoins] = useState(0);
  
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

  // Load AI usage, coins, and conversation history when modal opens
  useEffect(() => {
    if (open) {
      loadAIUsage();
      loadUserStats();
      loadConversationHistory();
    }
  }, [open, title.id, title.type]);

  // Listen for custom event from Companion page
  useEffect(() => {
    const handleQuestionAsked = () => {
      loadAIUsage();
      loadUserStats();
    };

    window.addEventListener('questionAsked', handleQuestionAsked);
    return () => window.removeEventListener('questionAsked', handleQuestionAsked);
  }, []);

  const loadAIUsage = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = new Date().toISOString().split('T')[0];
      let { data: aiUsage } = await supabase
        .from('user_ai_usage')
        .select('questions_today, last_reset_date')
        .eq('user_id', user.id)
        .single();

      if (aiUsage) {
        // Reset if new day
        if (aiUsage.last_reset_date !== today) {
          setRemainingFree(5);
        } else {
          setRemainingFree(Math.max(0, 5 - aiUsage.questions_today));
        }
      } else {
        setRemainingFree(5);
      }
    } catch (error) {
      console.error('Error loading AI usage:', error);
      setRemainingFree(5); // Default to 5 if error
    }
  };

  const loadUserStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let { data: stats } = await supabase
        .from('user_stats')
        .select('coins')
        .eq('user_id', user.id)
        .single();

      if (stats) {
        setCoins(stats.coins);
      }
    } catch (error) {
      console.error('Error loading user stats:', error);
    }
  };

  const loadConversationHistory = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: conversations, error } = await supabase
        .from('ai_conversations')
        .select('*')
        .eq('user_id', user.id)
        .eq('title_id', title.id)
        .eq('media_type', title.type)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error loading conversation history:', error);
        return;
      }

      if (conversations && conversations.length > 0) {
        const loadedMessages: Message[] = conversations.map(conv => ({
          id: conv.id,
          question: conv.question,
          answer: conv.answer,
          context: conv.context,
          timestamp: new Date(conv.created_at).toLocaleDateString(),
          created_at: conv.created_at
        }));
        setMessages(loadedMessages);
      }
    } catch (error) {
      console.error('Error loading conversation history:', error);
    }
  };

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

      // Include previous Q&A for AI context (last 5 messages)
      const previousQA = messages.slice(0, 5).map(m => ({
        question: m.question,
        answer: m.answer,
        context: m.context
      }));

      const { data, error } = await supabase.functions.invoke('spoiler-free-companion', {
        body: {
          tmdbId: title.id,
          mediaType: title.type,
          seasonNumber: title.type === 'tv' ? parseInt(selectedSeason) : undefined,
          episodeNumber: title.type === 'tv' ? parseInt(selectedEpisode) : undefined,
          title: title.title,
          timestamp,
          question: question.trim(),
          previousQA,
        }
      });

      if (error) {
        // Handle specific error cases
        if (error.status === 402) {
          const errorData = error.data || error;
          toast({
            title: "Insufficient Coins",
            description: errorData.error || `You need 150 coins for this question. You have ${errorData.coinsAvailable || 0} coins.`,
            variant: "destructive"
          });
          // Reload coins
          loadUserStats();
          return;
        }
        throw error;
      }

      // Save to database
      const { data: { user } } = await supabase.auth.getUser();
      let savedId: string = crypto.randomUUID();
      
      if (user) {
        const { data: savedConv, error: saveError } = await supabase
          .from('ai_conversations')
          .insert({
            user_id: user.id,
            title_id: title.id,
            media_type: title.type,
            question: question.trim(),
            answer: data.answer,
            context: contextInfo,
            season_number: title.type === 'tv' ? parseInt(selectedSeason) : null,
            episode_number: title.type === 'tv' ? parseInt(selectedEpisode) : null,
            timestamp: timestamp,
          })
          .select('id')
          .single();
        
        if (saveError) {
          console.error('Error saving conversation:', saveError);
        } else if (savedConv) {
          savedId = savedConv.id as string;
        }
      }

      const newMessage: Message = {
        id: savedId,
        question: question,
        answer: data.answer,
        context: contextInfo,
        timestamp: "Just now"
      };

      setMessages([newMessage, ...messages]);
      setQuestion("");
      
      // Update remaining free questions and coins
      if (data.remainingFreeQuestions !== undefined && data.remainingFreeQuestions !== null) {
        setRemainingFree(data.remainingFreeQuestions);
      }
      if (data.usedCoins) {
        setCoins(prev => Math.max(0, prev - data.usedCoins));
      }
      
      // Dispatch custom event to notify Dashboard to refresh
      window.dispatchEvent(new CustomEvent('questionAsked'));
      
      const description = data.remainingFreeQuestions !== undefined && data.remainingFreeQuestions >= 0
        ? `${data.remainingFreeQuestions} free questions remaining today.`
        : data.usedCoins
        ? `Used ${data.usedCoins} coins.`
        : "Spoiler-free response generated!";
      
      toast({
        title: "Answer received",
        description: description,
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
                    <Clapperboard className="h-16 w-16 text-muted-foreground/50" />
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
                  {sourceList === "favourite" ? (
                    // Only Exit button for favourites
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenChange(false)}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Exit
                    </Button>
                  ) : sourceList === "watchlist" ? (
                    <>
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
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Exit
                      </Button>
                    </>
                  ) : sourceList === "watching" ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          onMoveToWatched?.(title);
                          onOpenChange(false);
                        }}
                      >
                        <Clock className="h-4 w-4 mr-1" />
                        Watched
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Exit
                      </Button>
                    </>
                  ) : sourceList === "watched" ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          onAddToFavourites?.(title);
                          toast({ description: "Added to Favourites" });
                        }}
                      >
                        <Heart className="h-4 w-4 mr-1" />
                        Favourite
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Exit
                      </Button>
                    </>
                  ) : (
                    <>
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
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Exit
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold">Spoiler-Free AI Companion</h3>
                <p className="text-sm text-muted-foreground">
                  Ask questions about the story up to a specific point without spoilers
                </p>
                {/* Question Counter */}
                {remainingFree !== null && (
                  remainingFree === 0 ? (
                    <Card className="p-4 bg-gradient-to-br from-card/90 to-card/70 border-2 border-primary/30 shadow-lg mt-2">
                      <div className="flex flex-col items-center gap-4">
                        {/* Enlarged 0/5 Display */}
                        <div className="relative w-24 h-24">
                          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                            {/* Background circle */}
                            <circle
                              cx="50"
                              cy="50"
                              r="40"
                              stroke="currentColor"
                              strokeWidth="8"
                              fill="none"
                              className="text-primary/20"
                            />
                            {/* Progress circle - full (0 remaining) */}
                            <circle
                              cx="50"
                              cy="50"
                              r="40"
                              stroke="url(#modal-gradient-zero)"
                              strokeWidth="8"
                              fill="none"
                              strokeLinecap="round"
                              strokeDasharray={`${2 * Math.PI * 40}`}
                              strokeDashoffset="0"
                              className="transition-all duration-1000 ease-out"
                            />
                            <defs>
                              <linearGradient id="modal-gradient-zero" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="hsl(var(--primary))" />
                                <stop offset="100%" stopColor="hsl(var(--accent))" />
                              </linearGradient>
                            </defs>
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-center">
                              <div className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent leading-none">
                                0
                              </div>
                              <div className="text-sm text-muted-foreground leading-none">/5</div>
                            </div>
                          </div>
                        </div>
                        
                        {/* Prompts */}
                        <div className="text-center space-y-3 w-full">
                          <p className="text-sm font-semibold text-foreground">
                            No free questions remaining
                          </p>
                          <div className="flex flex-col sm:flex-row gap-2 justify-center">
                            {coins >= 150 ? (
                              <Button
                                onClick={() => {
                                  onOpenChange(false);
                                  navigate("/store");
                                }}
                                className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
                              >
                                <Coins className="h-4 w-4 mr-2" />
                                Buy Question (150 coins)
                              </Button>
                            ) : (
                              <>
                                <Button
                                  onClick={() => {
                                    onOpenChange(false);
                                    navigate("/store");
                                  }}
                                  variant="outline"
                                  className="border-primary/40"
                                >
                                  <Coins className="h-4 w-4 mr-2" />
                                  Buy Question
                                </Button>
                                <Button
                                  onClick={() => {
                                    onOpenChange(false);
                                    navigate("/dashboard");
                                  }}
                                  className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
                                >
                                  <Sparkles className="h-4 w-4 mr-2" />
                                  Play Game to Earn Coins
                                </Button>
                              </>
                            )}
                          </div>
                          {coins < 150 && (
                            <p className="text-xs text-muted-foreground">
                              Win Actor Connect in under 2 minutes to earn 75 coins
                            </p>
                          )}
                        </div>
                      </div>
                    </Card>
                  ) : (
                    <div className="flex items-center gap-3 pt-2">
                      <div className="relative w-12 h-12">
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                          {/* Background circle */}
                          <circle
                            cx="50"
                            cy="50"
                            r="40"
                            stroke="currentColor"
                            strokeWidth="6"
                            fill="none"
                            className="text-primary/20"
                          />
                          {/* Progress circle */}
                          <circle
                            cx="50"
                            cy="50"
                            r="40"
                            stroke="url(#modal-gradient)"
                            strokeWidth="6"
                            fill="none"
                            strokeLinecap="round"
                            strokeDasharray={`${2 * Math.PI * 40}`}
                            strokeDashoffset={`${2 * Math.PI * 40 * (1 - remainingFree / 5)}`}
                            className="transition-all duration-1000 ease-out"
                          />
                          <defs>
                            <linearGradient id="modal-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="hsl(var(--primary))" />
                              <stop offset="100%" stopColor="hsl(var(--accent))" />
                            </linearGradient>
                          </defs>
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-center">
                            <div className="text-sm font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent leading-none">
                              {remainingFree}
                            </div>
                            <div className="text-[10px] text-muted-foreground leading-none">/5</div>
                          </div>
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">
                          {remainingFree} free question{remainingFree !== 1 ? 's' : ''} remaining today
                        </p>
                      </div>
                    </div>
                  )
                )}
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
