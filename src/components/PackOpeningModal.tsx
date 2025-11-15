import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Film, Camera, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PackOpeningModalProps {
  isOpen: boolean;
  onClose: () => void;
  packId: string;
}

const PackOpeningModal = ({ isOpen, onClose, packId }: PackOpeningModalProps) => {
  const [stage, setStage] = useState<"opening" | "building" | "reveal">("opening");
  const [person, setPerson] = useState<any>(null);
  const [packType, setPackType] = useState<"actor" | "director">("actor");
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && packId) {
      setStage("opening");
      setPerson(null);
      openPack();
    }
  }, [isOpen, packId]);

  const openPack = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('open-pack', {
        body: { packId }
      });

      if (error) throw error;

      // Determine pack type from person data
      const type = data.person.known_for_department === "Directing" ? "director" : "actor";
      setPackType(type);

      // 3-stage cinematic reveal
      setTimeout(() => setStage("building"), 1500);
      setTimeout(() => {
        setPerson(data.person);
        setStage("reveal");
      }, 3500);
    } catch (error: any) {
      console.error('Error opening pack:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to open pack",
        variant: "destructive"
      });
      onClose();
    }
  };

  const getRarityGlow = (popularity: number) => {
    if (popularity >= 80) return "shadow-[0_0_40px_rgba(255,215,0,0.8)]";
    if (popularity >= 40) return "shadow-[0_0_30px_rgba(147,51,234,0.6)]";
    if (popularity >= 20) return "shadow-[0_0_20px_rgba(59,130,246,0.5)]";
    return "shadow-[0_0_15px_rgba(156,163,175,0.4)]";
  };

  const getRarityText = (popularity: number) => {
    if (popularity >= 80) return "LEGENDARY";
    if (popularity >= 40) return "EPIC";
    if (popularity >= 20) return "RARE";
    return "COMMON";
  };

  const getImageUrl = (profilePath: string | null) => {
    if (!profilePath) return null;
    return `https://image.tmdb.org/t/p/w500${profilePath}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-background border-border overflow-hidden">
        {stage === "opening" && (
          <div className="py-12 text-center space-y-6 relative">
            <div className="absolute inset-0 bg-gradient-radial from-primary/20 to-transparent animate-pulse" />
            <div className="relative z-10">
              <Sparkles className="h-16 w-16 text-primary mx-auto animate-spin" />
            </div>
            <div className="relative z-10">
              <h3 className="text-2xl font-bold mb-2">Opening Pack...</h3>
              <p className="text-muted-foreground">Get ready for your new card!</p>
            </div>
          </div>
        )}

        {stage === "building" && (
          <div className="py-16 text-center space-y-8 relative overflow-hidden">
            {packType === "actor" ? (
              <>
                {/* Red Carpet Theme */}
                <div className="absolute inset-0 bg-gradient-to-b from-red-950/40 to-background" />
                <div className="absolute top-0 left-1/4 w-1 h-full bg-gradient-to-b from-yellow-400/60 via-transparent to-transparent animate-pulse" />
                <div className="absolute top-0 right-1/4 w-1 h-full bg-gradient-to-b from-yellow-400/60 via-transparent to-transparent animate-pulse delay-300" />
                
                <div className="relative z-10 space-y-4">
                  <Camera className="h-20 w-20 text-yellow-400 mx-auto animate-bounce" />
                  <div className="flex justify-center gap-2">
                    {[0, 1, 2].map((i) => (
                      <Star
                        key={i}
                        className="h-6 w-6 text-yellow-400 animate-pulse"
                        style={{ animationDelay: `${i * 200}ms` }}
                      />
                    ))}
                  </div>
                  <h3 className="text-3xl font-bold text-yellow-400">RED CARPET</h3>
                  <p className="text-muted-foreground">A star is born...</p>
                </div>
              </>
            ) : (
              <>
                {/* Cinema Theme */}
                <div className="absolute inset-0 bg-gradient-to-b from-purple-950/40 to-background" />
                <div className="absolute inset-0 opacity-10">
                  <div className="absolute inset-0" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)' }} />
                </div>
                
                <div className="relative z-10 space-y-4">
                  <Film className="h-20 w-20 text-purple-400 mx-auto animate-spin" style={{ animationDuration: '3s' }} />
                  <div className="flex justify-center gap-3">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="w-2 h-8 bg-purple-400 animate-pulse"
                        style={{ animationDelay: `${i * 150}ms` }}
                      />
                    ))}
                  </div>
                  <h3 className="text-3xl font-bold text-purple-400">CINEMA</h3>
                  <p className="text-muted-foreground">Lights, camera, action...</p>
                </div>
              </>
            )}
          </div>
        )}

        {stage === "reveal" && person && (
          <div className="py-6 space-y-6">
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-bold">Your New Card!</h3>
              <p className="text-sm font-bold text-primary">{getRarityText(person.popularity || 0)}</p>
            </div>
            
            <div className="space-y-4">
              <div
                className={`rounded-lg overflow-hidden bg-gradient-to-br from-card to-secondary border-2 border-primary animate-scale-in ${getRarityGlow(person.popularity || 0)}`}
              >
                {person.profile_path ? (
                  <img
                    src={getImageUrl(person.profile_path)}
                    alt={person.name}
                    className="w-full aspect-[2/3] object-cover"
                  />
                ) : (
                  <div className="w-full aspect-[2/3] bg-muted flex items-center justify-center">
                    <Sparkles className="h-16 w-16 text-muted-foreground" />
                  </div>
                )}
                <div className="p-4 space-y-2 bg-gradient-to-t from-background/95 to-background/80">
                  <p className="font-bold text-lg">{person.name}</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    {packType === "actor" ? <Camera className="h-4 w-4" /> : <Film className="h-4 w-4" />}
                    {person.known_for_department}
                  </p>
                </div>
              </div>
            </div>

            <Button
              onClick={onClose}
              className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity"
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
