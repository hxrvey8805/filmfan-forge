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

// Comprehensive database of shows and movies
const CONTENT_DATABASE = [
  // Popular TV Shows
  { title: "Breaking Bad", type: "tv", seasons: 5 },
  { title: "Game of Thrones", type: "tv", seasons: 8 },
  { title: "The Sopranos", type: "tv", seasons: 6 },
  { title: "The Wire", type: "tv", seasons: 5 },
  { title: "Stranger Things", type: "tv", seasons: 4 },
  { title: "The Office", type: "tv", seasons: 9 },
  { title: "Friends", type: "tv", seasons: 10 },
  { title: "Better Call Saul", type: "tv", seasons: 6 },
  { title: "The Crown", type: "tv", seasons: 6 },
  { title: "Succession", type: "tv", seasons: 4 },
  { title: "The Last of Us", type: "tv", seasons: 1 },
  { title: "Wednesday", type: "tv", seasons: 1 },
  { title: "The Mandalorian", type: "tv", seasons: 3 },
  { title: "Peaky Blinders", type: "tv", seasons: 6 },
  { title: "Sherlock", type: "tv", seasons: 4 },
  { title: "Black Mirror", type: "tv", seasons: 6 },
  { title: "The Witcher", type: "tv", seasons: 3 },
  { title: "House of the Dragon", type: "tv", seasons: 2 },
  { title: "True Detective", type: "tv", seasons: 4 },
  { title: "Westworld", type: "tv", seasons: 4 },
  { title: "The Boys", type: "tv", seasons: 4 },
  { title: "Ozark", type: "tv", seasons: 4 },
  { title: "Dark", type: "tv", seasons: 3 },
  { title: "Squid Game", type: "tv", seasons: 1 },
  { title: "Money Heist", type: "tv", seasons: 5 },
  { title: "Narcos", type: "tv", seasons: 3 },
  { title: "The Handmaid's Tale", type: "tv", seasons: 5 },
  { title: "Vikings", type: "tv", seasons: 6 },
  { title: "Lost", type: "tv", seasons: 6 },
  { title: "Prison Break", type: "tv", seasons: 5 },
  { title: "Dexter", type: "tv", seasons: 9 },
  { title: "The Walking Dead", type: "tv", seasons: 11 },
  { title: "Suits", type: "tv", seasons: 9 },
  { title: "Mad Men", type: "tv", seasons: 7 },
  { title: "House", type: "tv", seasons: 8 },
  { title: "How I Met Your Mother", type: "tv", seasons: 9 },
  { title: "The Big Bang Theory", type: "tv", seasons: 12 },
  { title: "Parks and Recreation", type: "tv", seasons: 7 },
  { title: "Brooklyn Nine-Nine", type: "tv", seasons: 8 },
  { title: "Community", type: "tv", seasons: 6 },
  { title: "Arrested Development", type: "tv", seasons: 5 },
  { title: "30 Rock", type: "tv", seasons: 7 },
  { title: "Scrubs", type: "tv", seasons: 9 },
  { title: "Seinfeld", type: "tv", seasons: 9 },
  { title: "The Fresh Prince of Bel-Air", type: "tv", seasons: 6 },
  { title: "Frasier", type: "tv", seasons: 11 },
  { title: "Cheers", type: "tv", seasons: 11 },
  { title: "M*A*S*H", type: "tv", seasons: 11 },
  { title: "Twin Peaks", type: "tv", seasons: 3 },
  { title: "The X-Files", type: "tv", seasons: 11 },
  { title: "Star Trek: The Next Generation", type: "tv", seasons: 7 },
  { title: "Doctor Who", type: "tv", seasons: 13 },
  { title: "Battlestar Galactica", type: "tv", seasons: 4 },
  { title: "The Expanse", type: "tv", seasons: 6 },
  { title: "Firefly", type: "tv", seasons: 1 },
  { title: "Band of Brothers", type: "tv", seasons: 1 },
  { title: "Chernobyl", type: "tv", seasons: 1 },
  { title: "The Queen's Gambit", type: "tv", seasons: 1 },
  { title: "Mare of Easttown", type: "tv", seasons: 1 },
  { title: "Big Little Lies", type: "tv", seasons: 2 },
  { title: "Euphoria", type: "tv", seasons: 2 },
  { title: "Yellowstone", type: "tv", seasons: 5 },
  { title: "1883", type: "tv", seasons: 1 },
  { title: "The White Lotus", type: "tv", seasons: 2 },
  { title: "Severance", type: "tv", seasons: 1 },
  { title: "Ted Lasso", type: "tv", seasons: 3 },
  { title: "The Bear", type: "tv", seasons: 2 },
  { title: "Only Murders in the Building", type: "tv", seasons: 3 },
  { title: "What We Do in the Shadows", type: "tv", seasons: 5 },
  { title: "Atlanta", type: "tv", seasons: 4 },
  { title: "Barry", type: "tv", seasons: 4 },
  { title: "Fleabag", type: "tv", seasons: 2 },
  { title: "The Marvelous Mrs. Maisel", type: "tv", seasons: 5 },
  { title: "Killing Eve", type: "tv", seasons: 4 },
  { title: "The Morning Show", type: "tv", seasons: 3 },
  { title: "For All Mankind", type: "tv", seasons: 4 },
  { title: "See", type: "tv", seasons: 3 },
  { title: "Foundation", type: "tv", seasons: 2 },
  { title: "Silo", type: "tv", seasons: 1 },
  
  // Classic & Modern Movies
  { title: "The Shawshank Redemption", type: "movie" },
  { title: "The Godfather", type: "movie" },
  { title: "The Dark Knight", type: "movie" },
  { title: "Pulp Fiction", type: "movie" },
  { title: "Forrest Gump", type: "movie" },
  { title: "Inception", type: "movie" },
  { title: "The Matrix", type: "movie" },
  { title: "Interstellar", type: "movie" },
  { title: "Oppenheimer", type: "movie" },
  { title: "Barbie", type: "movie" },
  { title: "Everything Everywhere All at Once", type: "movie" },
  { title: "The Godfather Part II", type: "movie" },
  { title: "12 Angry Men", type: "movie" },
  { title: "Schindler's List", type: "movie" },
  { title: "The Lord of the Rings: The Return of the King", type: "movie" },
  { title: "Fight Club", type: "movie" },
  { title: "Star Wars: Episode V - The Empire Strikes Back", type: "movie" },
  { title: "Goodfellas", type: "movie" },
  { title: "The Silence of the Lambs", type: "movie" },
  { title: "Saving Private Ryan", type: "movie" },
  { title: "Parasite", type: "movie" },
  { title: "Gladiator", type: "movie" },
  { title: "The Green Mile", type: "movie" },
  { title: "The Departed", type: "movie" },
  { title: "The Prestige", type: "movie" },
  { title: "Memento", type: "movie" },
  { title: "The Usual Suspects", type: "movie" },
  { title: "Se7en", type: "movie" },
  { title: "Whiplash", type: "movie" },
  { title: "The Social Network", type: "movie" },
  { title: "The Grand Budapest Hotel", type: "movie" },
  { title: "Her", type: "movie" },
  { title: "Arrival", type: "movie" },
  { title: "Blade Runner 2049", type: "movie" },
  { title: "Mad Max: Fury Road", type: "movie" },
  { title: "Dune", type: "movie" },
  { title: "Dune: Part Two", type: "movie" },
  { title: "No Country for Old Men", type: "movie" },
  { title: "There Will Be Blood", type: "movie" },
  { title: "The Big Lebowski", type: "movie" },
  { title: "Fargo", type: "movie" },
  { title: "Reservoir Dogs", type: "movie" },
  { title: "Django Unchained", type: "movie" },
  { title: "Inglourious Basterds", type: "movie" },
  { title: "Kill Bill: Vol. 1", type: "movie" },
  { title: "The Hateful Eight", type: "movie" },
  { title: "Once Upon a Time in Hollywood", type: "movie" },
  { title: "Spider-Man: Into the Spider-Verse", type: "movie" },
  { title: "Spider-Man: Across the Spider-Verse", type: "movie" },
  { title: "Avengers: Endgame", type: "movie" },
  { title: "The Avengers", type: "movie" },
  { title: "Iron Man", type: "movie" },
  { title: "Captain America: The Winter Soldier", type: "movie" },
  { title: "Black Panther", type: "movie" },
  { title: "Thor: Ragnarok", type: "movie" },
  { title: "Guardians of the Galaxy", type: "movie" },
  { title: "Shang-Chi and the Legend of the Ten Rings", type: "movie" },
  { title: "Joker", type: "movie" },
  { title: "The Batman", type: "movie" },
  { title: "The Dark Knight Rises", type: "movie" },
  { title: "Batman Begins", type: "movie" },
  { title: "Logan", type: "movie" },
  { title: "Deadpool", type: "movie" },
  { title: "The Suicide Squad", type: "movie" },
  { title: "Top Gun: Maverick", type: "movie" },
  { title: "Mission: Impossible - Fallout", type: "movie" },
  { title: "John Wick", type: "movie" },
  { title: "John Wick: Chapter 4", type: "movie" },
  { title: "The Bourne Identity", type: "movie" },
  { title: "Casino Royale", type: "movie" },
  { title: "Skyfall", type: "movie" },
  { title: "No Time to Die", type: "movie" },
  { title: "The Shining", type: "movie" },
  { title: "Get Out", type: "movie" },
  { title: "Hereditary", type: "movie" },
  { title: "A Quiet Place", type: "movie" },
  { title: "The Conjuring", type: "movie" },
  { title: "It", type: "movie" },
  { title: "Us", type: "movie" },
  { title: "Nope", type: "movie" },
  { title: "Jurassic Park", type: "movie" },
  { title: "E.T. the Extra-Terrestrial", type: "movie" },
  { title: "Jaws", type: "movie" },
  { title: "Back to the Future", type: "movie" },
  { title: "Indiana Jones and the Raiders of the Lost Ark", type: "movie" },
  { title: "Star Wars: A New Hope", type: "movie" },
  { title: "The Terminator", type: "movie" },
  { title: "Terminator 2: Judgment Day", type: "movie" },
  { title: "Alien", type: "movie" },
  { title: "Aliens", type: "movie" },
  { title: "The Thing", type: "movie" },
  { title: "Blade Runner", type: "movie" },
  { title: "2001: A Space Odyssey", type: "movie" },
  { title: "Apocalypse Now", type: "movie" },
  { title: "Full Metal Jacket", type: "movie" },
  { title: "Casablanca", type: "movie" },
  { title: "Citizen Kane", type: "movie" },
  { title: "Vertigo", type: "movie" },
  { title: "Psycho", type: "movie" },
  { title: "Rear Window", type: "movie" },
  { title: "North by Northwest", type: "movie" },
  { title: "The Princess Bride", type: "movie" },
  { title: "Monty Python and the Holy Grail", type: "movie" },
  { title: "Groundhog Day", type: "movie" },
  { title: "When Harry Met Sally", type: "movie" },
  { title: "The Breakfast Club", type: "movie" },
  { title: "Ferris Bueller's Day Off", type: "movie" },
  { title: "Clueless", type: "movie" },
  { title: "Mean Girls", type: "movie" },
  { title: "Superbad", type: "movie" },
  { title: "The Hangover", type: "movie" },
  { title: "Bridesmaids", type: "movie" },
  { title: "Knives Out", type: "movie" },
  { title: "Glass Onion", type: "movie" },
  { title: "The Truman Show", type: "movie" },
  { title: "Eternal Sunshine of the Spotless Mind", type: "movie" },
  { title: "Good Will Hunting", type: "movie" },
  { title: "Dead Poets Society", type: "movie" },
  { title: "The Pianist", type: "movie" },
  { title: "Life is Beautiful", type: "movie" },
  { title: "Amélie", type: "movie" },
  { title: "Pan's Labyrinth", type: "movie" },
  { title: "Spirited Away", type: "movie" },
  { title: "Princess Mononoke", type: "movie" },
  { title: "Your Name", type: "movie" },
  { title: "Grave of the Fireflies", type: "movie" },
  { title: "WALL-E", type: "movie" },
  { title: "Up", type: "movie" },
  { title: "Inside Out", type: "movie" },
  { title: "Toy Story", type: "movie" },
  { title: "Finding Nemo", type: "movie" },
  { title: "The Lion King", type: "movie" },
  { title: "Frozen", type: "movie" },
  { title: "Moana", type: "movie" },
  { title: "Encanto", type: "movie" },
  { title: "Coco", type: "movie" },
  { title: "Ratatouille", type: "movie" },
  { title: "The Incredibles", type: "movie" },
  { title: "Shrek", type: "movie" },
  { title: "How to Train Your Dragon", type: "movie" },
  { title: "Kung Fu Panda", type: "movie" },
  { title: "The Lord of the Rings: The Fellowship of the Ring", type: "movie" },
  { title: "The Lord of the Rings: The Two Towers", type: "movie" },
  { title: "The Hobbit: An Unexpected Journey", type: "movie" },
  { title: "Harry Potter and the Sorcerer's Stone", type: "movie" },
  { title: "Harry Potter and the Prisoner of Azkaban", type: "movie" },
  { title: "Harry Potter and the Deathly Hallows: Part 2", type: "movie" },
  { title: "Fantastic Beasts and Where to Find Them", type: "movie" },
  { title: "Pirates of the Caribbean: The Curse of the Black Pearl", type: "movie" },
  { title: "Avatar", type: "movie" },
  { title: "Avatar: The Way of Water", type: "movie" },
  { title: "Titanic", type: "movie" },
  { title: "The Revenant", type: "movie" },
  { title: "Braveheart", type: "movie" },
  { title: "300", type: "movie" },
  { title: "Troy", type: "movie" },
  { title: "Ben-Hur", type: "movie" },
  { title: "Lawrence of Arabia", type: "movie" },
].sort((a, b) => a.title.localeCompare(b.title));

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
