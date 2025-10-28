import { useState } from "react";
import { Film, Package, Menu } from "lucide-react";
import Index from "./Index";
import Packs from "./Packs";
import DailyPuzzle from "./DailyPuzzle";

type Tab = "home" | "packs" | "puzzle";

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState<Tab>("home");

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
    <div className="min-h-screen bg-background text-foreground flex flex-col pb-16">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            CineMate
          </h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-4">
        {renderContent()}
      </main>

      {/* Bottom Navigation */}
      <nav className="border-t border-border bg-card/95 backdrop-blur-sm fixed bottom-0 left-0 right-0 z-50 safe-area-inset-bottom">
        <div className="flex items-center justify-around px-2 py-3">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center gap-1 px-6 py-2 rounded-xl transition-all ${
                  isActive
                    ? "text-primary scale-110"
                    : "text-muted-foreground active:scale-95"
                }`}
              >
                <Icon className="h-6 w-6" />
                <span className="text-xs font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default Dashboard;
