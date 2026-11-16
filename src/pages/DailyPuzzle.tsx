import { useProAccess } from "@/hooks/use-pro-access";
import { accountChanged } from "@/lib/pro-access";
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { tierRpc } from '@/lib/tier-rpc';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { RotateCcw, Timer, ArrowRight, Loader2, Tv, Search } from 'lucide-react';
import { GlassesWithLenses } from "@/components/GlassesWithLenses";
import { ActorCastPicker, CastArt } from "@/components/ActorCastPicker";
import { orderedGameCast } from "@/lib/game-cast";
import type { GameCastMember as CastMember } from "../../supabase/functions/_shared/actor-cast";
import { ShufflePortrait } from "@/components/ShufflePortrait";
import { useToast } from '@/hooks/use-toast';

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

type PathStep = {
  type: 'actor' | 'movie' | 'tv';
  id: number;
  name: string;
  image: string;
};

type GameState = 'loading' | 'unavailable' | 'ready' | 'playing' | 'checking' | 'won';
type ViewMode = 'filmography' | 'cast';
type FilmographyFilter = 'movies' | 'tv';

const DailyPuzzle = () => {
  const pairRef = useRef<HTMLDivElement>(null);
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
  const [filmographySearch, setFilmographySearch] = useState("");
  const [castError, setCastError] = useState(false);
  const loadId = useRef(0);
  const backCredit = useRef<string | null>(null);
  const { toast } = useToast();
  const access=useProAccess();
  const gameId=useRef<string|null>(null);
  const [starting,setStarting]=useState(false);
  const [resultError,setResultError]=useState('');
  const [reward,setReward]=useState(0);
  const frozenPath=useRef<PathStep[]|null>(null);
  const expiry=useRef<number|null>(null);

  useEffect(() => {
    if (viewMode !== 'filmography' || !backCredit.current) return;
    document.querySelector<HTMLButtonElement>(`[data-game-credit="${backCredit.current}"]`)?.focus();
    backCredit.current = null;
  }, [viewMode]);

  useEffect(() => { void loadRandomActors(); }, []);

  // The display follows the server deadline, including time spent backgrounded.
  useEffect(()=>{
    if(gameState!=='playing')return;
    const tick=()=>{const seconds=Math.max(0,Math.ceil(((expiry.current??Date.now())-Date.now())/1000));setTimeLeft(seconds);
      if(seconds===0){setGameState('ready');window.dispatchEvent(new CustomEvent('gameStateChange',{detail:'ready'}));accountChanged();toast({title:"Time’s up",description:"This round has ended."});}};
    const timer=window.setInterval(tick,500);tick();return()=>clearInterval(timer);
  },[gameState]);

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

      if (error || data?.actors?.length !== 2) throw error ?? new Error('No playable actor pair');
      
      const newCount = randomizeCount + 1;
      
      // Small delay for smooth transition
      await new Promise(resolve => setTimeout(resolve, 300));
      
      gameId.current=null;
      setStartActor(data.actors[0]);
      setTargetActor(data.actors[1]);
      setGameState('ready');
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
      setGameState(startActor && targetActor ? 'ready' : 'unavailable');
      setIsRandomizing(false);
      toast({
        title: "Error",
        description: "Failed to load actors. Please try again.",
        variant: "destructive"
      });
    }
  };

  const shufflePair = () => {
    const pair = pairRef.current;
    if (pair) {
      const { top, bottom } = pair.getBoundingClientRect();
      const headerBottom = document.querySelector(".app-header")?.getBoundingClientRect().bottom ?? 0;
      const navTop = document.querySelector(".app-bottom-nav")?.getBoundingClientRect().top ?? window.innerHeight;
      if (top < headerBottom || bottom > navTop) {
        pair.scrollIntoView({ block: "start", behavior: "instant" });
      }
    }
    void loadRandomActors();
  };

  const startGame = async () => {
    if(!startActor||!targetActor||starting||!access)return;
    setStarting(true);
    const id=gameId.current??crypto.randomUUID();gameId.current=id;
    try{
      const {data,error}=await tierRpc('start_cinegeek_game',{p_game:id,p_start:startActor.id,p_target:targetActor.id});
      if(error)throw new Error(error.message);
      const game=data as {expires_at:string;status:string};
      if(game.status!=='playing'||Date.parse(game.expires_at)<=Date.now()){gameId.current=null;throw new Error('That round has ended. Start a new game.');}
      expiry.current=Date.parse(game.expires_at);setTimeLeft(Math.max(0,Math.ceil((expiry.current-Date.now())/1000)));
      setGameStartTime(Date.now());setRandomizeCount(0);setResultError('');setReward(0);frozenPath.current=null;
      setGameState('playing');window.dispatchEvent(new CustomEvent('gameStateChange',{detail:'playing'}));accountChanged();
      setCurrentActor(startActor);setPath([{type:'actor',id:startActor.id,name:startActor.name,image:startActor.profilePath}]);
      await loadFilmography(startActor.id);
    }catch(e){toast({variant:'destructive',title:'Couldn’t start this game',description:e instanceof Error?e.message:'Try again to check this same round.'});}
    finally{setStarting(false);}
  };

  const loadFilmography = async (actorId: number) => {
    const request = ++loadId.current;
    setFilmography([]);
    setIsLoading(true);
    setViewMode('filmography');
    setFilmographySearch("");
    try {
      const { data, error } = await supabase.functions.invoke('actor-connect', {
        body: { action: 'getActorFilmography', actorId, gameId:gameId.current }
      });

      if (request !== loadId.current) return;
      if (error || !Array.isArray(data?.credits)) throw error ?? new Error('Invalid credits');
      const credits: Credit[] = data.credits;
      setFilmography(credits);
      setFilmographyFilter(previous => {
        const movies = credits.some(credit => credit.type === 'movie');
        const tv = credits.some(credit => credit.type === 'tv');
        return movies && tv ? previous : tv ? 'tv' : 'movies';
      });
    } catch (error) {
      if (request !== loadId.current) return;
      console.error('Error loading filmography:', error);
      toast({
        title: "Error",
        description: "Failed to load filmography",
        variant: "destructive"
      });
    } finally {
      if (request === loadId.current) setIsLoading(false);
    }
  };

  const loadCast = async (contentId: number, type: string, title: string, posterPath: string) => {
    setIsLoading(true);
    setViewMode('cast');
    const request = ++loadId.current;
    setCastError(false);
    setCast([]);
    
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
        body: { action, [idKey]: contentId, gameId:gameId.current }
      });

      if (request !== loadId.current) return;
      if (error || !Array.isArray(data?.cast)) throw error ?? new Error('Invalid cast');
      setCast(orderedGameCast(data.cast, type, data.castVersion));
    } catch (error) {
      if (request !== loadId.current) return;
      console.error('Error loading cast:', error);
      setCastError(true);
    } finally {
      if (request === loadId.current) setIsLoading(false);
    }
  };

  const backToCredits = () => {
    const title = path[path.length - 1];
    backCredit.current = `${title.type}-${title.id}`;
    setPath(previous => previous.slice(0, -1));
    setViewMode('filmography');
  };

  const submitWin=async()=>{
    if(!frozenPath.current||!gameId.current)return;
    setResultError('');setIsLoading(true);
    try{
      const {data,error}=await supabase.functions.invoke('game-result',{body:{gameId:gameId.current,path:frozenPath.current.map(({type,id})=>({type,id}))}});
      if(error||data?.error)throw new Error(data?.error??'Your result is saved. Retry verification shortly.');
      if(!data?.won)throw new Error('That path could not be verified as a win.');
      setReward(data.xp);setGameState('won');accountChanged();window.dispatchEvent(new CustomEvent('gameStateChange',{detail:'won'}));
      toast({variant:'success',title:`${data.xp} XP earned`,description:data.xp===0?'You have reached today’s XP cap.':'Connection verified!'});
    }catch(e){setResultError(e instanceof Error?e.message:'Please retry verification.');}
    finally{setIsLoading(false);}
  };
  const selectActor = async (actor: CastMember) => {
    if(gameState!=='playing'||isLoading)return;
    if(path.some(p=>p.type==='actor'&&p.id===actor.id)){toast({title:'Try a new connection',description:'An actor can only appear once in a path.'});return;}
    if(path.length>=20 && actor.id!==targetActor?.id){toast({title:'Path limit reached',description:'Reach the target within ten connections.'});return;}
    if(actor.id===targetActor?.id){
      const finished=[...path,{type:'actor' as const,id:actor.id,name:actor.name,image:actor.profilePath}];
      frozenPath.current=finished;setPath(finished);setGameState('checking');await submitWin();return;
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
    if(gameId.current)void tierRpc('end_cinegeek_game',{p_game:gameId.current});
    gameId.current=null;frozenPath.current=null;setResultError('');
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
  if (gameState === 'unavailable') {
    return <Card className="p-6 space-y-4"><h1 className="text-xl font-semibold">Actor Connect</h1>
      <p>We couldn’t load a pair of actors for this round.</p>
      <Button disabled={isRandomizing} onClick={loadRandomActors}>Try again</Button>
    </Card>;
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
  const searchLower = filmographySearch.toLowerCase();
  const movies = filteredFilmography.filter((c) => c.type === 'movie' && (!filmographySearch || c.title.toLowerCase().includes(searchLower)));
  const tvShows = filteredFilmography.filter((c) => c.type === 'tv' && (!filmographySearch || c.title.toLowerCase().includes(searchLower)));

  return (
    <div className="max-w-4xl mx-auto space-y-5 animate-fade-in pb-4">
      <header className="play-subhead"><p className="arcade-kicker"><i /> CineGeek Arcade</p>
        <h1>Actor Connect</h1>
        {gameState === 'ready' && <p className="play-muted">Pick a credit, then a cast member. Reach the target in two minutes to earn up to 75 XP.</p>}
      </header>

      {gameState !== 'playing' && startActor && targetActor && <>
        {gameState === 'won' && <div role="status" className="play-panel"><strong>Connection complete!</strong><p className="play-muted">{path.map(step => step.name).join(' → ')}</p></div>}
        <div className="game-pair" ref={pairRef} aria-busy={isRandomizing}>
          {[startActor, targetActor].map((actor, i) => (
            <div className="game-person" key={i}>
              <small>{i === 0 ? 'Start with' : 'Reach'}</small>
              <ShufflePortrait key={actor.profilePath || actor.id} path={actor.profilePath} name={actor.name} />
              <strong>{actor.name}</strong>
            </div>
          ))}
        </div>
      </>}

      {gameState === 'playing' && targetActor && <>
        <div className="play-panel live-round">
          <CastArt path={targetActor.profilePath} name={targetActor.name} size="w92" className="w-11 h-11 rounded-full object-cover"/>
          <div><small className="play-muted">Your target</small><strong>{targetActor.name}</strong></div>
          <span role="timer" aria-label="Time remaining" className={`flex items-center gap-1 font-mono font-semibold ${timeLeft <= 30 ? 'text-destructive' : 'text-primary'}`}><Timer size={16}/>{formatTime(timeLeft)}</span>
        </div>
        <div><p className="arcade-kicker">Your path · {path.length} {path.length === 1 ? 'step' : 'steps'}</p>
          <ol className="round-path">{path.map((step, idx) => <li key={idx}>{step.name}</li>)}</ol>
        </div>
      </>}

      {/* Current View */}
      {gameState === 'playing' && (
        <Card className="p-3 sm:p-5 bg-card border-border">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
          ) : viewMode === 'filmography' ? (
             <div className="space-y-4">
              <h2 className="play-section-title">Choose a credit{currentActor ? ` for ${currentActor.name}` : ""}</h2>
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  aria-label="Search credits" placeholder="Search credits…"
                  value={filmographySearch}
                  onChange={(e) => setFilmographySearch(e.target.value)}
                  className="pl-9 bg-secondary"
                />
              </div>

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

              {(filmographyFilter === 'movies' ? movies : tvShows).length === 0 && <p className="cast-empty" role="status">
                {filmographySearch.trim() ? "No matching credits. Try another title." : "No credits in this category."}
              </p>}
              <div className="grid grid-cols-2 min-[400px]:grid-cols-3 sm:grid-cols-4 gap-3">
                {(filmographyFilter === 'movies' ? movies : tvShows).map((credit) => (
                  <button
                    key={`${credit.type}-${credit.id}`}
                    data-game-credit={`${credit.type}-${credit.id}`}
                    onClick={() => loadCast(credit.id, credit.type, credit.title, credit.posterPath)}
                    className="text-left active:scale-95 transition-transform focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background rounded-lg"
                  >
                    <CastArt
                      path={credit.posterPath} name={credit.title} size="w342"
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
            <ActorCastPicker cast={cast} title={path[path.length - 1].name} currentId={currentActor?.id}
              targetId={targetActor?.id} error={castError} onSelect={selectActor} onBack={backToCredits} />
          )}
        </Card>
      )}

      {gameState==='checking'&&<div className="play-panel" role="status"><strong>{isLoading?'Checking your connection…':'Verification pending'}</strong>{resultError&&<p className="text-sm mt-2">{resultError}</p>}<Button className="mt-3" disabled={isLoading} onClick={()=>void submitWin()}>Retry verification</Button><Button variant="ghost" disabled={isLoading} onClick={resetGame}>Leave result</Button></div>}
      {gameState==='won'&&<p className="text-primary">{reward} XP earned · daily earning cap 225 XP</p>}
      {gameState==='ready'&&<p className="text-sm text-muted-foreground">{access?.plan==='free'?`${access.gamesRemaining??0} free game remaining today · resets at midnight UTC`:'Pro · unlimited games, up to 225 XP earned daily'}</p>}
      {/* Start/Reset Buttons */}
      {gameState === 'ready' && <div className="game-actions">
        <button className="play-action primary" onClick={startGame} disabled={starting||isRandomizing||!access||access.gamesRemaining===0}>Start game <ArrowRight /></button>
        <button className="play-action" onClick={shufflePair} disabled={starting||isRandomizing || randomizeCount >= 3}>
          <RotateCcw />{isRandomizing ? 'Finding actors…' : `Shuffle pair · ${Math.max(0,3 - randomizeCount)} left`}
        </button>
      </div>}

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
              resetGame();setGameState('loading');
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
