import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, Glasses, Camera, Star, X, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PackOpeningModalProps {
  isOpen: boolean;
  onClose: () => void;
  packId: string;
  onPackOpened?: () => void;
}

const PackOpeningModal = ({ isOpen, onClose, packId, onPackOpened }: PackOpeningModalProps) => {
  const [stage, setStage] = useState<"opening" | "building" | "reveal" | "collection-full">("opening");
  const [person, setPerson] = useState<any>(null);
  const [packType, setPackType] = useState<"actor" | "director">("actor");
  const [collectionFull, setCollectionFull] = useState<any>(null);
  const [currentCollection, setCurrentCollection] = useState<any[]>([]);
  const [cardPrices, setCardPrices] = useState<Record<string, number>>({});
  const [sellingCard, setSellingCard] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && packId) {
      setStage("opening");
      setPerson(null);
      checkCollectionBeforeOpening();
    }
  }, [isOpen, packId]);

  const checkCollectionBeforeOpening = async () => {
    try {
      // First, get the pack to know its type
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: pack, error: packError } = await supabase
        .from('user_packs')
        .select('pack_type')
        .eq('id', packId)
        .eq('user_id', user.id)
        .single();

      if (packError || !pack) {
        toast({
          title: "Error",
          description: "Pack not found",
          variant: "destructive"
        });
        onClose();
        return;
      }

      // Check collection count for this pack type
      const { data: collection, error: collectionError } = await supabase
        .from('user_collection')
        .select('id')
        .eq('user_id', user.id)
        .eq('person_type', pack.pack_type);

      if (collectionError) {
        console.error('Error checking collection:', collectionError);
        // Continue anyway - let backend handle it
        openPack();
        return;
      }

      const COLLECTION_LIMIT = 5;
      const currentCount = collection?.length || 0;

      console.log(`[FRONTEND CHECK] Pack type: ${pack.pack_type}, Current count: ${currentCount}, Limit: ${COLLECTION_LIMIT}`);

      if (currentCount >= COLLECTION_LIMIT) {
        // Collection is full - show the collection full dialog
        setPackType(pack.pack_type);
        setCollectionFull({
          error: 'COLLECTION_FULL',
          message: `Your ${pack.pack_type} collection is full (${COLLECTION_LIMIT}/${COLLECTION_LIMIT}). Please sell a card or reject this one.`,
          collectionCount: currentCount,
          limit: COLLECTION_LIMIT,
          packType: pack.pack_type
        });
        await loadCollectionForType(pack.pack_type);
        setStage("collection-full");
        return;
      }

      // Collection has space - proceed with opening
      openPack();
    } catch (error: any) {
      console.error('Error checking collection before opening:', error);
      // On error, try opening anyway - backend will handle it
      openPack();
    }
  };

  const loadCollectionForType = async (type: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_collection')
        .select('*')
        .eq('user_id', user.id)
        .eq('person_type', type)
        .order('collected_at', { ascending: false });

      if (error) throw error;
      setCurrentCollection(data || []);

      // Fetch prices for cards
      if (data && data.length > 0) {
        const prices: Record<string, number> = {};
        const pricePromises = data.map(async (card: any) => {
          try {
            const { data: priceData } = await supabase.functions.invoke('calculate-person-value', {
              body: {
                personName: card.person_name,
                personType: card.person_type,
                personId: card.person_id
              }
            });
            prices[card.id] = priceData?.price || 30;
          } catch (error) {
            prices[card.id] = 30;
          }
        });
        await Promise.all(pricePromises);
        setCardPrices(prices);
      }
    } catch (error) {
      console.error('Error loading collection:', error);
    }
  };

  const handleSellCard = async (cardId: string) => {
    setSellingCard(cardId);
    
    try {
      const { data, error } = await supabase.functions.invoke('sell-card', {
        body: { cardId }
      });

      if (error) throw error;

      toast({
        title: "Card sold!",
        description: data.message,
      });

      // Remove card from collection and retry opening pack
      setCurrentCollection(prev => prev.filter(c => c.id !== cardId));
      setCardPrices(prev => {
        const newPrices = { ...prev };
        delete newPrices[cardId];
        return newPrices;
      });

      // Retry opening the pack
      setTimeout(() => {
        openPack();
      }, 500);
    } catch (error: any) {
      console.error('Error selling card:', error);
      toast({
        title: "Sale failed",
        description: error.message || "Failed to sell card",
        variant: "destructive"
      });
    } finally {
      setSellingCard(null);
    }
  };

  const handleRejectCard = () => {
    // Just close the modal - pack stays unopened
    toast({
      title: "Card rejected",
      description: "The pack remains unopened. You can try again later.",
    });
    onClose();
  };

  const openPack = async () => {
    try {
      setStage("opening");
      const { data, error } = await supabase.functions.invoke('open-pack', {
        body: { packId }
      });

      if (error) {
        // Check if it's a collection full error
        if (error.message?.includes('COLLECTION_FULL') || error.error === 'COLLECTION_FULL') {
          const errorData = error.data || error;
          setCollectionFull(errorData);
          setPackType(errorData.packType || 'actor');
          await loadCollectionForType(errorData.packType || 'actor');
          setStage("collection-full");
          return;
        }
        throw error;
      }

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
        <DialogTitle className="sr-only">Pack Opening</DialogTitle>
        <DialogDescription className="sr-only">Cinematic reveal of your new card</DialogDescription>
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
                  <Glasses className="h-20 w-20 text-purple-400 mx-auto animate-spin" style={{ animationDuration: '3s' }} />
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
                    {packType === "actor" ? <Camera className="h-4 w-4" /> : <Glasses className="h-4 w-4" />}
                    {person.known_for_department}
                  </p>
                </div>
              </div>
            </div>

            <Button
              onClick={() => {
                onClose();
                onPackOpened?.();
              }}
              className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity"
            >
              Add to Collection
            </Button>
          </div>
        )}

        {stage === "collection-full" && collectionFull && (
          <div className="py-6 space-y-6 max-h-[80vh] overflow-y-auto">
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-bold">Collection Full!</h3>
              <p className="text-muted-foreground">
                Your {packType} collection is full ({collectionFull.collectionCount || 5}/{collectionFull.limit || 5}). 
                Sell a card to make room or reject this one.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Your {packType === 'actor' ? 'Actors' : 'Directors'} ({currentCollection.length})
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {currentCollection.map((card: any) => (
                  <Card key={card.id} className="p-3 space-y-2 border-border hover:border-primary/50 transition-colors">
                    {card.profile_path ? (
                      <img
                        src={`https://image.tmdb.org/t/p/w154${card.profile_path}`}
                        alt={card.person_name}
                        className="w-full aspect-[2/3] object-cover rounded"
                      />
                    ) : (
                      <div className="w-full aspect-[2/3] bg-muted rounded flex items-center justify-center">
                        <Sparkles className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <p className="font-medium text-sm truncate">{card.person_name}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        {cardPrices[card.id] || '...'}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSellCard(card.id)}
                        disabled={sellingCard === card.id}
                        className="h-7 text-xs"
                      >
                        {sellingCard === card.id ? 'Selling...' : 'Sell'}
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-border">
              <Button
                variant="outline"
                onClick={handleRejectCard}
                className="flex-1"
              >
                <X className="h-4 w-4 mr-2" />
                Reject Card
              </Button>
              <Button
                onClick={() => {
                  setStage("opening");
                  openPack();
                }}
                disabled={currentCollection.length >= (collectionFull.limit || 5)}
                className="flex-1 bg-gradient-to-r from-primary to-accent hover:opacity-90"
              >
                Try Again
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PackOpeningModal;
