import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-11-20.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

serve(async (req) => {
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return new Response(JSON.stringify({ error: 'No signature' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.text();
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    // Handle both payment_intent.succeeded and checkout.session.completed
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const userId = paymentIntent.metadata?.user_id;
      const coinAmount = parseInt(paymentIntent.metadata?.coin_amount || '0', 10);

      if (!userId || !coinAmount) {
        console.error('Missing metadata in payment intent:', paymentIntent.id);
        return new Response(JSON.stringify({ error: 'Missing metadata' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Create Supabase admin client
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      // Get current coins
      const { data: stats, error: statsError } = await supabaseAdmin
        .from('user_stats')
        .select('coins')
        .eq('user_id', userId)
        .single();

      if (statsError && statsError.code !== 'PGRST116') {
        console.error('Error fetching stats:', statsError);
        return new Response(JSON.stringify({ error: 'Failed to fetch stats' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const currentCoins = stats?.coins || 0;
      const newCoins = currentCoins + coinAmount;

      // Update user stats
      const { error: updateError } = await supabaseAdmin
        .from('user_stats')
        .upsert({
          user_id: userId,
          coins: newCoins,
        }, {
          onConflict: 'user_id',
        });

      if (updateError) {
        console.error('Error updating coins:', updateError);
        return new Response(JSON.stringify({ error: 'Failed to update coins' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      console.log(`Added ${coinAmount} coins to user ${userId}. New total: ${newCoins}`);
    } else if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id;
      const coinAmount = parseInt(session.metadata?.coin_amount || '0', 10);

      if (!userId || !coinAmount) {
        console.error('Missing metadata in checkout session:', session.id);
        return new Response(JSON.stringify({ error: 'Missing metadata' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Create Supabase admin client
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      // Get current coins
      const { data: stats, error: statsError } = await supabaseAdmin
        .from('user_stats')
        .select('coins')
        .eq('user_id', userId)
        .single();

      if (statsError && statsError.code !== 'PGRST116') {
        console.error('Error fetching stats:', statsError);
        return new Response(JSON.stringify({ error: 'Failed to fetch stats' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const currentCoins = stats?.coins || 0;
      const newCoins = currentCoins + coinAmount;

      // Update user stats
      const { error: updateError } = await supabaseAdmin
        .from('user_stats')
        .upsert({
          user_id: userId,
          coins: newCoins,
        }, {
          onConflict: 'user_id',
        });

      if (updateError) {
        console.error('Error updating coins:', updateError);
        return new Response(JSON.stringify({ error: 'Failed to update coins' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      console.log(`Added ${coinAmount} coins to user ${userId}. New total: ${newCoins}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

