import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Flame, Plus, Users } from "lucide-react";

const Squad = () => {
  const squadSlots = [
    { role: "Lead Actor", filled: true, actor: "Tom Hanks", chemistry: 95 },
    { role: "Lead Actress", filled: true, actor: "Meryl Streep", chemistry: 92 },
    { role: "Supporting Actor", filled: false },
    { role: "Villain", filled: false },
    { role: "Director", filled: true, actor: "Christopher Nolan", chemistry: 88 },
    { role: "Composer", filled: true, actor: "Hans Zimmer", chemistry: 90 },
  ];

  const totalChemistry = squadSlots
    .filter(slot => slot.filled)
    .reduce((sum, slot) => sum + (slot.chemistry || 0), 0) / squadSlots.filter(s => s.filled).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Squad Builder</h2>
          <p className="text-muted-foreground">Build your dream cast</p>
        </div>
        <div className="text-center">
          <div className="flex items-center gap-2 mb-1">
            <Flame className="h-5 w-5 text-primary" />
            <span className="text-3xl font-bold text-primary">{Math.round(totalChemistry)}</span>
          </div>
          <p className="text-xs text-muted-foreground">Chemistry</p>
        </div>
      </div>

      {/* Chemistry Explanation */}
      <Card className="p-4 bg-gradient-to-r from-primary/10 to-accent/10 border-primary/30">
        <p className="text-sm">
          <span className="font-semibold text-primary">Chemistry</span> is calculated based on shared genres, past collaborations, and awards. Higher chemistry = better squad bonuses!
        </p>
      </Card>

      {/* Squad Slots */}
      <div className="grid gap-4">
        {squadSlots.map((slot, idx) => (
          <Card
            key={idx}
            className={`p-4 transition-all ${
              slot.filled
                ? "bg-gradient-to-br from-card to-secondary border-primary/30"
                : "bg-card border-dashed border-muted-foreground/30"
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`h-16 w-16 rounded-lg flex items-center justify-center ${
                slot.filled
                  ? "bg-gradient-to-br from-primary/20 to-accent/20"
                  : "bg-muted"
              }`}>
                {slot.filled ? (
                  <Users className="h-8 w-8 text-primary" />
                ) : (
                  <Plus className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground font-medium mb-1">
                  {slot.role}
                </p>
                {slot.filled ? (
                  <>
                    <p className="font-bold">{slot.actor}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary to-accent"
                          style={{ width: `${slot.chemistry}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-primary">
                        {slot.chemistry}
                      </span>
                    </div>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-primary p-0 h-auto"
                  >
                    Add actor
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Squad;
