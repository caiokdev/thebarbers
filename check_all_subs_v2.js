import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mafntxroeesyvwjybvjk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZm50eHJvZWVzeXZ3anlidmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjI2ODgsImV4cCI6MjA4Nzc5ODY4OH0.Nlzw_sbt10Esm4RECW9_Grr9O52NS7eAcYq4NnHDHrU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAll() {
    const bids = ['2eb21641-a4e8-4669-b7ed-724a68918a79'];
    for (const bid of bids) {
        console.log(`--- Checking for BID: ${bid} ---`);
        const { data: subs, error: e1 } = await supabase.from('subscriptions').select('*').eq('barbershop_id', bid);
        console.log('Subscriptions:', subs || e1);

        const { data: legacy, error: e2 } = await supabase.from('client_subscriptions').select('*').eq('barbershop_id', bid);
        console.log('Legacy:', legacy || e2);
    }
    
    // Also try without BID filter but searching for caio's ID specifically
    const caioId = '0cca9c7b-5e7b-441d-9bc7-099720ae6979';
    console.log('\n--- Searching for Caio specifically ---');
    const { data: s1 } = await supabase.from('subscriptions').select('*').eq('client_id', caioId);
    console.log('s1:', s1);
    const { data: l1 } = await supabase.from('client_subscriptions').select('*').eq('client_id', caioId);
    console.log('l1:', l1);
}

checkAll();
