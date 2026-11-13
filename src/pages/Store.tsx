import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Sparkles, Clapperboard, Coins, MessageSquareQuote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Store = ({ onBalance }: { onBalance: (coins: number) => void }) => {
  const [section, setSection] = useState<"Packs" | "Extras" | "Coins">("Packs");
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
      setSearchParams({ tab: "play", view: "store" }, { replace: true });
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
        variant: "success",
        title: "Coins added",
        description: `${data.coinsAdded} coins added to your account!`,
      });
      
      setCoins(data.newBalance); onBalance(data.newBalance);
      setSearchParams({ tab: "play", view: "store" }, { replace: true });
    } catch (error: any) {
      console.error('Error verifying payment:', error);
      toast({
        title: "Verification failed",
        description: "Payment succeeded but coins may take a moment to appear. Please refresh if needed.",
        variant: "destructive"
      });
      setSearchParams({ tab: "play", view: "store" }, { replace: true });
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

      setCoins(coins - cost); onBalance(coins - cost);
      
      const tierLabel = packTier === 'premium' ? 'Premium' : 'Standard';
      toast({
        variant: "success",
        title: "Pack added to your collection",
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

      setCoins(coins - cost); onBalance(coins - cost);
      
      toast({
        variant: "success",
        title: "Extra question added",
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

  const busy = purchasing !== null || processingPayment !== null;
  return <div>
    <header className="play-subhead"><p className="arcade-kicker"><i /> Card counter</p><h1>The store</h1><p className="play-muted">Spend your game coins on packs and extras.</p></header>
    <div className="play-segments" role="group" aria-label="Store category">{(["Packs","Extras","Coins"] as const).map(key => <button key={key} onClick={() => setSection(key)} aria-pressed={section === key}>{key}</button>)}</div>
    {isLoading ? <p role="status" className="play-muted">Loading store…</p> : <section className="play-shop-list" aria-label={section}>
      {section === "Packs" && (["actor","director"] as const).map(type => <div key={type} className="pack-list mb-3">
        <h2 className="play-section-title">{type === "actor" ? "Actor packs" : "Director packs"}</h2>
        {(["standard","premium"] as const).map(level => {
          const cost = level === "standard" ? 50 : 150;
          const Icon = type === "actor" ? Sparkles : Clapperboard;
          return <div key={level} className="play-panel shop-item"><Icon/><div><h3>{level === "standard" ? "Standard" : "Premium"}</h3>
            <p>{level === "standard" ? `One random ${type} card.` : "Better odds of a rare card."}</p>
            {coins < cost && <p>Need {cost - coins} more coins</p>}</div>
            <button className="play-action" disabled={busy || coins < cost} onClick={() => handlePurchase(type,level,cost)} aria-label={`Buy ${level} ${type} pack for ${cost} coins`}><Coins/>{purchasing === type+"-"+level ? "Buying…" : `Buy · ${cost}`}</button>
          </div>;
        })}
      </div>)}
      {section === "Extras" && <><h2 className="play-section-title">Companion extras</h2><div className="play-panel shop-item"><MessageSquareQuote/><div><h3>Extra question</h3><p>One more spoiler-free question.</p>{coins < 150 && <p>Need {150 - coins} more coins</p>}</div>
        <button className="play-action" disabled={busy || coins < 150} onClick={handlePurchaseQuestion} aria-label="Buy an extra question for 150 coins"><Coins/>{purchasing === "question" ? "Buying…" : "Buy · 150"}</button></div></>}
      {section === "Coins" && <><h2 className="play-section-title">Buy coins</h2><p className="play-muted">These bundles cost real money. Prices are in US dollars.</p>
        {([[150,"$1.49"],[750,"$6.99"],[2000,"$12.99"]] as const).map(([amount,price]) => <div className="play-panel shop-item" key={amount}><Coins/><div><h3>{amount.toLocaleString()} coins</h3></div>
          <button className="play-action" disabled={busy} onClick={() => handleBuyCoins(amount)} aria-label={`Buy ${amount} coins for ${price} USD`}>{processingPayment === amount ? "Opening…" : price}</button></div>)}</>}
    </section>}
  </div>;
};
export default Store;
