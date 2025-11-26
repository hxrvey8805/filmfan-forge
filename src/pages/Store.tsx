import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Crown, Coins, MessageSquareQuote, Star, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Store = () => {
  const [coins, setCoins] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState<number | null>(null);
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    loadUserStats();
    
    // Handle Stripe Checkout return
    const success = searchParams.get('success');
    const canceled = searchParams.get('canceled');
    const coinAmount = searchParams.get('coins');

    if (success === 'true' && coinAmount) {
      toast({
        title: "Payment successful!",
        description: `Your ${coinAmount} coins will be added shortly. Refreshing...`,
      });
      // Remove query params
      setSearchParams({});
      // Refresh coins after a delay (webhook should process)
      setTimeout(() => {
        loadUserStats();
      }, 2000);
    } else if (canceled === 'true') {
      toast({
        title: "Payment canceled",
        description: "Your payment was canceled. No charges were made.",
        variant: "default"
      });
      setSearchParams({});
    }
  }, [searchParams, toast, setSearchParams]);

  const loadUserStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let { data: stats, error } = await supabase
        .from('user_stats')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code === 'PGRST116') {
        // Create stats if they don't exist
        const { data: newStats, error: createError } = await supabase
          .from('user_stats')
          .insert({ user_id: user.id, coins: 100 })
          .select()
          .single();
        
        if (!createError && newStats) {
          stats = newStats;
        }
      }

      if (stats) {
        setCoins(stats.coins);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePurchase = async (packType: string, packTier: 'standard' | 'premium', cost: number) => {
    if (coins < cost) {
      toast({
        title: "Not enough coins",
        description: `You need ${cost} coins to purchase this pack`,
        variant: "destructive"
      });
      return;
    }

    setPurchasing(`${packType}-${packTier}`);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Deduct coins
      const { error: updateError } = await supabase
        .from('user_stats')
        .update({ coins: coins - cost })
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      // Add pack to user's inventory with tier
      const { error: packError } = await supabase
        .from('user_packs')
        .insert({
          user_id: user.id,
          pack_type: packType,
          pack_tier: packTier,
          is_opened: false
        });

      if (packError) throw packError;

      setCoins(coins - cost);
      
      const tierLabel = packTier === 'premium' ? 'Premium' : 'Standard';
      toast({
        title: "Pack purchased!",
        description: `You bought a ${tierLabel} ${packType} pack for ${cost} coins. Go to Packs to open it!`,
      });
    } catch (error: any) {
      console.error('Error purchasing pack:', error);
      toast({
        title: "Purchase failed",
        description: error.message || "Failed to purchase pack",
        variant: "destructive"
      });
    } finally {
      setPurchasing(null);
    }
  };

  const handleBuyCoins = async (coinAmount: number) => {
    setProcessingPayment(coinAmount);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication required",
          description: "Please log in to purchase coins",
          variant: "destructive"
        });
        return;
      }

      // Get session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Authentication required",
          description: "Please log in to purchase coins",
          variant: "destructive"
        });
        return;
      }

      // Create checkout session
      const { data, error } = await supabase.functions.invoke('create-payment-intent', {
        body: { coinAmount },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error || !data?.url) {
        throw new Error(error?.message || 'Failed to create checkout session');
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (error: any) {
      console.error('Error processing payment:', error);
      toast({
        title: "Payment failed",
        description: error.message || "Failed to process payment",
        variant: "destructive"
      });
    } finally {
      setProcessingPayment(null);
    }
  };

  const handlePurchaseQuestion = async () => {
    const cost = 150;
    if (coins < cost) {
      toast({
        title: "Not enough coins",
        description: `You need ${cost} coins to purchase a question`,
        variant: "destructive"
      });
      return;
    }

    setPurchasing('question');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Deduct coins
      const { error: updateError } = await supabase
        .from('user_stats')
        .update({ coins: coins - cost })
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      // Add a free question by resetting one question from today's count
      const today = new Date().toISOString().split('T')[0];
      let { data: aiUsage } = await supabase
        .from('user_ai_usage')
        .select('questions_today, last_reset_date')
        .eq('user_id', user.id)
        .single();

      if (!aiUsage) {
        // Create AI usage record if it doesn't exist
        await supabase
          .from('user_ai_usage')
          .insert({ 
            user_id: user.id, 
            questions_today: 0, 
            last_reset_date: today 
          });
      } else {
        // Decrement questions_today (effectively giving them a free question)
        const newCount = Math.max(0, aiUsage.questions_today - 1);
        await supabase
          .from('user_ai_usage')
          .update({ questions_today: newCount })
          .eq('user_id', user.id);
      }

      setCoins(coins - cost);
      
      toast({
        title: "Question purchased!",
        description: `You bought a question for ${cost} coins. You can now ask one more question!`,
      });
    } catch (error: any) {
      console.error('Error purchasing question:', error);
      toast({
        title: "Purchase failed",
        description: error.message || "Failed to purchase question",
        variant: "destructive"
      });
    } finally {
      setPurchasing(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-4 max-w-4xl mx-auto">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">Store</h2>
          <div className="flex items-center gap-2 bg-card px-4 py-2 rounded-lg border border-border">
            <Coins className="h-5 w-5 text-primary" />
            <span className="font-bold text-lg">{coins}</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Purchase packs and questions with coins earned from selling cards or buy coins directly
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading store...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Buy Coins Section */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Buy Coins
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card className="p-4 bg-gradient-to-br from-card to-card/80 border-border hover:border-primary/50 transition-colors cursor-pointer" onClick={() => handleBuyCoins(150)}>
                <div className="text-center space-y-2">
                  <div className="flex items-center justify-center gap-2">
                    <Coins className="h-5 w-5 text-primary" />
                    <span className="font-bold text-lg">150</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground">$1.49</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={processingPayment === 150}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBuyCoins(150);
                    }}
                  >
                    {processingPayment === 150 ? 'Processing...' : 'Buy'}
                  </Button>
                </div>
              </Card>

              <Card className="p-4 bg-gradient-to-br from-card to-card/80 border-border hover:border-primary/50 transition-colors cursor-pointer" onClick={() => handleBuyCoins(750)}>
                <div className="text-center space-y-2">
                  <div className="flex items-center justify-center gap-2">
                    <Coins className="h-5 w-5 text-primary" />
                    <span className="font-bold text-lg">750</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground">$6.99</p>
                  <Badge variant="secondary" className="text-xs">Best Value</Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-1"
                    disabled={processingPayment === 750}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBuyCoins(750);
                    }}
                  >
                    {processingPayment === 750 ? 'Processing...' : 'Buy'}
                  </Button>
                </div>
              </Card>

              <Card className="p-4 bg-gradient-to-br from-card to-card/80 border-border hover:border-primary/50 transition-colors cursor-pointer" onClick={() => handleBuyCoins(2000)}>
                <div className="text-center space-y-2">
                  <div className="flex items-center justify-center gap-2">
                    <Coins className="h-5 w-5 text-primary" />
                    <span className="font-bold text-lg">2000</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground">$12.99</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={processingPayment === 2000}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBuyCoins(2000);
                    }}
                  >
                    {processingPayment === 2000 ? 'Processing...' : 'Buy'}
                  </Button>
                </div>
              </Card>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="text-lg font-semibold mb-3">Spend Coins</h3>
          </div>

          {/* Question Purchase */}
          <Card className="p-5 bg-gradient-to-r from-primary/10 to-accent/10 border-2 border-primary/30 shadow-md">
            <div className="flex items-center gap-4">
              <div className="p-4 rounded-xl bg-gradient-to-br from-primary to-accent shadow-lg">
                <MessageSquareQuote className="h-9 w-9 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-lg tracking-tight">Spoiler-Free Question</h3>
                <p className="text-sm text-muted-foreground">
                  Purchase an additional question for the spoiler-free companion
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Coins className="h-4 w-4 text-primary" />
                  <span className="font-semibold">150 coins</span>
                </div>
              </div>
              <Button
                onClick={handlePurchaseQuestion}
                disabled={coins < 150 || purchasing === 'question'}
                size="lg"
                className="bg-gradient-to-r from-primary to-accent hover:opacity-90 shrink-0 min-h-[48px] px-6"
              >
                {purchasing === 'question' ? 'Purchasing...' : 'Buy Question'}
              </Button>
            </div>
          </Card>

          {/* Standard Actor Pack */}
          <Card className="p-5 bg-gradient-to-r from-primary/10 to-accent/10 border-border shadow-md">
            <div className="flex items-center gap-4">
              <div className="p-4 rounded-xl bg-gradient-to-br from-primary to-accent shadow-lg">
                <Sparkles className="h-9 w-9 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-lg tracking-tight">Actor Pack</h3>
                  <Badge variant="outline" className="text-xs">Standard</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Contains a random actor with standard odds
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Coins className="h-4 w-4 text-primary" />
                  <span className="font-semibold">50 coins</span>
                </div>
              </div>
              <Button
                onClick={() => handlePurchase('actor', 'standard', 50)}
                disabled={coins < 50 || purchasing === 'actor-standard'}
                size="lg"
                className="bg-gradient-to-r from-primary to-accent hover:opacity-90 shrink-0 min-h-[48px] px-6"
              >
                {purchasing === 'actor-standard' ? 'Purchasing...' : 'Buy Pack'}
              </Button>
            </div>
          </Card>

          {/* Premium Actor Pack */}
          <Card className="p-5 bg-gradient-to-r from-primary/20 to-accent/20 border-2 border-primary/40 shadow-lg">
            <div className="flex items-center gap-4">
              <div className="p-4 rounded-xl bg-gradient-to-br from-primary to-accent shadow-lg relative">
                <Sparkles className="h-9 w-9 text-white" />
                <Star className="h-5 w-5 text-yellow-400 absolute -top-1 -right-1 fill-yellow-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-lg tracking-tight">Actor Pack</h3>
                  <Badge className="bg-gradient-to-r from-primary to-accent text-white border-0">Premium</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Better odds for Legendary, A-List, and Established actors
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Coins className="h-4 w-4 text-primary" />
                  <span className="font-semibold">150 coins</span>
                </div>
              </div>
              <Button
                onClick={() => handlePurchase('actor', 'premium', 150)}
                disabled={coins < 150 || purchasing === 'actor-premium'}
                size="lg"
                className="bg-gradient-to-r from-primary to-accent hover:opacity-90 shrink-0 min-h-[48px] px-6"
              >
                {purchasing === 'actor-premium' ? 'Purchasing...' : 'Buy Pack'}
              </Button>
            </div>
          </Card>

          {/* Standard Director Pack */}
          <Card className="p-5 bg-gradient-to-r from-amber-700/10 to-amber-900/10 border-border shadow-md">
            <div className="flex items-center gap-4">
              <div className="p-4 rounded-xl bg-gradient-to-br from-amber-700 to-amber-900 shadow-lg">
                <Crown className="h-9 w-9 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-lg tracking-tight">Director Pack</h3>
                  <Badge variant="outline" className="text-xs">Standard</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Contains a random director with standard odds
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Coins className="h-4 w-4 text-amber-700" />
                  <span className="font-semibold">50 coins</span>
                </div>
              </div>
              <Button
                onClick={() => handlePurchase('director', 'standard', 50)}
                disabled={coins < 50 || purchasing === 'director-standard'}
                size="lg"
                className="bg-gradient-to-r from-amber-700 to-amber-900 hover:opacity-90 shrink-0 min-h-[48px] px-6"
              >
                {purchasing === 'director-standard' ? 'Purchasing...' : 'Buy Pack'}
              </Button>
            </div>
          </Card>

          {/* Premium Director Pack */}
          <Card className="p-5 bg-gradient-to-r from-amber-700/20 to-amber-900/20 border-2 border-amber-700/40 shadow-lg">
            <div className="flex items-center gap-4">
              <div className="p-4 rounded-xl bg-gradient-to-br from-amber-700 to-amber-900 shadow-lg relative">
                <Crown className="h-9 w-9 text-white" />
                <Star className="h-5 w-5 text-yellow-400 absolute -top-1 -right-1 fill-yellow-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-lg tracking-tight">Director Pack</h3>
                  <Badge className="bg-gradient-to-r from-amber-700 to-amber-900 text-white border-0">Premium</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Better odds for Legendary, A-List, and Established directors
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Coins className="h-4 w-4 text-amber-700" />
                  <span className="font-semibold">150 coins</span>
                </div>
              </div>
              <Button
                onClick={() => handlePurchase('director', 'premium', 150)}
                disabled={coins < 150 || purchasing === 'director-premium'}
                size="lg"
                className="bg-gradient-to-r from-amber-700 to-amber-900 hover:opacity-90 shrink-0 min-h-[48px] px-6"
              >
                {purchasing === 'director-premium' ? 'Purchasing...' : 'Buy Pack'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Store;
