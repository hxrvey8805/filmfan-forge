import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, Trophy, RotateCcw, Timer, ArrowRight, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import PackOpeningModal from '@/components/PackOpeningModal';
import { ScrollArea } from '@/components/ui/scroll-area';

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
  const [gameState, setGameState] = useState<GameState>('loading');
  const [startActor, setStartActor] = useState<Actor | null>(null);
  const [targetActor, setTargetActor] = useState<Actor | null>(null);
  const [currentActor, setCurrentActor] = useState<Actor | null>(null);
  const [filmography, setFilmography] = useState<Credit[]>([]);
  const [cast, setCast] = useState<CastMember[]>([]);
  const [path, setPath] = useState<PathStep[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('filmography');
  const [timeLeft, setTimeLeft] = useState<number>(120);
  const [gameStartTime, setGameStartTime] = useState<number | null>(null);
  const [showPackModal, setShowPackModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Restore persisted actors if available to avoid re-randomizing on navigation
    try {
      const savedStart = localStorage.getItem('dp_startActor');
      const savedTarget = localStorage.getItem('dp_targetActor');
      if (savedStart && savedTarget) {
        setStartActor(JSON.parse(savedStart));
        setTargetActor(JSON.parse(savedTarget));
        setGameState('ready');
        return; // do not fetch new actors
      }
    } catch (_) {}
    loadRandomActors();
  }, []);

  // Timer countdown
  useEffect(() => {
    if (gameState === 'playing' && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            setGameState('ready');
            toast({
              title: "Time's up!",
              description: "You ran out of time. Try again!",
              variant: "destructive",
            });
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [gameState, timeLeft, toast]);

  const loadRandomActors = async () => {
    setGameState('loading');
    try {
      const { data, error } = await supabase.functions.invoke('actor-connect', {
        body: { action: 'getRandomActors' }
      });

      if (error) throw error;
      
      setStartActor(data.actors[0]);
      setTargetActor(data.actors[1]);
      // Persist to avoid auto-randomizing on navigation
      localStorage.setItem('dp_startActor', JSON.stringify(data.actors[0]));
      localStorage.setItem('dp_targetActor', JSON.stringify(data.actors[1]));
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
    setTimeLeft(120);
    setGameStartTime(Date.now());
    
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
    const timeTaken = gameStartTime ? Math.floor((Date.now() - gameStartTime) / 1000) : 0;
    
    // Check if this is the target actor
    if (actor.id === targetActor?.id) {
      setPath(prev => [...prev, {
        type: 'actor',
        id: actor.id,
        name: actor.name,
        image: actor.profilePath
      }]);
      
      const wonInTime = timeTaken <= 120;
      setGameState('won');
      
      if (wonInTime) {
        toast({
          title: "🎉 Perfect! You won!",
          description: `Connected in ${path.length + 1} steps and ${timeTaken}s. You earned a free pack!`,
        });
        setTimeout(() => setShowPackModal(true), 1500);
      } else {
        toast({
          title: "🎉 You won!",
          description: `Connected in ${path.length + 1} steps, but took ${timeTaken}s. Complete in under 2 minutes to earn a pack!`,
        });
      }
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
    setTimeLeft(120);
    setGameStartTime(null);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (gameState === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Strengthen filtering on client as well to ensure only movies/TV and exclude talk/news/etc.
  const TALK_TITLE_RE = /(Tonight|Talk|Late|Kimmel|Norton|Clarkson|Ellen|View|Awards|Wetten|Parkinson|Skavlan|Golden\s?Globes?|Oscars?|Graham Norton|Kelly Clarkson|Jimmy Kimmel|The Tonight Show|The View|Live!|Variety|Actors on Actors)/i;
  const filteredFilmography = filmography.filter((c) =>
    (c.type === 'movie' || c.type === 'tv') && !TALK_TITLE_RE.test(c.title)
  );

  return (
    <div className="max-w-4xl mx-auto space-y-5 animate-fade-in pb-4">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent tracking-tight">
          Actor Connect
        </h1>
        <p className="text-sm text-muted-foreground px-4">
          Connect in under 2 minutes to earn a free pack!
        </p>
      </div>

      {/* Start and Target Actors */}
      {(gameState === 'ready' || gameState === 'won') && startActor && targetActor && (
        <div className="grid grid-cols-2 gap-4 px-1">
          <Card className="p-4 bg-gradient-to-br from-card to-secondary border-primary/50 shadow-lg">
            <div className="space-y-3">
              <Badge variant="outline" className="bg-primary/10 text-xs font-semibold">Start</Badge>
              <div className="aspect-square bg-muted rounded-xl flex items-center justify-center overflow-hidden shadow-md">
                {startActor.profilePath ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w500${startActor.profilePath}`}
                    alt={startActor.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="h-16 w-16 text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="font-bold text-base leading-tight">{startActor.name}</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4 bg-gradient-to-br from-card to-secondary border-accent/50 shadow-lg">
            <div className="space-y-3">
              <Badge variant="outline" className="bg-accent/10 text-xs font-semibold">Target</Badge>
              <div className="aspect-square bg-muted rounded-xl flex items-center justify-center overflow-hidden shadow-md">
                {targetActor.profilePath ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w500${targetActor.profilePath}`}
                    alt={targetActor.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="h-16 w-16 text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="font-bold text-base leading-tight">{targetActor.name}</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Target reminder while playing */}
      {gameState === 'playing' && targetActor && (
        <Card className="p-3 bg-card/50 shadow-md mx-1 flex items-center gap-3">
          <img
            src={`https://image.tmdb.org/t/p/w92${targetActor.profilePath}`}
            alt={targetActor.name}
            className="w-10 h-10 rounded-full object-cover"
          />
          <div>
            <p className="text-xs text-muted-foreground">Target</p>
            <p className="text-sm font-semibold leading-tight">{targetActor.name}</p>
          </div>
        </Card>
      )}

      {/* Timer and Progress */}
      {gameState === 'playing' && (
        <div className="flex gap-3 px-1">
          <Card className="flex-1 p-4 bg-card/50 shadow-md">
            <div className="flex items-center gap-2 justify-center">
              <Timer className={`h-5 w-5 ${timeLeft <= 30 ? 'text-destructive' : 'text-primary'}`} />
              <span className={`font-mono font-bold text-lg ${timeLeft <= 30 ? 'text-destructive' : 'text-primary'}`}>
                {formatTime(timeLeft)}
              </span>
            </div>
          </Card>
          <Card className="flex-1 p-4 bg-card/50 shadow-md">
            <div className="flex items-center gap-2 justify-center">
              <Trophy className="h-5 w-5 text-accent" />
              <span className="font-bold text-lg text-accent">{path.length} steps</span>
            </div>
          </Card>
        </div>
      )}

      {/* Game Progress Path */}
      {gameState === 'playing' && path.length > 0 && (
        <Card className="p-4 bg-card/50 shadow-md mx-1">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Path:</p>
            <ScrollArea className="h-24">
              <div className="flex items-center gap-2 pb-2">
                {path.map((step, idx) => (
                  <div key={`${step.type}-${step.id}-${idx}`} className="flex items-center gap-2">
                    <div className="text-center shrink-0">
                      <img
                        src={`https://image.tmdb.org/t/p/w92${step.image}`}
                        alt={step.name}
                        className={`${step.type === 'actor' ? 'w-12 h-12 rounded-full' : 'w-8 h-12 rounded'} object-cover shadow-md`}
                      />
                      <p className="text-xs mt-1.5 max-w-[65px] truncate font-medium">{step.name}</p>
                    </div>
                    {idx < path.length - 1 && (
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </Card>
      )}

      {/* Current View */}
      {gameState === 'playing' && (
        <Card className="p-5 bg-card border-border shadow-lg mx-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
          ) : viewMode === 'filmography' ? (
            <div>
              <h3 className="text-lg font-semibold mb-4 tracking-tight">
                {currentActor?.name}'s Filmography
              </h3>
              <div className="grid grid-cols-3 gap-4">
                {filteredFilmography.map((credit) => (
                  <button
                    key={`${credit.type}-${credit.id}`}
                    onClick={() => loadCast(credit.id, credit.type, credit.title, credit.posterPath)}
                    className="text-left active:scale-95 transition-transform focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background rounded-lg"
                  >
                    <img
                      src={`https://image.tmdb.org/t/p/w342${credit.posterPath}`}
                      alt={credit.title}
                      className="w-full aspect-[2/3] object-cover rounded-lg shadow-lg mb-2"
                    />
                    <p className="text-xs font-medium line-clamp-2 leading-tight">{credit.title}</p>
                    {credit.year && (
                      <p className="text-xs text-muted-foreground mt-0.5">{credit.year}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <h3 className="text-lg font-semibold mb-4 tracking-tight">
                Cast of {path[path.length - 1].name}
              </h3>
              <div className="grid grid-cols-3 gap-4">
                {cast.map((actor) => (
                  <button
                    key={actor.id}
                    onClick={() => selectActor(actor)}
                    className={`text-center active:scale-95 transition-transform focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background rounded-lg ${
                      actor.id === targetActor?.id ? 'ring-2 ring-primary' : ''
                    }`}
                  >
                    <img
                      src={`https://image.tmdb.org/t/p/w342${actor.profilePath}`}
                      alt={actor.name}
                      className="w-full aspect-[2/3] object-cover rounded-lg shadow-lg mb-2"
                    />
                    <p className="text-xs font-medium leading-tight">{actor.name}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                      {actor.character}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Start/Reset Buttons */}
      {gameState === 'ready' && (
        <div className="px-1 flex gap-3">
          <Button 
            onClick={loadRandomActors}
            size="lg"
            variant="outline"
            className="flex-1 min-h-[56px] text-base font-semibold"
          >
            <RotateCcw className="mr-2 h-5 w-5" />
            Randomize
          </Button>
          <Button 
            onClick={startGame} 
            size="lg"
            className="flex-1 bg-gradient-to-r from-primary to-accent hover:opacity-90 min-h-[56px] text-base font-semibold"
          >
            <Timer className="mr-2 h-5 w-5" />
            Start Game
          </Button>
        </div>
      )}

      {gameState === 'won' && (
        <div className="flex gap-3 px-1">
          <Button 
            onClick={resetGame}
            variant="outline"
            size="lg"
            className="flex-1 min-h-[52px]"
          >
            <RotateCcw className="mr-2 h-5 w-5" />
            Retry
          </Button>
          <Button 
            onClick={() => {
              loadRandomActors();
              setGameState('loading');
            }}
            size="lg"
            className="flex-1 bg-gradient-to-r from-primary to-accent hover:opacity-90 min-h-[52px]"
          >
            New Game
          </Button>
        </div>
      )}

      {/* Pack Opening Modal */}
      <PackOpeningModal
        isOpen={showPackModal}
        onClose={() => setShowPackModal(false)}
        packType="reward"
      />
    </div>
  );
};

export default DailyPuzzle;
