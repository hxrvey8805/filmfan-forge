import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Package, Sparkles, Crown, User, Coins, DollarSign } from "lucide-react";
import PackOpeningModal from "@/components/PackOpeningModal";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Packs = () => {
  const [isOpening, setIsOpening] = useState(false);
  const [selectedPackId, setSelectedPackId] = useState<string>("");
  const [availablePacks, setAvailablePacks] = useState<any[]>([]);
  const [collection, setCollection] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [coins, setCoins] = useState(0);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [sellingCard, setSellingCard] = useState<string | null>(null);
  const [cardPrices, setCardPrices] = useState<Record<string, number>>({});
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await Promise.all([loadAvailablePacks(), loadCollection(), loadUserStats()]);
  };

  const loadUserStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let { data: stats } = await supabase
        .from('user_stats')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (!stats) {
        const { data: newStats } = await supabase
          .from('user_stats')
          .insert({ user_id: user.id, coins: 100 })
          .select()
          .single();
        stats = newStats;
      }

      if (stats) {
        setCoins(stats.coins);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

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

  const loadCollection = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_collection')
        .select('*')
        .order('collected_at', { ascending: false });

      if (error) throw error;
      setCollection(data || []);
      
      // Fetch prices for all cards
      if (data && data.length > 0) {
        fetchCardPrices(data);
      }
    } catch (error) {
      console.error('Error loading collection:', error);
    }
  };

  const fetchCardPrices = async (cards: any[]) => {
    const prices: Record<string, number> = {};
    
    // Fetch prices in parallel for better performance
    const pricePromises = cards.map(async (card) => {
      try {
        const { data, error } = await supabase.functions.invoke('calculate-person-value', {
          body: {
            personName: card.person_name,
            personType: card.person_type,
            personId: card.person_id
          }
        });

        if (error) {
          console.error('Error fetching price for card:', card.id, error);
          prices[card.id] = card.person_type === 'director' ? 50 : 30; // Fallback
        } else {
          prices[card.id] = data.price || 30;
        }
      } catch (error) {
        console.error('Error fetching price for card:', card.id, error);
        prices[card.id] = 30; // Default fallback
      }
    });

    await Promise.all(pricePromises);
    setCardPrices(prices);
  };

  const handleOpenPack = (packId: string) => {
    setSelectedPackId(packId);
    setIsOpening(true);
  };

  const handlePackOpened = () => {
    setIsOpening(false);
    loadData();
  };

  const handleSellCard = async (cardId: string, personName: string) => {
    setSellingCard(cardId);
    
    // Optimistically remove the card from UI
    setCollection(prev => prev.filter(item => item.id !== cardId));
    
    try {
      const { data, error } = await supabase.functions.invoke('sell-card', {
        body: { cardId }
      });

      if (error) throw error;

      toast({
        title: "Card sold!",
        description: data.message,
      });

      setCoins(data.newBalance);
      
      // Remove the price from the prices map
      setCardPrices(prev => {
        const newPrices = { ...prev };
        delete newPrices[cardId];
        return newPrices;
      });
    } catch (error: any) {
      console.error('Error selling card:', error);
      toast({
        title: "Sale failed",
        description: error.message || "Failed to sell card",
        variant: "destructive"
      });
      // Reload collection on error to restore the card
      loadCollection();
    } finally {
      setSellingCard(null);
      setHoveredCard(null);
    }
  };

  const actorPacks = availablePacks.filter(p => p.pack_type === 'actor');
  const directorPacks = availablePacks.filter(p => p.pack_type === 'director');

  return (
    <div className="space-y-6 animate-fade-in pb-4 max-w-4xl mx-auto">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">Your Packs</h2>
          <div className="flex items-center gap-2 bg-card px-4 py-2 rounded-lg border border-border">
            <Coins className="h-5 w-5 text-primary" />
            <span className="font-bold text-lg">{coins}</span>
          </div>
        </div>
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

      {/* Collection Section */}
      {collection.length > 0 && (
        <div className="space-y-4 pt-6 border-t border-border">
          <h2 className="text-2xl font-bold tracking-tight">Your Collection</h2>
          <p className="text-sm text-muted-foreground">
            Hover over cards to sell them for coins based on their popularity
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {collection.map((item) => (
              <Card 
                key={item.id} 
                className="relative overflow-hidden bg-card border-border hover:shadow-lg transition-all group"
                onMouseEnter={() => setHoveredCard(item.id)}
                onMouseLeave={() => setHoveredCard(null)}
              >
                {item.profile_path ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w500${item.profile_path}`}
                    alt={item.person_name}
                    className="w-full aspect-[2/3] object-cover"
                  />
                ) : (
                  <div className="w-full aspect-[2/3] bg-muted flex items-center justify-center">
                    <User className="h-12 w-12 text-muted-foreground" />
                  </div>
                )}
                
                {/* Sell overlay */}
                {hoveredCard === item.id && (
                  <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3 animate-fade-in">
                    <div className="flex items-center gap-2 bg-primary/20 px-4 py-2 rounded-lg">
                      <Coins className="h-5 w-5 text-primary" />
                      <span className="font-bold text-lg text-white">
                        {cardPrices[item.id] || '...'} coins
                      </span>
                    </div>
                    <Button
                      onClick={() => handleSellCard(item.id, item.person_name)}
                      disabled={sellingCard === item.id}
                      size="sm"
                      className="bg-primary hover:bg-primary/90 gap-2"
                    >
                      <DollarSign className="h-4 w-4" />
                      {sellingCard === item.id ? 'Selling...' : 'Sell Card'}
                    </Button>
                  </div>
                )}
                
                <div className="p-3 space-y-1">
                  <p className="font-semibold text-sm line-clamp-1">{item.person_name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{item.person_type}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Packs;
