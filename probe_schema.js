import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mafntxroeesyvwjybvjk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZm50eHJvZWVzeXZ3anlidmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjI2ODgsImV4cCI6MjA4Nzc5ODY4OH0.Nlzw_sbt10Esm4RECW9_Grr9O52NS7eAcYq4NnHDHrU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function probe() {
    // 1. Get a real client_id and barbershop_id
    const { data: clients } = await supabase.from('clients').select('id, barbershop_id').limit(1);
    if (!clients || clients.length === 0) {
        console.log('No clients found to probe with.');
        return;
    }
    const { id: cid, barbershop_id: bid } = clients[0];

    // 2. Try to insert with minimal columns
    console.log('Probing insert...');
    const { data, error } = await supabase.from('subscriptions').insert({
        client_id: cid,
        barbershop_id: bid,
        plan_id: 'any-plan-id',
        status: 'active'
    }).select('*');

    if (error) {
        console.log('Probe Error:', JSON.stringify(error, null, 2));
    } else {
        console.log('Probe Success! Columns found:', Object.keys(data[0]));
    }
}

probe();
