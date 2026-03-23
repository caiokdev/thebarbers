import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { celcoinToken, planValue, clientId, planName } = await req.json();

    if (!clientId) {
        throw new Error("Missing required field: clientId");
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceKey) {
      throw new Error("Server misconfigured: missing env vars (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)");
    }

    // Use service role directly - this is an admin/internal endpoint
    const supabase = createClient(supabaseUrl, serviceKey);

    // Simulate successful Celcoin response (replace with real API call later)
    const mockCelcoinSubscriptionId = "CEL_" + Math.random().toString(36).substr(2, 9).toUpperCase();

    // 1. Update client_subscriptions status
    const { error: subErr } = await supabase
      .from('client_subscriptions')
      .update({ status: 'active' })
      .eq('client_id', clientId);

    if (subErr) {
      console.warn("client_subscriptions update warning:", subErr.message);
    }

    // 2. Update client record
    const { error: clientErr } = await supabase
      .from('clients')
      .update({ is_subscriber: true, subscription_status: 'active' })
      .eq('id', clientId);

    if (clientErr) throw new Error("Failed to update client: " + clientErr.message);

    return new Response(JSON.stringify({ 
        success: true, 
        celcoinSubscriptionId: mockCelcoinSubscriptionId 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
    
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error in celcoin-subscription";
    console.error("Subscription Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
