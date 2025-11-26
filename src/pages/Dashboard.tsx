import { useState, useEffect } from "react";
import { Glasses, Package, Menu, LogOut, Store as StoreIcon, Coins } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import Index from "./Index";
import Packs from "./Packs";
import DailyPuzzle from "./DailyPuzzle";
import Store from "./Store";

type Tab = "home" | "packs" | "puzzle" | "store";

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [remainingFree, setRemainingFree] = useState<number | null>(null);
  const [coins, setCoins] = useState<number>(0);
  const [isGamePlaying, setIsGamePlaying] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        loadAIUsage();
        loadUserStats();
      }
    });
  }, [navigate]);

  // Refresh when navigating back from Companion page
  useEffect(() => {
    if (location.pathname === "/dashboard") {
      loadAIUsage();
      loadUserStats();
    }
  }, [location.pathname]);

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

      const handlePopState = (e: PopStateEvent) => {
        if (isGamePlaying) {
          window.history.pushState(null, '', location.pathname);
        }
      };

      window.addEventListener('beforeunload', handleBeforeUnload);
      window.history.pushState(null, '', location.pathname);
      window.addEventListener('popstate', handlePopState);

      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        window.removeEventListener('popstate', handlePopState);
      };
    }
  }, [isGamePlaying, location.pathname]);

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
    await supabase.auth.signOut();
    toast.success("Logged out successfully");
    navigate("/");
  };

  const tabs = [
    { id: "home" as Tab, label: "Home", icon: Glasses },
    { id: "puzzle" as Tab, label: "Game", icon: Menu },
    { id: "packs" as Tab, label: "Packs", icon: Package },
    { id: "store" as Tab, label: "Store", icon: StoreIcon },
  ];

  // Refresh coins and AI usage when tab changes (in case they changed in game/store)
  useEffect(() => {
    if (activeTab) {
      loadUserStats();
      loadAIUsage();
    }
  }, [activeTab]);

  const renderContent = () => {
    switch (activeTab) {
      case "home":
        return <Index />;
      case "puzzle":
        return <DailyPuzzle />;
      case "packs":
        return <Packs />;
      case "store":
        return <Store />;
    }
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground flex flex-col pb-20">
        {/* Header */}
        <header className="border-b border-border bg-card/95 backdrop-blur-lg sticky top-0 z-50 shadow-sm">
          <div className="container mx-auto px-5 py-4 safe-area-inset-top flex justify-between items-center">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              CineGeek
            </h1>
            <div className="flex items-center gap-3">
              {/* Minimal Spoiler-Free Companion Limit Display */}
              {remainingFree !== null && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="relative w-10 h-10 cursor-help">
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
                          stroke="url(#header-gradient)"
                          strokeWidth="6"
                          fill="none"
                          strokeLinecap="round"
                          strokeDasharray={`${2 * Math.PI * 40}`}
                          strokeDashoffset={`${2 * Math.PI * 40 * (1 - remainingFree / 5)}`}
                          className="transition-all duration-1000 ease-out"
                        />
                        <defs>
                          <linearGradient id="header-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="hsl(var(--primary))" />
                            <stop offset="100%" stopColor="hsl(var(--accent))" />
                          </linearGradient>
                        </defs>
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                          <div className="text-xs font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent leading-none">
                            {remainingFree}
                          </div>
                          <div className="text-[8px] text-muted-foreground leading-none">/5</div>
                        </div>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-sm">
                      {remainingFree > 0 
                        ? `${remainingFree} free question${remainingFree !== 1 ? 's' : ''} remaining today. After that, questions cost 150 coins each.`
                        : 'No free questions remaining. Visit the Store to purchase questions for 150 coins, or play Actor Connect to earn coins.'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              )}
              {/* Coins Display */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card/80 border border-border/50 cursor-help">
                    <Coins className="h-4 w-4 text-primary" />
                    <span className="text-sm font-bold">{coins}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-sm">
                    Your coin balance. Use coins to purchase packs from the Store or buy additional spoiler-free questions. Earn coins by winning Actor Connect games or selling cards.
                  </p>
                </TooltipContent>
              </Tooltip>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-5 w-5" />
            </Button>
            </div>
          </div>
        </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-5 py-5">
        {renderContent()}
      </main>

      {/* Bottom Navigation */}
      <nav className="border-t border-border bg-card/98 backdrop-blur-lg fixed bottom-0 left-0 right-0 z-50 shadow-lg">
        <div className="safe-area-inset-bottom">
          <div className="flex items-center justify-around px-4 py-4">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const isDisabled = isGamePlaying && !isActive;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (!isGamePlaying || isActive) {
                      setActiveTab(tab.id);
                    }
                  }}
                  disabled={isDisabled}
                  className={`flex flex-col items-center gap-1.5 px-6 py-2.5 rounded-2xl transition-all min-w-[72px] min-h-[60px] ${
                    isActive
                      ? "text-primary scale-105 bg-primary/10"
                      : isDisabled
                      ? "text-muted-foreground/30 opacity-50 cursor-not-allowed"
                      : "text-muted-foreground active:scale-95 active:bg-muted/50"
                  }`}
                  title={isDisabled ? "Complete the game to switch tabs" : ""}
                >
                  <Icon className={`h-6 w-6 ${isActive ? 'stroke-[2.5]' : 'stroke-[2]'}`} />
                  <span className={`text-xs font-medium ${isActive ? 'font-semibold' : ''}`}>
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>
      </div>
    </TooltipProvider>
  );
};

export default Dashboard;
