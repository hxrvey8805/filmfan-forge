import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, Crown, Coins, MessageSquareQuote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Store = () => {
  const [coins, setCoins] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadUserStats();
  }, []);

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

  const handlePurchase = async (packType: string, cost: number) => {
    if (coins < cost) {
      toast({
        title: "Not enough coins",
        description: `You need ${cost} coins to purchase this pack`,
        variant: "destructive"
      });
      return;
    }

    setPurchasing(packType);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Deduct coins
      const { error: updateError } = await supabase
        .from('user_stats')
        .update({ coins: coins - cost })
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      // Add pack to user's inventory
      const { error: packError } = await supabase
        .from('user_packs')
        .insert({
          user_id: user.id,
          pack_type: packType,
          is_opened: false
        });

      if (packError) throw packError;

      setCoins(coins - cost);
      
      toast({
        title: "Pack purchased!",
        description: `You bought a ${packType} pack for ${cost} coins. Go to Packs to open it!`,
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
          Purchase packs and questions with coins earned from selling cards
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading store...</p>
        </div>
      ) : (
        <div className="space-y-4">
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

          <Card className="p-5 bg-gradient-to-r from-primary/10 to-accent/10 border-border shadow-md">
            <div className="flex items-center gap-4">
              <div className="p-4 rounded-xl bg-gradient-to-br from-primary to-accent shadow-lg">
                <Sparkles className="h-9 w-9 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-lg tracking-tight">Actor Pack</h3>
                <p className="text-sm text-muted-foreground">
                  Contains a random popular actor
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Coins className="h-4 w-4 text-primary" />
                  <span className="font-semibold">50 coins</span>
                </div>
              </div>
              <Button
                onClick={() => handlePurchase('actor', 50)}
                disabled={coins < 50 || purchasing === 'actor'}
                size="lg"
                className="bg-gradient-to-r from-primary to-accent hover:opacity-90 shrink-0 min-h-[48px] px-6"
              >
                {purchasing === 'actor' ? 'Purchasing...' : 'Buy Pack'}
              </Button>
            </div>
          </Card>

          <Card className="p-5 bg-gradient-to-r from-amber-700/10 to-amber-900/10 border-border shadow-md">
            <div className="flex items-center gap-4">
              <div className="p-4 rounded-xl bg-gradient-to-br from-amber-700 to-amber-900 shadow-lg">
                <Crown className="h-9 w-9 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-lg tracking-tight">Director Pack</h3>
                <p className="text-sm text-muted-foreground">
                  Contains a random renowned director
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Coins className="h-4 w-4 text-amber-700" />
                  <span className="font-semibold">50 coins</span>
                </div>
              </div>
              <Button
                onClick={() => handlePurchase('director', 50)}
                disabled={coins < 50 || purchasing === 'director'}
                size="lg"
                className="bg-gradient-to-r from-amber-700 to-amber-900 hover:opacity-90 shrink-0 min-h-[48px] px-6"
              >
                {purchasing === 'director' ? 'Purchasing...' : 'Buy Pack'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Store;
