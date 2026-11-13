import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { Home, Gamepad2, UserRound, ArrowLeft, Coins } from "lucide-react";
import { Navigate, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Index from "./Index";
import Packs from "./Packs";
import DailyPuzzle from "./DailyPuzzle";
import Store from "./Store";
import { GeekViewer } from "@/hooks/use-geek-outfit";
import { useViewerSession } from "@/hooks/use-viewer-session";
import { ContentLoading } from "@/components/ContentLoading";
import { PlayHome } from "@/components/PlayHome";
import { ProfileHome } from "@/components/MobileDestinations";

type Tab = "home" | "play" | "profile";

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isGamePlaying, setIsGamePlaying] = useState(false);
  const [params, setParams] = useSearchParams();
  const activeTab: Tab = isGamePlaying ? "play" : params.get("tab") === "play" ? "play" : params.get("tab") === "profile" ? "profile" : "home";
  const playView = isGamePlaying ? "game" : params.get("view");
  const viewer = useViewerSession();
  const viewerId = viewer?.id ?? null;
  const email = viewer?.email ?? "";
  const playReturn = useRef<{ y: number; view: string } | null>(null);
  useLayoutEffect(() => {
    if (activeTab !== "play") { playReturn.current = null; return; }
    if (!playView && playReturn.current) {
      const { y, view } = playReturn.current;
      playReturn.current = null;
      document.querySelector<HTMLButtonElement>(`[data-play-link="${view}"]`)?.focus({ preventScroll: true });
      window.scrollTo({ top: y, behavior: "instant" });
    }
  }, [activeTab, playView]);
  const selectTab = (tab: Tab, view?: string) => {
    if (isGamePlaying) return;
    if (activeTab === "play" && !playView && tab === "play" && view) playReturn.current = { y: window.scrollY, view };
    setParams(tab === "home" ? {} : { tab, ...(view ? { view } : {}) });
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const [remainingFree, setRemainingFree] = useState<number | null>(null);
  const [coins, setCoins] = useState<number>(0);

  // Refresh when window gains focus (user comes back to tab/window)
  useEffect(() => {
    const handleFocus = () => {
      loadAIUsage();
      loadUserStats();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Listen for custom event from Companion page
  useEffect(() => {
    const handleQuestionAsked = () => {
      loadAIUsage();
      loadUserStats();
    };

    window.addEventListener('questionAsked', handleQuestionAsked);
    return () => window.removeEventListener('questionAsked', handleQuestionAsked);
  }, []);

  // Listen for game state changes
  useEffect(() => {
    const handleGameStateChange = (e: CustomEvent) => {
      setIsGamePlaying(e.detail === 'playing');
    };

    window.addEventListener('gameStateChange', handleGameStateChange as EventListener);
    return () => window.removeEventListener('gameStateChange', handleGameStateChange as EventListener);
  }, []);

  // Prevent navigation/closing when game is playing
  useEffect(() => {
    if (isGamePlaying) {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = '';
        return '';
      };

      const handlePopState = () => {
        if (isGamePlaying) {
          navigate("/dashboard?tab=play&view=game", { replace: true });
        }
      };

      window.addEventListener('beforeunload', handleBeforeUnload);
      window.history.pushState(null, '', location.pathname + location.search);
      window.addEventListener('popstate', handlePopState);

      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        window.removeEventListener('popstate', handlePopState);
      };
    }
  }, [isGamePlaying, location.pathname, location.search, navigate]);

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

      if (!stats) {
        // Create stats if they don't exist
        const { data: newStats } = await supabase
          .from('user_stats')
          .insert({ user_id: user.id, coins: 100 })
          .select()
          .single();
        if (newStats) {
          setCoins(newStats.coins);
        }
      } else {
        setCoins(stats.coins);
      }
    } catch (error) {
      console.error('Error loading user stats:', error);
    }
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) { toast.error("Couldn’t sign out. Try again."); return; }
    toast.dismiss();
    navigate("/", { replace: true });
  };

  const tabs = [
    { id: "home" as Tab, label: "Home", icon: Home },
    { id: "play" as Tab, label: "Play", icon: Gamepad2 },
    { id: "profile" as Tab, label: "Profile", icon: UserRound },
  ];

  // Load account totals after sign-in and refresh them when returning from Play.
  useEffect(() => {
    if (viewerId) {
      loadUserStats();
      loadAIUsage();
    }
  }, [activeTab, playView, viewerId]);

  if (viewer === undefined) return <ContentLoading />;
  if (!viewer) return <Navigate to="/" replace />;
  return (
    <div className="app-shell min-h-dvh bg-background text-foreground">
      <a href="#app-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 bg-primary text-primary-foreground p-3 rounded-xl">Skip to content</a>
      <header className="app-header sticky top-0 z-30 border-b border-white/5 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 h-[72px] flex items-center justify-between">
          <button onClick={() => selectTab("home")} disabled={isGamePlaying} aria-label="CineGeek home" className="flex items-center gap-2.5">
            <img className="brand-mark" src="/cinegeek-mark.svg" width="36" height="36" alt="" />
            <span className="text-xl font-bold tracking-[-0.06em]">cine<span className="text-primary">geek</span><span className="text-primary">.</span></span>
          </button>
          <button onClick={() => selectTab(activeTab === "play" ? "play" : "profile", activeTab === "play" ? "store" : undefined)} disabled={isGamePlaying}
            className="flex items-center gap-2 rounded-full border border-white/10 px-3 text-xs text-muted-foreground" aria-label={activeTab === "play" ? "Open store" : "View profile and question allowance"}>
            {activeTab === "play" ? <><Coins className="w-4 h-4 text-primary" /><span className="text-foreground tabular-nums">{coins.toLocaleString()}</span></>
              : <><span className="w-1.5 h-1.5 rounded-full bg-primary" /><span>{remainingFree ?? "…"} free questions</span></>}
          </button>
        </div>
      </header>
      {import.meta.env.MODE === "mobile-preview" && <div className="text-center py-1.5 bg-primary/5 text-[10px] tracking-[0.14em] uppercase text-muted-foreground border-b border-white/5">Design preview · Sample library</div>}
      <GeekViewer.Provider value={viewerId}>
      <main id="app-content" className="mx-auto max-w-6xl px-5 sm:px-8 pt-6 sm:pt-8 pb-8">
        {activeTab === "home" && <Index key={viewerId} />}
        {activeTab === "play" && (playView === "game" || playView === "packs" || playView === "store" ? <div className="arcade-page">
          <Button variant="ghost" disabled={isGamePlaying} onClick={() => selectTab("play")} className="mb-2 -ml-3 gap-1.5 text-muted-foreground"><ArrowLeft className="w-4 h-4" />Back to Play</Button>
          {isGamePlaying && <p className="text-xs text-primary mb-4" role="status">Finish your game to switch screens.</p>}
          {playView === "game" ? <>
            {import.meta.env.MODE === "mobile-preview" && <p className="mb-4 text-center text-sm text-muted-foreground">Practice with sample cast credits. Preview coins reset on reload.</p>}
            <DailyPuzzle />
          </> : playView === "packs" ? <Packs onStore={() => selectTab("play", "store")} onBalance={setCoins} /> : <Store onBalance={setCoins} />}
        </div> : <PlayHome onOpen={view => selectTab("play", view)} />)}
        {activeTab === "profile" && <ProfileHome email={email} coins={coins} remainingFree={remainingFree} onLogout={handleLogout} onInstall={() => navigate("/install")} />}
      </main>
      </GeekViewer.Provider>
      <nav aria-label="Main navigation" className="app-bottom-nav fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto max-w-lg flex justify-around px-5 pt-2 pb-2">
          {tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => selectTab(id)} disabled={isGamePlaying && activeTab !== id}
            aria-current={activeTab === id ? "page" : undefined} title={isGamePlaying && activeTab !== id ? "Finish your game to switch screens" : undefined}
            className={`nav-destination ${activeTab === id ? "text-primary" : "text-muted-foreground"} disabled:opacity-30`}>
            <span className={`rounded-2xl px-6 py-1.5 ${activeTab === id ? "bg-primary/10" : ""}`}><Icon className="w-[22px] h-[22px]" strokeWidth={activeTab === id ? 2.3 : 1.7} /></span>
            <span className="text-[11px] font-medium">{label}</span>
          </button>)}
        </div>
      </nav>
    </div>
  );
};

export default Dashboard;
