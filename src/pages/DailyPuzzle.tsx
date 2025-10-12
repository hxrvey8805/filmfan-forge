import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trophy, ArrowRight, Check } from "lucide-react";

const DailyPuzzle = () => {
  const [guesses, setGuesses] = useState<string[]>([]);
  const [currentGuess, setCurrentGuess] = useState("");
  const [isComplete, setIsComplete] = useState(false);

  const puzzle = {
    start: "Tom Hanks",
    end: "Meryl Streep",
    solution: ["Tom Hanks", "Saving Private Ryan", "Steven Spielberg", "The Post", "Meryl Streep"],
    reward: 150
  };

  const handleSubmitGuess = () => {
    if (!currentGuess.trim()) return;
    
    const newGuesses = [...guesses, currentGuess];
    setGuesses(newGuesses);
    setCurrentGuess("");

    // Demo: complete after 3 guesses
    if (newGuesses.length >= 3) {
      setIsComplete(true);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Daily Connect</h2>
          <p className="text-muted-foreground">
            Link two actors through their filmography
          </p>
        </div>
        <div className="text-center">
          <Trophy className="h-6 w-6 text-primary mx-auto mb-1" />
          <p className="text-xs text-muted-foreground">+{puzzle.reward} coins</p>
        </div>
      </div>

      {/* Puzzle Card */}
      <Card className="p-6 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/30">
        <div className="flex items-center gap-4">
          <div className="flex-1 text-center">
            <div className="h-20 w-20 mx-auto rounded-lg bg-card flex items-center justify-center mb-2">
              <span className="text-sm font-bold">{puzzle.start}</span>
            </div>
          </div>
          <ArrowRight className="h-6 w-6 text-primary" />
          <div className="flex-1 text-center">
            <div className="h-20 w-20 mx-auto rounded-lg bg-card flex items-center justify-center mb-2">
              <span className="text-sm font-bold">{puzzle.end}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Instructions */}
      <Card className="p-4 bg-card border-border">
        <p className="text-sm text-muted-foreground">
          Connect these actors through movies they've appeared in or directors they've worked with. Each step must share a connection!
        </p>
      </Card>

      {/* Guesses */}
      {!isComplete ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Your Path ({guesses.length} steps)</h3>
          {guesses.map((guess, idx) => (
            <Card key={idx} className="p-3 bg-secondary border-border">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                <span className="text-sm">{guess}</span>
              </div>
            </Card>
          ))}
          
          <div className="flex gap-2">
            <Input
              placeholder="Enter movie or actor name..."
              value={currentGuess}
              onChange={(e) => setCurrentGuess(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSubmitGuess()}
              className="bg-card"
            />
            <Button
              onClick={handleSubmitGuess}
              className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
            >
              Add
            </Button>
          </div>
        </div>
      ) : (
        <Card className="p-6 text-center bg-gradient-to-br from-primary/20 to-accent/20 border-primary/50">
          <Trophy className="h-12 w-12 text-primary mx-auto mb-3" />
          <h3 className="text-xl font-bold mb-2">Puzzle Complete!</h3>
          <p className="text-muted-foreground mb-4">
            You connected the actors in {guesses.length} steps
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-card rounded-lg">
            <span className="text-2xl font-bold text-primary">+{puzzle.reward}</span>
            <span className="text-sm text-muted-foreground">coins</span>
          </div>
        </Card>
      )}
    </div>
  );
};

export default DailyPuzzle;
