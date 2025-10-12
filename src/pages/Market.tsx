import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search, Filter, Users } from "lucide-react";

const Market = () => {
  const [searchQuery, setSearchQuery] = useState("");

  const actors = [
    { name: "Denzel Washington", role: "Lead Actor", rarity: "Legendary", price: 800, genre: "Drama" },
    { name: "Cate Blanchett", role: "Lead Actress", rarity: "Legendary", price: 750, genre: "Drama" },
    { name: "Keanu Reeves", role: "Lead Actor", rarity: "Rare", price: 400, genre: "Action" },
    { name: "Greta Gerwig", role: "Director", rarity: "Rare", price: 450, genre: "Comedy" },
    { name: "Trent Reznor", role: "Composer", rarity: "Rare", price: 350, genre: "Thriller" },
    { name: "Zendaya", role: "Lead Actress", rarity: "Common", price: 200, genre: "Sci-Fi" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold mb-2">Market</h2>
        <p className="text-muted-foreground">
          Browse and acquire actors for your squad
        </p>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search actors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-card"
          />
        </div>
        <Button variant="outline" size="icon">
          <Filter className="h-4 w-4" />
        </Button>
      </div>

      {/* Market Listings */}
      <div className="space-y-3">
        {actors.map((actor, idx) => (
          <Card
            key={idx}
            className="p-4 bg-gradient-to-r from-card to-secondary border-border hover:border-primary/50 transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold">{actor.name}</h3>
                <p className="text-sm text-muted-foreground">{actor.role}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    actor.rarity === "Legendary"
                      ? "bg-primary/20 text-primary"
                      : actor.rarity === "Rare"
                      ? "bg-accent/20 text-accent"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {actor.rarity}
                  </span>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">{actor.genre}</span>
                </div>
              </div>
              <Button
                size="sm"
                className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
              >
                <span className="font-bold">{actor.price}</span>
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Market;
