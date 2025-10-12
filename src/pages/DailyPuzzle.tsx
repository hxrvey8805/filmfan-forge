import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, ArrowRight, Play, RotateCcw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Actor {
  id: number;
  name: string;
  profilePath: string;
}

interface Credit {
  id: number;
  title: string;
  type: string;
  year?: string;
  posterPath: string;
  character?: string;
}

interface CastMember {
  id: number;
  name: string;
  character: string;
  profilePath: string;
}

type PathStep = {
  type: 'actor' | 'movie' | 'tv';
  id: number;
  name: string;
  image: string;
};

type GameState = 'loading' | 'ready' | 'playing' | 'won';
type ViewMode = 'filmography' | 'cast';

const DailyPuzzle = () => {
  const { toast } = useToast();
  const [gameState, setGameState] = useState<GameState>('loading');
  const [startActor, setStartActor] = useState<Actor | null>(null);
  const [targetActor, setTargetActor] = useState<Actor | null>(null);
  const [currentActor, setCurrentActor] = useState<Actor | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('filmography');
  const [filmography, setFilmography] = useState<Credit[]>([]);
  const [cast, setCast] = useState<CastMember[]>([]);
  const [path, setPath] = useState<PathStep[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadRandomActors();
  }, []);

  const loadRandomActors = async () => {
    setGameState('loading');
    try {
      const { data, error } = await supabase.functions.invoke('actor-connect', {
        body: { action: 'getRandomActors' }
      });

      if (error) throw error;
      
      setStartActor(data.actors[0]);
      setTargetActor(data.actors[1]);
      setGameState('ready');
    } catch (error) {
      console.error('Error loading actors:', error);
      toast({
        title: "Error",
        description: "Failed to load actors. Please try again.",
        variant: "destructive"
      });
    }
  };

  const startGame = async () => {
    if (!startActor) return;
    
    setGameState('playing');
    setCurrentActor(startActor);
    setPath([{
      type: 'actor',
      id: startActor.id,
      name: startActor.name,
      image: startActor.profilePath
    }]);
    
    await loadFilmography(startActor.id);
  };

  const loadFilmography = async (actorId: number) => {
    setIsLoading(true);
    setViewMode('filmography');
    try {
      const { data, error } = await supabase.functions.invoke('actor-connect', {
        body: { action: 'getActorFilmography', actorId }
      });

      if (error) throw error;
      setFilmography(data.credits);
    } catch (error) {
      console.error('Error loading filmography:', error);
      toast({
        title: "Error",
        description: "Failed to load filmography",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadCast = async (contentId: number, type: string, title: string, posterPath: string) => {
    setIsLoading(true);
    setViewMode('cast');
    
    // Add movie/TV to path
    setPath(prev => [...prev, {
      type: type as 'movie' | 'tv',
      id: contentId,
      name: title,
      image: posterPath
    }]);

    try {
      const action = type === 'movie' ? 'getMovieCast' : 'getTVCast';
      const idKey = type === 'movie' ? 'movieId' : 'tvId';
      
      const { data, error } = await supabase.functions.invoke('actor-connect', {
        body: { action, [idKey]: contentId }
      });

      if (error) throw error;
      setCast(data.cast);
    } catch (error) {
      console.error('Error loading cast:', error);
      toast({
        title: "Error",
        description: "Failed to load cast",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const selectActor = async (actor: CastMember) => {
    // Check if this is the target actor
    if (actor.id === targetActor?.id) {
      setPath(prev => [...prev, {
        type: 'actor',
        id: actor.id,
        name: actor.name,
        image: actor.profilePath
      }]);
      setGameState('won');
      toast({
        title: "🎉 You Won!",
        description: `Connected in ${path.length + 1} steps!`,
      });
      return;
    }

    // Add actor to path and load their filmography
    setPath(prev => [...prev, {
      type: 'actor',
      id: actor.id,
      name: actor.name,
      image: actor.profilePath
    }]);
    
    setCurrentActor({
      id: actor.id,
      name: actor.name,
      profilePath: actor.profilePath
    });
    
    await loadFilmography(actor.id);
  };

  const resetGame = () => {
    setGameState('ready');
    setCurrentActor(null);
    setFilmography([]);
    setCast([]);
    setPath([]);
    setViewMode('filmography');
  };

  if (gameState === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Connect the Actors</h2>
          <p className="text-muted-foreground">
            Link two actors through their shared movies and TV shows
          </p>
        </div>
        {gameState === 'won' && (
          <div className="text-center">
            <Trophy className="h-8 w-8 text-primary mx-auto mb-1" />
            <p className="text-sm font-semibold">{path.length} steps</p>
          </div>
        )}
      </div>

      {/* Actor Cards */}
      {(gameState === 'ready' || gameState === 'won') && startActor && targetActor && (
        <Card className="p-6 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/30">
          <div className="flex items-center gap-6 justify-center">
            {/* Start Actor */}
            <div className="text-center">
              <img
                src={`https://image.tmdb.org/t/p/w185${startActor.profilePath}`}
                alt={startActor.name}
                className="w-32 h-32 object-cover rounded-lg shadow-lg mb-3 mx-auto"
              />
              <p className="font-semibold">{startActor.name}</p>
              <p className="text-xs text-muted-foreground">Start</p>
            </div>

            <ArrowRight className="h-8 w-8 text-primary" />

            {/* Target Actor */}
            <div className="text-center">
              <img
                src={`https://image.tmdb.org/t/p/w185${targetActor.profilePath}`}
                alt={targetActor.name}
                className="w-32 h-32 object-cover rounded-lg shadow-lg mb-3 mx-auto"
              />
              <p className="font-semibold">{targetActor.name}</p>
              <p className="text-xs text-muted-foreground">Target</p>
            </div>
          </div>

          <div className="flex gap-3 mt-6 justify-center">
            {gameState === 'ready' && (
              <Button
                onClick={startGame}
                size="lg"
                className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
              >
                <Play className="h-4 w-4 mr-2" />
                Start Game
              </Button>
            )}
            {gameState === 'won' && (
              <Button
                onClick={loadRandomActors}
                size="lg"
                className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                New Game
              </Button>
            )}
            {gameState !== 'ready' && (
              <Button
                onClick={resetGame}
                variant="outline"
                size="lg"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Restart
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Game Progress Path */}
      {gameState === 'playing' && path.length > 0 && (
        <Card className="p-4 bg-card border-border">
          <h3 className="text-sm font-semibold mb-3">Your Path ({path.length} steps)</h3>
          <ScrollArea className="h-24">
            <div className="flex items-center gap-2 pb-2">
              {path.map((step, idx) => (
                <div key={`${step.type}-${step.id}-${idx}`} className="flex items-center gap-2">
                  <div className="text-center shrink-0">
                    <img
                      src={`https://image.tmdb.org/t/p/w92${step.image}`}
                      alt={step.name}
                      className={`${step.type === 'actor' ? 'w-12 h-12 rounded-full' : 'w-8 h-12 rounded'} object-cover shadow`}
                    />
                    <p className="text-xs mt-1 max-w-[80px] truncate">{step.name}</p>
                  </div>
                  {idx < path.length - 1 && (
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>
      )}

      {/* Current View */}
      {gameState === 'playing' && (
        <Card className="p-4 bg-card border-border">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : viewMode === 'filmography' ? (
            <div>
              <h3 className="text-lg font-semibold mb-4">
                {currentActor?.name}'s Filmography
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {filmography.map((credit) => (
                  <button
                    key={`${credit.type}-${credit.id}`}
                    onClick={() => loadCast(credit.id, credit.type, credit.title, credit.posterPath)}
                    className="text-left hover-scale transition-transform"
                  >
                    <img
                      src={`https://image.tmdb.org/t/p/w185${credit.posterPath}`}
                      alt={credit.title}
                      className="w-full aspect-[2/3] object-cover rounded-lg shadow-lg mb-2"
                    />
                    <p className="text-sm font-medium line-clamp-2">{credit.title}</p>
                    {credit.year && (
                      <p className="text-xs text-muted-foreground">{credit.year}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <h3 className="text-lg font-semibold mb-4">
                Cast of {path[path.length - 1].name}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {cast.map((actor) => (
                  <button
                    key={actor.id}
                    onClick={() => selectActor(actor)}
                    className={`text-center hover-scale transition-transform ${
                      actor.id === targetActor?.id ? 'ring-2 ring-primary rounded-lg' : ''
                    }`}
                  >
                    <img
                      src={`https://image.tmdb.org/t/p/w185${actor.profilePath}`}
                      alt={actor.name}
                      className="w-full aspect-[2/3] object-cover rounded-lg shadow-lg mb-2"
                    />
                    <p className="text-sm font-medium">{actor.name}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {actor.character}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

export default DailyPuzzle;