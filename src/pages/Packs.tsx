import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Package, Sparkles, Crown, Star } from "lucide-react";
import PackOpeningModal from "@/components/PackOpeningModal";

const Packs = () => {
  const [isOpening, setIsOpening] = useState(false);
  const [selectedPack, setSelectedPack] = useState<string>("");

  const packs = [
    {
      id: "bronze",
      name: "Bronze Pack",
      price: 100,
      icon: Package,
      color: "from-amber-700 to-amber-900",
      description: "3 actors, 75% common"
    },
    {
      id: "silver",
      name: "Silver Pack",
      price: 250,
      icon: Sparkles,
      color: "from-slate-400 to-slate-600",
      description: "5 actors, 50% rare"
    },
    {
      id: "gold",
      name: "Gold Pack",
      price: 500,
      icon: Crown,
      color: "from-primary to-accent",
      description: "7 actors, guaranteed rare"
    }
  ];

  const inventory = [
    { name: "Tom Hanks", rarity: "Legendary", role: "Lead Actor" },
    { name: "Meryl Streep", rarity: "Legendary", role: "Lead Actress" },
    { name: "Christopher Nolan", rarity: "Rare", role: "Director" },
    { name: "Hans Zimmer", rarity: "Rare", role: "Composer" },
  ];

  const handleOpenPack = (packId: string) => {
    setSelectedPack(packId);
    setIsOpening(true);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-4 max-w-4xl mx-auto">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">Actor Packs</h2>
        <p className="text-sm text-muted-foreground">
          Open free packs or earn them by winning the game
        </p>
      </div>

      {/* Pack Store */}
      <div className="grid gap-4">
        {packs.map((pack) => {
          const Icon = pack.icon;
          return (
            <Card
              key={pack.id}
              className="p-5 bg-gradient-to-r bg-card border-border active:scale-[0.98] transition-all shadow-md"
            >
              <div className="flex items-center gap-4">
                <div className={`p-4 rounded-xl bg-gradient-to-br ${pack.color} shadow-lg`}>
                  <Icon className="h-9 w-9 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-lg tracking-tight">{pack.name}</h3>
                  <p className="text-sm text-muted-foreground">{pack.description}</p>
                </div>
                <Button
                  onClick={() => handleOpenPack(pack.id)}
                  size="lg"
                  className="bg-gradient-to-r from-primary to-accent hover:opacity-90 shrink-0 min-h-[48px] px-6"
                >
                  Open
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Inventory */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold flex items-center gap-2 tracking-tight">
          <Star className="h-5 w-5 text-primary" />
          Your Collection
        </h3>
        <div className="grid grid-cols-2 gap-4">
          {inventory.map((item, idx) => (
            <Card
              key={idx}
              className="p-4 bg-gradient-to-br from-card to-secondary border-border hover:border-accent/50 transition-colors shadow-md"
            >
              <div className="space-y-3">
                <div className="aspect-square bg-muted rounded-lg flex items-center justify-center">
                  <Users className="h-16 w-16 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-sm truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.role}</p>
                  <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${
                    item.rarity === "Legendary" 
                      ? "bg-primary/20 text-primary"
                      : "bg-accent/20 text-accent"
                  }`}>
                    {item.rarity}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <PackOpeningModal
        isOpen={isOpening}
        onClose={() => setIsOpening(false)}
        packType={selectedPack}
      />
    </div>
  );
};

const Users = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="9" cy="7" r="4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default Packs;
