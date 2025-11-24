import { useState, useEffect } from "react";
import { Glasses, Package, Menu, LogOut, Store as StoreIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Index from "./Index";
import Packs from "./Packs";
import DailyPuzzle from "./DailyPuzzle";
import Store from "./Store";

type Tab = "home" | "packs" | "puzzle" | "store";

const Dashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [remainingFree, setRemainingFree] = useState<number | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        loadAIUsage();
      }
    });
  }, [navigate]);

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
              <div className="relative w-10 h-10">
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
            )}
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
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col items-center gap-1.5 px-6 py-2.5 rounded-2xl transition-all min-w-[72px] min-h-[60px] ${
                    isActive
                      ? "text-primary scale-105 bg-primary/10"
                      : "text-muted-foreground active:scale-95 active:bg-muted/50"
                  }`}
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
  );
};

export default Dashboard;
