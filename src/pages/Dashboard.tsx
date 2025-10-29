import { useState, useEffect } from "react";
import { Film, Package, Menu, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Index from "./Index";
import Packs from "./Packs";
import DailyPuzzle from "./DailyPuzzle";

type Tab = "home" | "packs" | "puzzle";

const Dashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("home");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      }
    });
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out successfully");
    navigate("/auth");
  };

  const tabs = [
    { id: "home" as Tab, label: "Home", icon: Film },
    { id: "puzzle" as Tab, label: "Game", icon: Menu },
    { id: "packs" as Tab, label: "Packs", icon: Package },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "home":
        return <Index />;
      case "puzzle":
        return <DailyPuzzle />;
      case "packs":
        return <Packs />;
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col pb-20">
      {/* Header */}
      <header className="border-b border-border bg-card/95 backdrop-blur-lg sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-5 py-4 safe-area-inset-top flex justify-between items-center">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            CineMate
          </h1>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="h-5 w-5" />
          </Button>
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
