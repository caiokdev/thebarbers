import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// This endpoint receives webhooks from Celcoin
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json();
    
    // We only care about Recurrent Payment Success logic
    // Celcoin Webhook docs define specific Status types. We look for 'AUTHORIZED' or similar.
    // Example: payload.Type === "Payment", payload.Status === "Authorized" 
    // And to link back to our DB, we need the subscription_id or plan identifier.
    
    const eventType = payload.eventName || payload.type; // Check celcoin exact docs for webhook schema
    const status = payload.status || payload.state;
    const celcoinSubscriptionId = payload.subscriptionId || payload.merchantOrderId;

    if (!celcoinSubscriptionId) {
       return new Response("No target ID found in webhook", { status: 200 })
    }

    // Only process successes (Usually STATUS = AUTHORIZED or SUCCESS)
    if (status === 'AUTHORIZED' || status === 'SUCCESS' || status === 'PAID') {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!; // Need SERVICE ROLE to bypass RLS
        const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

        // 1. Find the client_subscription with this Celcoin Subscription ID
        const { data: sub, error: subErr } = await supabase
            .from('client_subscriptions')
            .select('*')
            .eq('celcoin_subscription_id', celcoinSubscriptionId) // NOTE: NEED TO ADD THIS COLUMN TO DB
            .single();

        if (subErr || !sub) {
            console.error("Subscription not found for ID:", celcoinSubscriptionId);
            return new Response("Subscription not found in our DB", { status: 200 })
        }

        const now = new Date();
        const newValidUntil = new Date(now.setDate(now.getDate() + 30)).toISOString();

        // 2. Reset usages and set new valid_until date
        await supabase
            .from('client_subscriptions')
            .update({
                haircuts_used: 0,
                shaves_used: 0,
                valid_until: newValidUntil,
                status: 'active'
            })
            .eq('id', sub.id);

        // 3. Mark client as active
        await supabase
            .from('clients')
            .update({ subscription_status: 'active' })
            .eq('id', sub.client_id);
            
        console.log(`Successfully renewed subscription for client_id: ${sub.client_id}`);
    } else if (status === 'FAILED' || status === 'DECLINED') {
        // If it failed, maybe we suspend them
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

        const { data: sub } = await supabase.from('client_subscriptions').select('*').eq('celcoin_subscription_id', celcoinSubscriptionId).single();
        if (sub) {
            await supabase.from('client_subscriptions').update({ status: 'overdue' }).eq('id', sub.id);
            await supabase.from('clients').update({ subscription_status: 'overdue' }).eq('id', sub.client_id);
        }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error("Webhook Error:", error);
    // Usually webhooks expect 200 even on logical errors, otherwise they retry endlessly
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})
