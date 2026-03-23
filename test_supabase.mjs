import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Fetching client_subscriptions...");
    const { data: subs, error: subsErr } = await supabase.from('client_subscriptions').select('*').limit(1);
    if (subsErr) {
        console.error("Error fetching client_subscriptions:", subsErr);
    } else {
        console.log("Client Subscriptions sample:", subs);
    }

    console.log("Fetching clients with is_subscriber=true...");
    const { data: clients, error: clientsErr } = await supabase.from('clients').select('id, name, barbershop_id, subscription_status').eq('is_subscriber', true);
    console.log("Clients:", clients, clientsErr);

    console.log("Fetching plans...");
    const { data: plans, error: plansErr } = await supabase.from('plans').select('*');
    console.log("Plans:", plans, plansErr);
}

run();
