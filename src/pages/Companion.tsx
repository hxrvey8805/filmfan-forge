import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Send, Clock, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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

// Mock database of shows and movies
const CONTENT_DATABASE = [
  { title: "Breaking Bad", type: "tv", seasons: 5 },
  { title: "Game of Thrones", type: "tv", seasons: 8 },
  { title: "The Sopranos", type: "tv", seasons: 6 },
  { title: "The Wire", type: "tv", seasons: 5 },
  { title: "Stranger Things", type: "tv", seasons: 4 },
  { title: "The Office", type: "tv", seasons: 9 },
  { title: "Friends", type: "tv", seasons: 10 },
  { title: "Inception", type: "movie" },
  { title: "The Dark Knight", type: "movie" },
  { title: "Pulp Fiction", type: "movie" },
  { title: "The Shawshank Redemption", type: "movie" },
  { title: "Interstellar", type: "movie" },
  { title: "The Matrix", type: "movie" },
  { title: "Oppenheimer", type: "movie" },
];

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
  const [selectedContent, setSelectedContent] = useState<typeof CONTENT_DATABASE[0] | null>(null);
  const [episode, setEpisode] = useState("");
  const [timestampMinutes, setTimestampMinutes] = useState([30]); // Default 30 minutes
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  // Filter content based on search
  const filteredContent = useMemo(() => {
    if (!searchQuery) return CONTENT_DATABASE;
    return CONTENT_DATABASE.filter(item =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

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

    if (selectedContent.type === "tv" && !episode.trim()) {
      toast({
        title: "Episode required",
        description: "Please specify the episode for TV shows",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      const contextInfo = selectedContent.type === "tv" 
        ? `${episode} @ ${timestamp}`
        : `@ ${timestamp}`;

      const { data, error } = await supabase.functions.invoke('spoiler-free-companion', {
        body: {
          showTitle: selectedContent.title,
          episode: selectedContent.type === "tv" ? episode : "N/A (Movie)",
          timestamp,
          question
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
                    <span className="text-xs text-muted-foreground">
                      ({selectedContent.type === "tv" ? "TV Show" : "Movie"})
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">Search for a title...</span>
                )}
                <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="start">
              <Command>
                <CommandInput 
                  placeholder="Search movies or TV shows..." 
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                />
                <CommandList>
                  <CommandEmpty>No results found.</CommandEmpty>
                  <CommandGroup>
                    {filteredContent.map((item) => (
                      <CommandItem
                        key={item.title}
                        value={item.title}
                        onSelect={() => {
                          setSelectedContent(item);
                          setSearchQuery("");
                          setOpen(false);
                          if (item.type === "movie") {
                            setEpisode(""); // Clear episode for movies
                          }
                        }}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span>{item.title}</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            item.type === "tv" 
                              ? "bg-accent/20 text-accent"
                              : "bg-primary/20 text-primary"
                          }`}>
                            {item.type === "tv" ? "TV" : "Movie"}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Episode Input (only for TV shows) */}
        {selectedContent?.type === "tv" && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Episode</label>
            <Input
              placeholder="S1E2"
              value={episode}
              onChange={(e) => setEpisode(e.target.value)}
              className="bg-background/50"
            />
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
            max={180}
            step={0.5}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>00:00:00</span>
            <span>03:00:00</span>
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
