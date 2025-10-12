import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

interface PackOpeningModalProps {
  isOpen: boolean;
  onClose: () => void;
  packType: string;
}

const PackOpeningModal = ({ isOpen, onClose, packType }: PackOpeningModalProps) => {
  const [stage, setStage] = useState<"opening" | "reveal">("opening");
  const [cards, setCards] = useState<Array<{ name: string; rarity: string; role: string }>>([]);

  useEffect(() => {
    if (isOpen) {
      setStage("opening");
      setCards([]);
      
      // Simulate pack opening animation
      setTimeout(() => {
        const mockCards = [
          { name: "Brad Pitt", rarity: "Legendary", role: "Lead Actor" },
          { name: "Emma Stone", rarity: "Rare", role: "Lead Actress" },
          { name: "John Williams", rarity: "Rare", role: "Composer" },
        ];
        setCards(mockCards);
        setStage("reveal");
      }, 2000);
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-background border-border">
        {stage === "opening" ? (
          <div className="py-12 text-center space-y-6">
            <div className="animate-glow">
              <Sparkles className="h-16 w-16 text-primary mx-auto animate-spin" />
            </div>
            <div>
              <h3 className="text-2xl font-bold mb-2">Opening Pack...</h3>
              <p className="text-muted-foreground">Get ready for your new actors!</p>
            </div>
          </div>
        ) : (
          <div className="py-6 space-y-6">
            <h3 className="text-2xl font-bold text-center">Your New Cards!</h3>
            
            <div className="space-y-3">
              {cards.map((card, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-lg bg-gradient-to-r from-card to-secondary border border-primary/50 animate-scale-in"
                  style={{ animationDelay: `${idx * 0.1}s` }}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                      <Sparkles className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold">{card.name}</p>
                      <p className="text-xs text-muted-foreground">{card.role}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      card.rarity === "Legendary"
                        ? "bg-primary/20 text-primary"
                        : "bg-accent/20 text-accent"
                    }`}>
                      {card.rarity}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <Button
              onClick={onClose}
              className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90"
            >
              Add to Collection
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PackOpeningModal;
