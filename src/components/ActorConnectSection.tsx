import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, PlayCircle } from "lucide-react";

const ActorConnectSection = () => {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-bold">Actor Connect Game</h2>
      
      <Card className="bg-gradient-to-br from-card to-secondary border-border overflow-hidden">
        <div className="p-8 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-primary/20">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Connect Two Actors</h3>
              <p className="text-sm text-muted-foreground">
                Find the shortest path between actors through shared films
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="space-y-1">
              <div className="text-2xl font-bold text-primary">6</div>
              <div className="text-xs text-muted-foreground">Degrees</div>
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-bold text-accent">∞</div>
              <div className="text-xs text-muted-foreground">Possibilities</div>
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-bold text-primary">⏱️</div>
              <div className="text-xs text-muted-foreground">Timed</div>
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-bold text-accent">🏆</div>
              <div className="text-xs text-muted-foreground">Leaderboard</div>
            </div>
          </div>

          <Link to="/game/actor-connect">
            <Button className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90">
              <PlayCircle className="mr-2 h-5 w-5" />
              Play Now
            </Button>
          </Link>
        </div>
      </Card>
    </section>
  );
};

export default ActorConnectSection;
