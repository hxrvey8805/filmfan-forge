import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, Trophy, RotateCcw, Timer, ArrowRight, Loader2, Tv } from 'lucide-react';
import { GlassesWithLenses } from "@/components/GlassesWithLenses";
import { useToast } from '@/hooks/use-toast';
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
  order?: number; // Lower order = main cast
}

type PathStep = {
  type: 'actor' | 'movie' | 'tv';
  id: number;
  name: string;
  image: string;
};

type GameState = 'loading' | 'ready' | 'playing' | 'won';
type ViewMode = 'filmography' | 'cast';
type FilmographyFilter = 'movies' | 'tv';

const DailyPuzzle = () => {
  const [gameState, setGameState] = useState<GameState>('loading');
  const [startActor, setStartActor] = useState<Actor | null>(null);
  const [targetActor, setTargetActor] = useState<Actor | null>(null);
  const [currentActor, setCurrentActor] = useState<Actor | null>(null);
  const [filmography, setFilmography] = useState<Credit[]>([]);
  const [cast, setCast] = useState<CastMember[]>([]);
  const [path, setPath] = useState<PathStep[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('filmography');
  const [filmographyFilter, setFilmographyFilter] = useState<FilmographyFilter>('movies');
  const [timeLeft, setTimeLeft] = useState<number>(120);
  const [gameStartTime, setGameStartTime] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [randomizeCount, setRandomizeCount] = useState<number>(0);
  const [isRandomizing, setIsRandomizing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Restore persisted actors if available to avoid re-randomizing on navigation
    try {
      const savedStart = localStorage.getItem('dp_startActor');
      const savedTarget = localStorage.getItem('dp_targetActor');
      const savedRandomizeCount = localStorage.getItem('dp_randomizeCount');
      if (savedStart && savedTarget) {
        setStartActor(JSON.parse(savedStart));
        setTargetActor(JSON.parse(savedTarget));
        setGameState('ready');
        // Dispatch game state change event
        window.dispatchEvent(new CustomEvent('gameStateChange', { detail: 'ready' }));
        if (savedRandomizeCount) {
          setRandomizeCount(parseInt(savedRandomizeCount, 10));
        }
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
            toast({
              title: "Time's up!",
              description: "Loading new actors...",
              variant: "destructive",
            });
            // Randomize actors when time runs out
            setGameState('ready');
            window.dispatchEvent(new CustomEvent('gameStateChange', { detail: 'ready' }));
            loadRandomActors();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [gameState, timeLeft, toast]);

  const loadRandomActors = async () => {
    // Check if randomize limit reached
    if (randomizeCount >= 3) {
      toast({
        title: "Randomize limit reached",
        description: "You've used all 3 randomizes. Start the game to continue!",
        variant: "destructive"
      });
      return;
    }

    setIsRandomizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('actor-connect', {
        body: { action: 'getRandomActors' }
      });

      if (error) throw error;
      
      const newCount = randomizeCount + 1;
      
      // Small delay for smooth transition
      await new Promise(resolve => setTimeout(resolve, 300));
      
      setStartActor(data.actors[0]);
      setTargetActor(data.actors[1]);
      setRandomizeCount(newCount);
      // Persist to avoid auto-randomizing on navigation
      localStorage.setItem('dp_startActor', JSON.stringify(data.actors[0]));
      localStorage.setItem('dp_targetActor', JSON.stringify(data.actors[1]));
      localStorage.setItem('dp_randomizeCount', newCount.toString());
      
      // Small delay before hiding loading state
      setTimeout(() => {
        setIsRandomizing(false);
      }, 200);
    } catch (error) {
      console.error('Error loading actors:', error);
      setIsRandomizing(false);
      toast({
        title: "Error",
        description: "Failed to load actors. Please try again.",
        variant: "destructive"
      });
    }
  };

  const startGame = async () => {
    if (!startActor) return;
    
    // Reset randomize count when starting game
    setRandomizeCount(0);
    localStorage.removeItem('dp_randomizeCount');
    
    setGameState('playing');
    // Dispatch game state change event
    window.dispatchEvent(new CustomEvent('gameStateChange', { detail: 'playing' }));
    
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
      
      // Detailed logging to debug cast member issue
      console.log(`=== CAST DATA FOR ${title} (${type}) - ID: ${contentId} ===`);
      console.log('Full response from backend:', data);
      console.log('Cast array:', data.cast);
      console.log('Cast count:', data.cast?.length || 0);
      
      // Validate response
      if (!data || !data.cast || !Array.isArray(data.cast)) {
        console.error('❌ Invalid cast response:', data);
        toast({
          title: "Error",
          description: "Invalid cast data received",
          variant: "destructive"
        });
        setCast([]);
        return;
      }
      
      // Log all cast members received
      if (data.cast && Array.isArray(data.cast)) {
        console.log('All cast members received:', data.cast.map((c: any) => ({
          id: c.id,
          name: c.name,
          character: c.character,
          hasPhoto: !!c.profilePath,
          order: c.order,
          episodeCount: c.episodeCount
        })));
        
        // Check if any cast members are missing photos
        const withoutPhotos = data.cast.filter((c: any) => !c.profilePath);
        if (withoutPhotos.length > 0) {
          console.warn(`⚠️ ${withoutPhotos.length} cast members missing photos:`, 
            withoutPhotos.map((c: any) => `${c.name} (ID: ${c.id})`)
          );
        }
      }
      
      console.log(`✅ Loaded ${data.cast.length} cast members for ${title} (${type})`);
      setCast(data.cast);
    } catch (error) {
      console.error('Error loading cast:', error);
      toast({
        title: "Error",
        description: "Failed to load cast",
        variant: "destructive"
      });
      setCast([]);
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
      // Dispatch game state change event
      window.dispatchEvent(new CustomEvent('gameStateChange', { detail: 'won' }));
      
      if (wonInTime) {
        // Award 75 coins
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            // Get or create user stats
            let { data: stats } = await supabase
              .from('user_stats')
              .select('*')
              .eq('user_id', user.id)
              .single();

            if (!stats) {
              const { data: newStats } = await supabase
                .from('user_stats')
                .insert({ user_id: user.id, coins: 100 })
                .select()
                .single();
              stats = newStats;
            }

            if (stats) {
              await supabase
                .from('user_stats')
                .update({ coins: stats.coins + 75 })
                .eq('user_id', user.id);
            }
          }
        } catch (error) {
          console.error('Error awarding coins:', error);
        }
        
        toast({
          title: "🎉 Perfect! You won!",
          description: `Connected in ${path.length + 1} steps and ${timeTaken}s. You earned 75 coins!`,
        });
      } else {
        toast({
          title: "🎉 You won!",
          description: `Connected in ${path.length + 1} steps, but took ${timeTaken}s. Complete in under 2 minutes to earn 75 coins!`,
        });
      }
      
      // Auto-randomize actors for next game
      localStorage.removeItem('dp_startActor');
      localStorage.removeItem('dp_targetActor');
      localStorage.removeItem('dp_randomizeCount');
      setRandomizeCount(0);
      // Dispatch game state change event
      window.dispatchEvent(new CustomEvent('gameStateChange', { detail: 'ready' }));
      setTimeout(() => {
        loadRandomActors();
      }, 2000);
      
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
    // Dispatch game state change event
    window.dispatchEvent(new CustomEvent('gameStateChange', { detail: 'ready' }));
    
    setCurrentActor(null);
    setFilmography([]);
    setCast([]);
    setPath([]);
    setViewMode('filmography');
    setTimeLeft(120);
    setGameStartTime(null);
    setRandomizeCount(0);
    localStorage.removeItem('dp_randomizeCount');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (gameState === 'loading' && !startActor && !targetActor) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Strengthen filtering on client as well to ensure only movies/TV and exclude talk/news/etc.
  const TALK_TITLE_RE = /(Tonight|Talk|Late|Kimmel|Norton|Clarkson|Ellen|View|Awards|Wetten|Parkinson|Skavlan|Golden\s?Globes?|Oscars?|Graham Norton|Kelly Clarkson|Jimmy Kimmel|The Tonight Show|The View|Live!|Variety|Actors on Actors)/i;
  const BTS_TITLE_RE = /(Behind the Scenes|Making[- ]?of|Featurette|Interview|Press|Promo|Teaser|Clip|Bloopers|Outtakes|Red Carpet|Special)/i;
  
  // Deduplicate by ID and filter
  const seenIds = new Set<string>();
  const filteredFilmography = filmography.filter((c) => {
    const key = `${c.type}-${c.id}`;
    if (seenIds.has(key)) return false;
    seenIds.add(key);
    return (c.type === 'movie' || c.type === 'tv') && !TALK_TITLE_RE.test(c.title) && !BTS_TITLE_RE.test(c.title) && !/\bself\b|himself|herself/i.test(c.character || '');
  });

  // Split into movies and TV shows
  const movies = filteredFilmography.filter((c) => c.type === 'movie');
  const tvShows = filteredFilmography.filter((c) => c.type === 'tv');

  return (
    <div className="max-w-4xl mx-auto space-y-5 animate-fade-in pb-4">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent tracking-tight">
          Actor Connect
        </h1>
        <p className="text-sm text-muted-foreground px-4">
          Connect in under 2 minutes to earn 75 coins!
        </p>
      </div>

      {/* Randomize Counter Display - Cinematic */}
      {gameState === 'ready' && (
        <div className="px-1">
          <Card className="relative overflow-hidden backdrop-blur-md bg-gradient-to-br from-card/80 to-card/60 border-2 border-primary/30 shadow-lg group">
            {/* Animated Gradient Background */}
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 opacity-50 group-hover:opacity-75 transition-opacity duration-500" />
            <div className="absolute inset-0 bg-gradient-to-br from-transparent via-primary/5 to-transparent" />
            
            {/* Glow Effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 rounded-lg blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10" />
            
            <div className="relative p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/30 blur-2xl rounded-full animate-pulse" />
                  <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-primary/40 to-accent/30 flex items-center justify-center border border-primary/50 backdrop-blur-sm">
                    <RotateCcw className="h-5 w-5 text-primary drop-shadow-lg" />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                    Randomizes Remaining
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {randomizeCount >= 3 ? 'Limit reached - Start game to continue' : 'Get new actors before starting'}
                  </p>
                </div>
              </div>
              
              {/* Progress Display */}
              <div className="flex items-center gap-2">
                {[1, 2, 3].map((num) => (
                  <div
                    key={num}
                    className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500 ${
                      num <= (3 - randomizeCount)
                        ? 'bg-gradient-to-br from-primary/40 to-accent/30 border-2 border-primary/50 shadow-lg scale-100'
                        : 'bg-muted/30 border-2 border-border/50 scale-90 opacity-50'
                    }`}
                  >
                    {num <= (3 - randomizeCount) ? (
                      <>
                        <div className="absolute inset-0 bg-primary/20 blur-md rounded-full animate-pulse" />
                        <span className="relative text-lg font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                          {num}
                        </span>
                      </>
                    ) : (
                      <span className="text-sm font-semibold text-muted-foreground">✓</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Start and Target Actors */}
      {(gameState === 'ready' || gameState === 'won') && startActor && targetActor && (
        <div className="grid grid-cols-2 gap-4 px-1">
          <Card className="p-4 bg-gradient-to-br from-card to-secondary border-primary/50 shadow-lg relative overflow-hidden">
            <div className="space-y-3">
              <Badge variant="outline" className="bg-primary/10 text-xs font-semibold">Start</Badge>
              <div className="aspect-square bg-muted rounded-xl flex items-center justify-center overflow-hidden shadow-md relative">
                {isRandomizing && (
                  <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                )}
                {startActor.profilePath ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w500${startActor.profilePath}`}
                    alt={startActor.name}
                    className={`w-full h-full object-cover transition-opacity duration-300 ${isRandomizing ? 'opacity-0' : 'opacity-100'}`}
                    key={startActor.id} // Force re-render on change
                  />
                ) : (
                  <User className="h-16 w-16 text-muted-foreground" />
                )}
              </div>
              <div className={`transition-opacity duration-300 ${isRandomizing ? 'opacity-50' : 'opacity-100'}`}>
                <p className="font-bold text-base leading-tight">{startActor.name}</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4 bg-gradient-to-br from-card to-secondary border-accent/50 shadow-lg relative overflow-hidden">
            <div className="space-y-3">
              <Badge variant="outline" className="bg-accent/10 text-xs font-semibold">Target</Badge>
              <div className="aspect-square bg-muted rounded-xl flex items-center justify-center overflow-hidden shadow-md relative">
                {isRandomizing && (
                  <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-accent" />
                  </div>
                )}
                {targetActor.profilePath ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w500${targetActor.profilePath}`}
                    alt={targetActor.name}
                    className={`w-full h-full object-cover transition-opacity duration-300 ${isRandomizing ? 'opacity-0' : 'opacity-100'}`}
                    key={targetActor.id} // Force re-render on change
                  />
                ) : (
                  <User className="h-16 w-16 text-muted-foreground" />
                )}
              </div>
              <div className={`transition-opacity duration-300 ${isRandomizing ? 'opacity-50' : 'opacity-100'}`}>
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
            <div className="space-y-4">
              {/* Filter Toggle Buttons */}
              <div className="flex gap-2">
                <Button
                  variant={filmographyFilter === 'movies' ? 'default' : 'outline'}
                  onClick={() => setFilmographyFilter('movies')}
                  className="flex-1"
                >
                  <GlassesWithLenses className="h-4 w-4 mr-2" />
                  Movies ({movies.length})
                </Button>
                <Button
                  variant={filmographyFilter === 'tv' ? 'default' : 'outline'}
                  onClick={() => setFilmographyFilter('tv')}
                  className="flex-1"
                >
                  <Tv className="h-4 w-4 mr-2" />
                  TV Shows ({tvShows.length})
                </Button>
              </div>

              {/* Display selected category */}
              <div className="grid grid-cols-3 gap-4">
                {(filmographyFilter === 'movies' ? movies : tvShows).map((credit) => (
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
            <div className="space-y-6">
              <h3 className="text-lg font-semibold tracking-tight">
                Cast of {path[path.length - 1].name}
              </h3>
              
              {/* Group cast by order - main cast first, then supporting, then rest */}
              {(() => {
                const mainCast = cast.filter(actor => (actor.order ?? 999) < 10);
                const supportingCast = cast.filter(actor => {
                  const order = actor.order ?? 999;
                  return order >= 10 && order < 50;
                });
                const restOfCast = cast.filter(actor => (actor.order ?? 999) >= 50);

                return (
                  <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2">
                    {/* Main Cast */}
                    {mainCast.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                            Main Cast
                          </Badge>
                          <span className="text-xs text-muted-foreground">({mainCast.length})</span>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          {mainCast.map((actor) => (
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

                    {/* Supporting Cast */}
                    {supportingCast.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-accent/10 text-accent border-accent/30">
                            Supporting Cast
                          </Badge>
                          <span className="text-xs text-muted-foreground">({supportingCast.length})</span>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          {supportingCast.map((actor) => (
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

                    {/* Rest of Cast */}
                    {restOfCast.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-muted/20 text-muted-foreground border-border">
                            Cast
                          </Badge>
                          <span className="text-xs text-muted-foreground">({restOfCast.length})</span>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          {restOfCast.map((actor) => (
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
                  </div>
                );
              })()}
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
            disabled={randomizeCount >= 3}
            className="flex-1 min-h-[56px] text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCcw className="mr-2 h-5 w-5" />
            Randomize {randomizeCount >= 3 ? '(Limit Reached)' : `(${3 - randomizeCount} left)`}
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
              setGameState('loading');
              window.dispatchEvent(new CustomEvent('gameStateChange', { detail: 'loading' }));
              loadRandomActors();
            }}
            size="lg"
            className="flex-1 bg-gradient-to-r from-primary to-accent hover:opacity-90 min-h-[52px]"
          >
            New Game
          </Button>
        </div>
      )}

      {/* Removed Pack Opening Modal - go to Packs page to open earned packs */}
    </div>
  );
};

export default DailyPuzzle;
