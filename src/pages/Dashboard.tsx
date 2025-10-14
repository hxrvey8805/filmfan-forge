import { useState } from "react";
import { Film, Package, Users, TrendingUp, Menu } from "lucide-react";
import Index from "./Index";
import Packs from "./Packs";
import Squad from "./Squad";
import Market from "./Market";
import DailyPuzzle from "./DailyPuzzle";

type Tab = "home" | "packs" | "squad" | "market" | "puzzle";

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState<Tab>("home");

  const tabs = [
    { id: "home" as Tab, label: "Home", icon: Film },
    { id: "puzzle" as Tab, label: "Game", icon: Menu },
    { id: "packs" as Tab, label: "Packs", icon: Package },
    { id: "squad" as Tab, label: "Squad", icon: Users },
    { id: "market" as Tab, label: "Market", icon: TrendingUp },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "home":
        return <Index />;
      case "puzzle":
        return <DailyPuzzle />;
      case "packs":
        return <Packs />;
      case "squad":
        return <Squad />;
      case "market":
        return <Market />;
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              CineDraft
            </h1>
            <div className="flex items-center gap-4">
              <div className="text-sm text-muted-foreground">
                <span className="text-primary font-semibold">1,250</span> Coins
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6">
        {renderContent()}
      </main>

      {/* Bottom Navigation */}
      <nav className="border-t border-border bg-card/80 backdrop-blur-sm sticky bottom-0">
        <div className="container mx-auto px-2">
          <div className="flex items-center justify-around py-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all ${
                    isActive
                      ? "text-primary scale-105"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs font-medium">{tab.label}</span>
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
