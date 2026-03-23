const { createClient } = require('@supabase/supabase-client');
require('dotenv').config({ path: 'c:/Users/CAIO/Desktop/Antigravityy/thebarbers/.env' });

// Using URL and Key from src/supabaseClient.js if .env is missing
const SUPABASE_URL = 'https://mafntxroeesyvwjybvjk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // Need service role for mass update if RLS is on

// If I don't have service role, I'll try with ANON but it might fail or only update own.
// But this is the user's local env, maybe they have it.
// Actually, I can just use a simple edge function call or try updating via the anon client if RLS allows.
// Let's try to update all client_subscriptions to pix.

const supabase = createClient(SUPABASE_URL, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZm50eHJvZWVzeXZ3anlidmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjI2ODgsImV4cCI6MjA4Nzc5ODY4OH0.Nlzw_sbt10Esm4RECW9_Grr9O52NS7eAcYq4NnHDHrU');

async function updateAllToPix() {
    console.log('Updating all subscriptions to PIX...');
    const { data, error } = await supabase
        .from('client_subscriptions')
        .update({ payment_method: 'PIX' })
        .neq('id', '00000000-0000-0000-0000-000000000000'); // hack to update all rows
    
    if (error) {
        console.error('Error updating:', error);
    } else {
        console.log('Update successful!');
    }
}

updateAllToPix();
