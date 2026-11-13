import { useCompanion } from "@/hooks/use-companion";
import { CompanionTimestamp } from "@/components/CompanionTimestamp";
import { RoomChat, RoomPositionEditor } from "./RoomChat";
import "./screening-room.css";
import { formatTimestamp as formatPosition, type ViewingPosition } from "../../supabase/functions/_shared/companion";
import { useState, useEffect, useRef, useContext } from "react";
import { GeekViewer } from "@/hooks/use-geek-outfit";
import { startingPosition, saveBookmark } from "@/lib/viewing-bookmark";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MoreHorizontal, ArrowLeft, Armchair } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FocusRoom } from "./FocusRoom";
import { GeekWardrobe } from "./GeekWardrobe";
import { PosterArtwork } from "./PosterArtwork";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

interface Title {
  id: number;
  title: string;
  type: "movie" | "tv";
  posterPath: string;
  year?: number;
  progress?: number;
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

const TitleDetailModalContent = ({ title, viewer, open, onOpenChange, onAddToFavourites, onAddToWatchList, onMoveToCurrentlyWatching, onMoveToWatched, sourceList }: TitleDetailModalProps & { viewer: string | null }) => {
  const navigate = useNavigate();
  const panel = useRef<HTMLDivElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [inRoom, setInRoom] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [editingTime, setEditingTime] = useState(false);
  const roomToggle = useRef<HTMLButtonElement>(null);
  const positionButton = useRef<HTMLButtonElement>(null);
  function enterRoom() {
    setInRoom(true);
    backButton.current?.focus();
  }
  function leaveRoom() {
    setChatOpen(false);
    setEditingTime(false);
    setInRoom(false);
    requestAnimationFrame(() => roomToggle.current?.focus());
  }
  // iOS can shrink only the visual viewport while the software keyboard is open.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport || !inRoom) return;
    const el = panel.current;
    const resize = () => {
      el?.style.setProperty("--room-viewport-height", `${viewport.height}px`);
      el?.style.setProperty("--room-viewport-top", `${viewport.offsetTop}px`);
    };
    resize();
    viewport.addEventListener("resize", resize);
    viewport.addEventListener("scroll", resize);
    return () => {
      viewport.removeEventListener("resize", resize);
      viewport.removeEventListener("scroll", resize);
      el?.style.removeProperty("--room-viewport-height");
      el?.style.removeProperty("--room-viewport-top");
    };
  }, [inRoom]);
  const [remainingFree, setRemainingFree] = useState<number | null>(null);
  const [coins, setCoins] = useState(0);
  
  const [point, setPoint] = useState(() => startingPosition(viewer, title));
  const selectedSeason = String(point.seasonNumber ?? "");
  const selectedEpisode = String(point.episodeNumber ?? "");
  const [seasons, setSeasons] = useState<{ seasonNumber: number; name: string; episodeCount: number }[]>([]);
  const [episodes, setEpisodes] = useState<{ episodeNumber: number; name: string; runtime: number }[]>([]);

  // Only an explicit viewing edit moves the bookmark. The Focus clock is independent.
  function changePosition(next: ViewingPosition) {
    setPoint(next);
    saveBookmark(viewer, next);
  }
  const [maxRuntime, setMaxRuntime] = useState(120);
  const [inputValid, setTimestampValid] = useState(true);
  const timestampValid = inputValid && point.seconds <= maxRuntime * 60;
  const position = title.type === "movie" || point.episodeNumber !== undefined ? point : null;
  const { ask, messages, isLoading, historyError } = useCompanion(position, open && timestampValid);

  // Fetch seasons for TV shows
  useEffect(() => {
    let active = true;
    const fetchSeasons = async () => {
      if (title.type !== 'tv') return;

      try {
        const { data, error } = await supabase.functions.invoke('search-content', {
          body: { tvId: title.id }
        });

        if (!active) return;
        if (error) throw error;
        setSeasons(data.seasons || []);
      } catch (error) {
        console.error('Error fetching seasons:', error);
      }
    };

    fetchSeasons();
    return () => { active = false; };
  }, [title.id, title.type]);

  // Fetch episodes when season changes
  useEffect(() => {
    let active = true;
    setEpisodes([]);
    const fetchEpisodes = async () => {
      if (title.type !== 'tv' || !selectedSeason) return;

      try {
        const { data, error } = await supabase.functions.invoke('search-content', {
          body: { tvId: title.id, season: parseInt(selectedSeason) }
        });

        if (!active) return;
        if (error) throw error;
        setEpisodes(data.episodes || []);
      } catch (error) {
        console.error('Error fetching episodes:', error);
      }
    };

    fetchEpisodes();
    return () => { active = false; };
  }, [title.id, title.type, selectedSeason]);

  // Fetch runtime
  useEffect(() => {
    let active = true;
    setMaxRuntime(title.type === 'movie' ? 180 : 120);
    const fetchRuntime = async () => {
      try {
        if (title.type === 'movie') {
          const { data, error } = await supabase.functions.invoke('search-content', {
            body: { movieId: title.id }
          });

          if (!active) return;
          if (error) throw error;
          const runtime = data.runtime || 120;
          setMaxRuntime(runtime);
        } else if (selectedSeason && selectedEpisode) {
          const { data, error } = await supabase.functions.invoke('search-content', {
            body: { 
              tvId: title.id, 
              season: parseInt(selectedSeason),
              episodeNumber: parseInt(selectedEpisode)
            }
          });

          if (!active) return;
          if (error) throw error;
          const runtime = data.runtime || 45;
          setMaxRuntime(runtime);
        }
      } catch (error) {
        console.error('Error fetching runtime:', error);
      }
    };

    fetchRuntime();
    return () => { active = false; };
  }, [title.id, title.type, selectedSeason, selectedEpisode]);

  // Load AI usage, coins, and conversation history when modal opens
  useEffect(() => {
    if (open) {
      loadAIUsage();
      loadUserStats();
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
      const { data: aiUsage } = await supabase
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

      const { data: stats } = await supabase
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

  const timestamp = formatPosition(point.seconds);

  const episodeLabel = title.type === "tv" ? `S${selectedSeason} · E${selectedEpisode}` : "Movie";
  const handleAskQuestion = async (question: string) => {
    const data = await ask(question, timestamp);
    if (data.remainingFreeQuestions !== undefined) setRemainingFree(data.remainingFreeQuestions);
    if (data.usedCoins) setCoins(previous => Math.max(0, previous - data.usedCoins));
    return data.stale ? undefined : data.conversation?.id;
  };

  const listAction = sourceList === "watching" && onMoveToWatched
    ? { label: "Mark as watched", run: () => { onMoveToWatched(title); onOpenChange(false); } }
    : sourceList === "watchlist" && onMoveToCurrentlyWatching
    ? { label: "Start watching", run: () => { onMoveToCurrentlyWatching(title); onOpenChange(false); } }
    : sourceList === "watched" && onAddToFavourites
    ? { label: "Add to favourites", run: () => onAddToFavourites(title) }
    : !sourceList && onAddToWatchList ? { label: "Add to watch list", run: () => onAddToWatchList(title) } : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={panel} className="title-companion p-0 gap-0 flex flex-col overflow-hidden [&>button:last-child]:hidden"
        onEscapeKeyDown={event => {
          if (!inRoom) return;
          event.preventDefault();
          if (chatOpen) setChatOpen(false);
          else leaveRoom();
        }}
        onOpenAutoFocus={event => {
          event.preventDefault();
          opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          backButton.current?.focus();
        }}
        onCloseAutoFocus={event => {
          if (opener.current?.isConnected) {
            event.preventDefault();
            opener.current.focus({ preventScroll: true });
          }
        }}>
        <div className="companion-topbar shrink-0 border-b border-white/10 px-3 flex items-center gap-2 bg-background/95">
          <button ref={backButton} onClick={inRoom ? leaveRoom : () => onOpenChange(false)} aria-label={inRoom ? "Back to viewing setup" : "Back to your titles"} className="flex items-center justify-center rounded-full hover:bg-white/5"><ArrowLeft className="w-5 h-5" /></button>
          <div className="w-8 h-11 shrink-0 rounded overflow-hidden"><PosterArtwork src={title.posterPath} type={title.type} /></div>
          <div className="min-w-0 flex-1 pl-1">
            <DialogTitle className="text-sm truncate">{title.title}</DialogTitle>
            <DialogDescription className="sr-only">Ask about this title at your viewing position or watch with your geek in the screening room.</DialogDescription>
            <p className="text-xs text-muted-foreground mt-1 truncate">{inRoom ? `Screening room · ${episodeLabel}` : "Ask your geek"}</p>
          </div>
          {listAction && <DropdownMenu><DropdownMenuTrigger asChild>
            <button aria-label="Title options" className="grid place-items-center rounded-full text-muted-foreground hover:bg-white/5"><MoreHorizontal size={20} /></button>
          </DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem className="min-h-11" onSelect={listAction.run}>{listAction.label}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
        </div>
        <FocusRoom key={`${selectedSeason}:${selectedEpisode}`} title={title.title} active={inRoom}
          episodeLabel={episodeLabel} validPosition={Boolean(position) && timestampValid} chatting={chatOpen}
          setup={(options, preparing) => <div className="screening-setup companion-scroll">
          <Card className="room-entry">
            <GeekWardrobe compact />
            <div className="room-entry-fields">
              {/* Season & Episode for TV */}
              {title.type === "tv" && (
                <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label htmlFor="companion-season" className="text-xs text-muted-foreground">Season</label>
                    <Select value={selectedSeason} onValueChange={value => {
                      changePosition({ ...point, seasonNumber: Number(value), episodeNumber: undefined, seconds: 0 });
                      setTimestampValid(true);
                    }}>
                      <SelectTrigger id="companion-season" className="bg-background/50 min-w-0 [&>span]:truncate">
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
                    <label htmlFor="companion-episode" className="text-xs text-muted-foreground">Episode</label>
                    <Select value={selectedEpisode} onValueChange={value => {
                      changePosition({ ...point, episodeNumber: Number(value), seconds: 0 });
                      setTimestampValid(true);
                    }}>
                      <SelectTrigger id="companion-episode" className="bg-background/50 min-w-0 [&>span]:truncate">
                        <SelectValue placeholder="Select episode" />
                      </SelectTrigger>
                      <SelectContent>
                        {episodes.map((episode) => (
                          <SelectItem key={episode.episodeNumber} value={episode.episodeNumber.toString()}>
                            Episode {episode.episodeNumber}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <CompanionTimestamp key={`${selectedSeason}:${selectedEpisode}`} minutes={point.seconds / 60} maxMinutes={maxRuntime}
                onChange={([minutes]) => changePosition({ ...point, seconds: Math.round(minutes * 60) })}
                onValidityChange={setTimestampValid} disabled={!position} />

              {options}
              <Button ref={roomToggle} disabled={!position || !timestampValid || preparing} onClick={enterRoom} className="room-enter">
                <Armchair size={18} /> Enter room
              </Button>
            </div>
          </Card>
        </div>}>
          {focusAction => <RoomChat focusAction={focusAction} key={`${episodeLabel}:${point.seconds}`} expanded={chatOpen} onExpand={setChatOpen}
            timestamp={timestamp} valid={timestampValid} messages={messages} loading={isLoading}
            historyError={historyError} onAsk={handleAskQuestion} positionButton={positionButton}
            onEditPosition={() => setEditingTime(true)} remainingFree={remainingFree} coins={coins}
            onStore={() => { onOpenChange(false); navigate("/dashboard?tab=play&view=store"); }} />}
        </FocusRoom>
        {inRoom && editingTime && <RoomPositionEditor seconds={point.seconds} maxMinutes={maxRuntime}
          onClose={() => setEditingTime(false)} onReturnFocus={() => positionButton.current?.focus()}
          onSave={seconds => { changePosition({ ...point, seconds }); setTimestampValid(true); setEditingTime(false); }} />}
      </DialogContent>
    </Dialog>
  );
};

// Resolve the bookmark before rendering history for this account and title.
export default function TitleDetailModal(props: TitleDetailModalProps) {
  const viewer = useContext(GeekViewer);
  return <TitleDetailModalContent key={`${viewer}:${props.title.type}:${props.title.id}`} viewer={viewer} {...props} />;
}
