import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Sparkles, Trophy } from "lucide-react";

const PackSelectionSection = () => {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-bold">Card Packs</h2>
      
      <div className="grid md:grid-cols-2 gap-6">
        {/* Current Stars Pack */}
        <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30 overflow-hidden group hover:shadow-lg hover:shadow-primary/20 transition-all">
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-primary/20">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Current Stars Pack</h3>
                <p className="text-sm text-muted-foreground">Today's hottest actors</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>5 Cards per pack</span>
                <span className="text-primary font-semibold">150 Coins</span>
              </div>
              <div className="flex gap-1">
                <div className="h-2 flex-1 bg-muted rounded-full" />
                <div className="h-2 flex-1 bg-primary/40 rounded-full" />
                <div className="h-2 flex-1 bg-primary/60 rounded-full" />
                <div className="h-2 flex-1 bg-primary rounded-full" />
              </div>
              <p className="text-xs text-muted-foreground">
                Common to Legendary rarity
              </p>
            </div>

            <Link to="/packs">
              <Button className="w-full bg-primary hover:bg-primary/90">
                <Package className="mr-2 h-4 w-4" />
                Open Pack
              </Button>
            </Link>
          </div>
        </Card>

        {/* Legends & Icons Pack */}
        <Card className="bg-gradient-to-br from-accent/20 to-accent/5 border-accent/30 overflow-hidden group hover:shadow-lg hover:shadow-accent/20 transition-all">
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-accent/20">
                <Trophy className="h-6 w-6 text-accent" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Legends & Icons Pack</h3>
                <p className="text-sm text-muted-foreground">Classic Hollywood icons</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>5 Cards per pack</span>
                <span className="text-accent font-semibold">200 Coins</span>
              </div>
              <div className="flex gap-1">
                <div className="h-2 flex-1 bg-muted rounded-full" />
                <div className="h-2 flex-1 bg-accent/40 rounded-full" />
                <div className="h-2 flex-1 bg-accent/60 rounded-full" />
                <div className="h-2 flex-1 bg-accent rounded-full" />
              </div>
              <p className="text-xs text-muted-foreground">
                Higher chance of Legendary
              </p>
            </div>

            <Link to="/packs">
              <Button className="w-full bg-accent hover:bg-accent/90">
                <Package className="mr-2 h-4 w-4" />
                Open Pack
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </section>
  );
};

export default PackSelectionSection;
