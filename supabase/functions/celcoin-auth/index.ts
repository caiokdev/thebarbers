import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from '../_shared/cors.ts'

// Celcoin Auth API Endpoint
const CELCOIN_AUTH_URL = 'https://api.celcoin.com.br/v5/token';
// Use sandbox URL if needed: 'https://sandbox.celcoin.com.br/v5/token'

serve(async (req) => {
  // Handle CORS options request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const clientId = Deno.env.get('CELCOIN_CLIENT_ID');
    const clientSecret = Deno.env.get('CELCOIN_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new Error("Celcoin credentials missing from Server Environment.");
    }

    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'client_credentials',
      client_secret: clientSecret
    });

    const response = await fetch(CELCOIN_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString()
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(`Celcoin API Error: ${JSON.stringify(data)}`);
    }

    // We return the access_token back to our authenticated frontend/services
    // In a fully secure architecture, this edge function might also make the actual
    // purchase calls instead of returning the token, but for now we expose it securely
    return new Response(JSON.stringify({ access_token: data.access_token, expires_in: data.expires_in }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
