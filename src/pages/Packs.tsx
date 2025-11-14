import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Package, Sparkles, Crown } from "lucide-react";
import PackOpeningModal from "@/components/PackOpeningModal";
import { supabase } from "@/integrations/supabase/client";

const Packs = () => {
  const [isOpening, setIsOpening] = useState(false);
  const [selectedPackId, setSelectedPackId] = useState<string>("");
  const [availablePacks, setAvailablePacks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAvailablePacks();
  }, []);

  const loadAvailablePacks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_packs')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_opened', false)
        .order('earned_at', { ascending: false });

      if (error) throw error;
      setAvailablePacks(data || []);
    } catch (error) {
      console.error('Error loading packs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenPack = (packId: string) => {
    setSelectedPackId(packId);
    setIsOpening(true);
  };

  const handlePackOpened = () => {
    setIsOpening(false);
    loadAvailablePacks();
  };

  const actorPacks = availablePacks.filter(p => p.pack_type === 'actor');
  const directorPacks = availablePacks.filter(p => p.pack_type === 'director');

  return (
    <div className="space-y-6 animate-fade-in pb-4 max-w-4xl mx-auto">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">Your Packs</h2>
        <p className="text-sm text-muted-foreground">
          Win the Actor Connect game in under 2 minutes to earn packs!
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading your packs...</p>
        </div>
      ) : availablePacks.length === 0 ? (
        <Card className="p-12 text-center bg-gradient-to-br from-card to-secondary border-border">
          <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-xl font-bold mb-2">No Packs Available</h3>
          <p className="text-muted-foreground mb-6">
            Play Actor Connect and finish within 2 minutes to earn a pack!
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {actorPacks.length > 0 && (
            <Card className="p-5 bg-gradient-to-r from-primary/10 to-accent/10 border-border shadow-md">
              <div className="flex items-center gap-4">
                <div className="p-4 rounded-xl bg-gradient-to-br from-primary to-accent shadow-lg">
                  <Sparkles className="h-9 w-9 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-lg tracking-tight">Actor Packs</h3>
                  <p className="text-sm text-muted-foreground">
                    {actorPacks.length} pack{actorPacks.length !== 1 ? 's' : ''} available
                  </p>
                </div>
                <Button
                  onClick={() => handleOpenPack(actorPacks[0].id)}
                  size="lg"
                  className="bg-gradient-to-r from-primary to-accent hover:opacity-90 shrink-0 min-h-[48px] px-6"
                >
                  Open Pack
                </Button>
              </div>
            </Card>
          )}

          {directorPacks.length > 0 && (
            <Card className="p-5 bg-gradient-to-r from-amber-700/10 to-amber-900/10 border-border shadow-md">
              <div className="flex items-center gap-4">
                <div className="p-4 rounded-xl bg-gradient-to-br from-amber-700 to-amber-900 shadow-lg">
                  <Crown className="h-9 w-9 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-lg tracking-tight">Director Packs</h3>
                  <p className="text-sm text-muted-foreground">
                    {directorPacks.length} pack{directorPacks.length !== 1 ? 's' : ''} available
                  </p>
                </div>
                <Button
                  onClick={() => handleOpenPack(directorPacks[0].id)}
                  size="lg"
                  className="bg-gradient-to-r from-amber-700 to-amber-900 hover:opacity-90 shrink-0 min-h-[48px] px-6"
                >
                  Open Pack
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}

      <PackOpeningModal
        isOpen={isOpening}
        onClose={handlePackOpened}
        packId={selectedPackId}
      />
    </div>
  );
};

export default Packs;
