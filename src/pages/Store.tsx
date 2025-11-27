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
    const sessionId = searchParams.get('session_id');

    if (success === 'true' && sessionId) {
      verifyPayment(sessionId);
    } else if (canceled === 'true') {
      toast({
        title: "Payment canceled",
        description: "Your payment was canceled. No charges were made.",
        variant: "default"
      });
      setSearchParams({});
    }
  }, [searchParams, toast, setSearchParams]);

  const verifyPayment = async (sessionId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase.functions.invoke('verify-payment', {
        body: { sessionId },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error || !data?.success) {
        throw new Error(error?.message || 'Failed to verify payment');
      }

      toast({
        title: "Payment successful!",
        description: `${data.coinsAdded} coins added to your account!`,
      });
      
      setCoins(data.newBalance);
      setSearchParams({});
    } catch (error: any) {
      console.error('Error verifying payment:', error);
      toast({
        title: "Verification failed",
        description: "Payment succeeded but coins may take a moment to appear. Please refresh if needed.",
        variant: "destructive"
      });
      setSearchParams({});
      loadUserStats();
    }
  };

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
        <div className="space-y-8">
          {/* Buy Coins Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Buy Coins
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-5 bg-gradient-to-br from-card to-card/80 border-border hover:border-primary/50 transition-all hover:shadow-lg cursor-pointer group" onClick={() => handleBuyCoins(150)}>
                <div className="text-center space-y-3">
                  <div className="flex items-center justify-center gap-2">
                    <Coins className="h-6 w-6 text-primary group-hover:scale-110 transition-transform" />
                    <span className="font-bold text-2xl">150</span>
                  </div>
                  <p className="text-base font-semibold text-foreground">$1.49</p>
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

              <Card className="p-5 bg-gradient-to-br from-card to-card/80 border-2 border-primary/40 hover:border-primary/60 transition-all hover:shadow-xl cursor-pointer group relative overflow-hidden">
                <div className="absolute top-2 right-2">
                  <Badge className="bg-gradient-to-r from-primary to-accent text-white border-0 text-xs">Best Value</Badge>
                </div>
                <div className="text-center space-y-3" onClick={() => handleBuyCoins(750)}>
                  <div className="flex items-center justify-center gap-2">
                    <Coins className="h-6 w-6 text-primary group-hover:scale-110 transition-transform" />
                    <span className="font-bold text-2xl">750</span>
                  </div>
                  <p className="text-base font-semibold text-foreground">$6.99</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
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

              <Card className="p-5 bg-gradient-to-br from-card to-card/80 border-border hover:border-primary/50 transition-all hover:shadow-lg cursor-pointer group" onClick={() => handleBuyCoins(2000)}>
                <div className="text-center space-y-3">
                  <div className="flex items-center justify-center gap-2">
                    <Coins className="h-6 w-6 text-primary group-hover:scale-110 transition-transform" />
                    <span className="font-bold text-2xl">2000</span>
                  </div>
                  <p className="text-base font-semibold text-foreground">$12.99</p>
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

          {/* Spoil-Free Questions Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20">
                <MessageSquareQuote className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Companion Features
              </h3>
            </div>
            <Card className="p-5 bg-gradient-to-r from-primary/10 to-accent/10 border-2 border-primary/30 shadow-lg hover:shadow-xl transition-shadow">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="p-4 rounded-xl bg-gradient-to-br from-primary to-accent shadow-lg shrink-0">
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
                  className="bg-gradient-to-r from-primary to-accent hover:opacity-90 w-full sm:w-auto min-h-[48px] px-6"
                >
                  {purchasing === 'question' ? 'Purchasing...' : 'Buy Question'}
                </Button>
              </div>
            </Card>
          </div>

          {/* Actor Packs Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Actor Packs
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Standard Actor Pack */}
              <Card className="p-5 bg-gradient-to-r from-primary/10 to-accent/10 border-border shadow-md hover:shadow-lg transition-shadow">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-primary to-accent shadow-lg">
                      <Sparkles className="h-7 w-7 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-lg tracking-tight">Actor Pack</h3>
                        <Badge variant="outline" className="text-xs">Standard</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Coins className="h-4 w-4 text-primary" />
                        <span className="font-semibold">50 coins</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Contains a random actor with standard odds
                  </p>
                  <Button
                    onClick={() => handlePurchase('actor', 'standard', 50)}
                    disabled={coins < 50 || purchasing === 'actor-standard'}
                    size="lg"
                    className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 min-h-[48px]"
                  >
                    {purchasing === 'actor-standard' ? 'Purchasing...' : 'Buy Pack'}
                  </Button>
                </div>
              </Card>

              {/* Premium Actor Pack */}
              <Card className="p-5 bg-gradient-to-r from-primary/20 to-accent/20 border-2 border-primary/40 shadow-lg hover:shadow-xl transition-shadow">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-primary to-accent shadow-lg relative">
                      <Sparkles className="h-7 w-7 text-white" />
                      <Star className="h-4 w-4 text-yellow-400 absolute -top-1 -right-1 fill-yellow-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-lg tracking-tight">Actor Pack</h3>
                        <Badge className="bg-gradient-to-r from-primary to-accent text-white border-0">Premium</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Coins className="h-4 w-4 text-primary" />
                        <span className="font-semibold">150 coins</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Better odds for Legendary, A-List, and Established actors
                  </p>
                  <Button
                    onClick={() => handlePurchase('actor', 'premium', 150)}
                    disabled={coins < 150 || purchasing === 'actor-premium'}
                    size="lg"
                    className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 min-h-[48px]"
                  >
                    {purchasing === 'actor-premium' ? 'Purchasing...' : 'Buy Pack'}
                  </Button>
                </div>
              </Card>
            </div>
          </div>

          {/* Director Packs Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-amber-700/20 to-amber-900/20">
                <Crown className="h-5 w-5 text-amber-700" />
              </div>
              <h3 className="text-xl font-bold bg-gradient-to-r from-amber-700 to-amber-900 bg-clip-text text-transparent">
                Director Packs
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Standard Director Pack */}
              <Card className="p-5 bg-gradient-to-r from-amber-700/10 to-amber-900/10 border-border shadow-md hover:shadow-lg transition-shadow">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-amber-700 to-amber-900 shadow-lg">
                      <Crown className="h-7 w-7 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-lg tracking-tight">Director Pack</h3>
                        <Badge variant="outline" className="text-xs">Standard</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Coins className="h-4 w-4 text-amber-700" />
                        <span className="font-semibold">50 coins</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Contains a random director with standard odds
                  </p>
                  <Button
                    onClick={() => handlePurchase('director', 'standard', 50)}
                    disabled={coins < 50 || purchasing === 'director-standard'}
                    size="lg"
                    className="w-full bg-gradient-to-r from-amber-700 to-amber-900 hover:opacity-90 min-h-[48px]"
                  >
                    {purchasing === 'director-standard' ? 'Purchasing...' : 'Buy Pack'}
                  </Button>
                </div>
              </Card>

              {/* Premium Director Pack */}
              <Card className="p-5 bg-gradient-to-r from-amber-700/20 to-amber-900/20 border-2 border-amber-700/40 shadow-lg hover:shadow-xl transition-shadow">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-amber-700 to-amber-900 shadow-lg relative">
                      <Crown className="h-7 w-7 text-white" />
                      <Star className="h-4 w-4 text-yellow-400 absolute -top-1 -right-1 fill-yellow-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-lg tracking-tight">Director Pack</h3>
                        <Badge className="bg-gradient-to-r from-amber-700 to-amber-900 text-white border-0">Premium</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Coins className="h-4 w-4 text-amber-700" />
                        <span className="font-semibold">150 coins</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Better odds for Legendary, A-List, and Established directors
                  </p>
                  <Button
                    onClick={() => handlePurchase('director', 'premium', 150)}
                    disabled={coins < 150 || purchasing === 'director-premium'}
                    size="lg"
                    className="w-full bg-gradient-to-r from-amber-700 to-amber-900 hover:opacity-90 min-h-[48px]"
                  >
                    {purchasing === 'director-premium' ? 'Purchasing...' : 'Buy Pack'}
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Store;
