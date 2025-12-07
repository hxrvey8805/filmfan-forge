import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, Camera, Star, X, DollarSign } from "lucide-react";
import { GlassesWithLenses } from "@/components/GlassesWithLenses";
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
  const [isCollectionFullAtReveal, setIsCollectionFullAtReveal] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && packId) {
      setStage("opening");
      setPerson(null);
      setIsCollectionFullAtReveal(false);
      setCurrentCollection([]);
      setCardPrices({});
      checkCollectionBeforeOpening();
    }
  }, [isOpen, packId]);

  const checkCollectionBeforeOpening = async () => {
    // Allow pack to open - we'll check collection status when card is revealed
    // This allows users to see the card and choose replace/reject options
    openPack();
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

  const handleRejectCard = async () => {
    try {
      // If card was already added to collection (shouldn't happen, but safety check)
      // Remove it if user rejects
      if (person) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Check if this card is in the collection
          const { data: existingCard } = await supabase
            .from('user_collection')
            .select('id')
            .eq('user_id', user.id)
            .eq('person_id', person.id)
            .eq('person_type', packType)
            .single();

          // If card exists, remove it
          if (existingCard) {
            await supabase
              .from('user_collection')
              .delete()
              .eq('id', existingCard.id);
          }
        }
      }

      // Mark pack as opened so it disappears from available packs list
      // (Available packs are filtered by is_opened: false)
      const { error: updateError } = await supabase
        .from('user_packs')
        .update({ is_opened: true, opened_at: new Date().toISOString() })
        .eq('id', packId);

      if (updateError) {
        console.error('Error marking pack as opened:', updateError);
        toast({
          title: "Error",
          description: "Failed to remove pack. Please try again.",
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Card rejected",
        description: "The pack has been removed.",
      });
      
      // Close modal first
      onClose();
      
      // Refresh packs list after a short delay to ensure DB update
      setTimeout(() => {
        onPackOpened?.();
      }, 100);
    } catch (error) {
      console.error('Error rejecting card:', error);
      toast({
        title: "Error",
        description: "Failed to reject pack. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleReplaceCard = async (cardIdToReplace: string) => {
    setSellingCard(cardIdToReplace);
    
    try {
      // First, sell the old card
      const { data: sellData, error: sellError } = await supabase.functions.invoke('sell-card', {
        body: { cardId: cardIdToReplace }
      });

      if (sellError) throw sellError;

      toast({
        title: "Card sold!",
        description: sellData.message,
      });

      // Remove old card from collection
      setCurrentCollection(prev => prev.filter(c => c.id !== cardIdToReplace));
      setCardPrices(prev => {
        const newPrices = { ...prev };
        delete newPrices[cardIdToReplace];
        return newPrices;
      });

      // Now add the new card to collection by calling open-pack again
      // But we need to actually add it - let's do it manually
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error: insertError } = await supabase
        .from('user_collection')
        .insert({
          user_id: user.id,
          person_id: person.id,
          person_name: person.name,
          person_type: packType,
          profile_path: person.profile_path || '',
        });

      if (insertError) {
        throw new Error('Failed to add new card to collection');
      }

      // Mark pack as opened
      const { error: updateError } = await supabase
        .from('user_packs')
        .update({ is_opened: true, opened_at: new Date().toISOString() })
        .eq('id', packId);

      if (updateError) {
        console.error('Error marking pack as opened:', updateError);
      }

      toast({
        title: "Card replaced!",
        description: `${person.name} has been added to your collection.`,
      });

      onClose();
      onPackOpened?.();
    } catch (error: any) {
      console.error('Error replacing card:', error);
      toast({
        title: "Replace failed",
        description: error.message || "Failed to replace card",
        variant: "destructive"
      });
    } finally {
      setSellingCard(null);
    }
  };

  const openPack = async () => {
    try {
      setStage("opening");
      const { data, error } = await supabase.functions.invoke('open-pack', {
        body: { packId }
      });

      console.log('open-pack response:', { data, error });

      // Check for collection full in both error AND data (edge function may return 409 as successful response)
      const isCollectionFullInData = data?.error === 'COLLECTION_FULL';
      
      if (error || isCollectionFullInData) {
        const errorData = isCollectionFullInData ? data : (error?.context?.body ? JSON.parse(error.context.body) : error);
        console.log('Error data parsed:', errorData);
        
        // Check if it's a collection full error
        const isCollectionFull = 
          errorData?.error === 'COLLECTION_FULL' ||
          isCollectionFullInData;
        
        if (isCollectionFull) {
          const packTypeFromError = errorData?.packType || errorData?.pack_type;
          
          // If we can't get pack type from error, we need to get it from the pack
          let detectedPackType = packTypeFromError;
          if (!detectedPackType) {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              const { data: pack } = await supabase
                .from('user_packs')
                .select('pack_type')
                .eq('id', packId)
                .eq('user_id', user.id)
                .single();
              detectedPackType = pack?.pack_type || 'actor';
            }
          }
          
          setPackType(detectedPackType || 'actor');
          await loadCollectionForType(detectedPackType || 'actor');
          setStage("collection-full");
          return;
        }
        
        // For other errors, show error toast
        const errorMessage = errorData?.message || errorData?.error || error?.message || "Failed to open pack";
        toast({
          title: "Error opening pack",
          description: errorMessage,
          variant: "destructive"
        });
        onClose();
        return;
      }

      // Determine pack type from person data
      const type = data.person.known_for_department === "Directing" ? "director" : "actor";
      setPackType(type);

      // Check if collection is full for this type before revealing
      // IMPORTANT: Backend may have already added the card, so we check AFTER getting response
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: collection } = await supabase
          .from('user_collection')
          .select('id, person_id')
          .eq('user_id', user.id)
          .eq('person_type', type);

        const COLLECTION_LIMIT = 5;
        const currentCount = collection?.length || 0;

        // Check if the newly added card is in the collection
        const cardAlreadyAdded = collection?.some(c => c.person_id === data.person.id);

        // If collection is at or over limit AND card was already added by backend
        if (currentCount >= COLLECTION_LIMIT && cardAlreadyAdded) {
          // Card was added when collection was full - remove it and mark pack as unopened
          const cardToRemove = collection?.find(c => c.person_id === data.person.id);
          if (cardToRemove) {
            await supabase
              .from('user_collection')
              .delete()
              .eq('id', cardToRemove.id);
            
            // Mark pack as unopened
            await supabase
              .from('user_packs')
              .update({ is_opened: false, opened_at: null })
              .eq('id', packId);
            
            // Show replace/reject UI instead of error
            setIsCollectionFullAtReveal(true);
            await loadCollectionForType(type);
            // Continue to reveal stage to show replace/reject options
          } else {
            // Collection is full but card wasn't added - show replace/reject UI
            setIsCollectionFullAtReveal(true);
            await loadCollectionForType(type);
          }
        } else if (currentCount >= COLLECTION_LIMIT) {
          // Collection is full but card wasn't added yet - show replace/reject UI
          setIsCollectionFullAtReveal(true);
          await loadCollectionForType(type);
        } else {
          // Collection has space - normal flow
          setIsCollectionFullAtReveal(false);
        }
      }

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
      <DialogContent className="max-w-md bg-background border-border overflow-hidden max-h-[90vh] flex flex-col">
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
                  <GlassesWithLenses className="h-20 w-20 text-purple-400 mx-auto animate-spin" style={{ animationDuration: '3s' }} />
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
          <div className="py-4 space-y-4 max-h-[85vh] overflow-y-auto">
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
                    {packType === "actor" ? <Camera className="h-4 w-4" /> : <GlassesWithLenses className="h-4 w-4" />}
                    {person.known_for_department}
                  </p>
                </div>
              </div>
            </div>

            {isCollectionFullAtReveal ? (
              <div className="space-y-4 pt-2">
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <p className="text-sm text-center font-medium text-yellow-600 dark:text-yellow-400">
                    Your {packType} collection is full (5/5)
                  </p>
                  <p className="text-xs text-center text-muted-foreground mt-1">
                    Replace a card below or reject this one
                  </p>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide text-center">
                    Your {packType === 'actor' ? 'Actors' : 'Directors'}
                  </h4>
                  <div className="grid grid-cols-2 gap-2 max-h-[280px] overflow-y-auto pr-1">
                    {currentCollection.map((card: any) => (
                      <Card key={card.id} className="p-2 space-y-2 border-border hover:border-primary/50 transition-all hover:shadow-md">
                        <div className="aspect-[2/3] rounded overflow-hidden bg-muted">
                          {card.profile_path ? (
                            <img
                              src={`https://image.tmdb.org/t/p/w200${card.profile_path}`}
                              alt={card.person_name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Sparkles className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <p className="font-semibold text-xs text-center truncate px-1">{card.person_name}</p>
                          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                            <DollarSign className="h-3 w-3" />
                            <span>{cardPrices[card.id] || '...'}</span>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReplaceCard(card.id)}
                            disabled={sellingCard === card.id}
                            className="w-full text-xs h-7"
                          >
                            {sellingCard === card.id ? (
                              "Selling..."
                            ) : (
                              <>
                                <DollarSign className="h-3 w-3 mr-1" />
                                Replace
                              </>
                            )}
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t border-border">
                  <Button
                    variant="outline"
                    onClick={handleRejectCard}
                    className="flex-1"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Reject Card
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                onClick={async () => {
                  // Final safety check before adding
                  const { data: { user } } = await supabase.auth.getUser();
                  if (user && person) {
                    const { data: collection } = await supabase
                      .from('user_collection')
                      .select('id')
                      .eq('user_id', user.id)
                      .eq('person_type', packType);

                    const COLLECTION_LIMIT = 5;
                    const currentCount = collection?.length || 0;

                    // If collection is full, show replace/reject options instead
                    if (currentCount >= COLLECTION_LIMIT) {
                      toast({
                        title: "Collection Full",
                        description: `Your ${packType} collection is full. Please replace a card or reject this one.`,
                        variant: "destructive"
                      });
                      setIsCollectionFullAtReveal(true);
                      await loadCollectionForType(packType);
                      return;
                    }
                  }

                  // Collection has space - proceed
                  onClose();
                  onPackOpened?.();
                }}
                className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity"
              >
                Add to Collection
              </Button>
            )}
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
