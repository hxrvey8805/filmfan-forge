import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PackOpeningModalProps {
  isOpen: boolean;
  onClose: () => void;
  packId: string;
}

const PackOpeningModal = ({ isOpen, onClose, packId }: PackOpeningModalProps) => {
  const [stage, setStage] = useState<"opening" | "reveal">("opening");
  const [person, setPerson] = useState<any>(null);
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

      // Simulate opening animation
      setTimeout(() => {
        setPerson(data.person);
        setStage("reveal");
      }, 2000);
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

  const getImageUrl = (profilePath: string | null) => {
    if (!profilePath) return null;
    return `https://image.tmdb.org/t/p/w500${profilePath}`;
  };

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
              <p className="text-muted-foreground">Get ready for your new card!</p>
            </div>
          </div>
        ) : person ? (
          <div className="py-6 space-y-6">
            <h3 className="text-2xl font-bold text-center">Your New Card!</h3>
            
            <div className="space-y-4">
              <div
                className="rounded-lg overflow-hidden bg-gradient-to-br from-card to-secondary border border-primary/50 animate-scale-in"
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
                <div className="p-4 space-y-2">
                  <p className="font-bold text-lg">{person.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {person.known_for_department}
                  </p>
                </div>
              </div>
            </div>

            <Button
              onClick={onClose}
              className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90"
            >
              Add to Collection
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

export default PackOpeningModal;
