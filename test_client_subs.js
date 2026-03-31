import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mafntxroeesyvwjybvjk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZm50eHJvZWVzeXZ3anlidmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjI2ODgsImV4cCI6MjA4Nzc5ODY4OH0.Nlzw_sbt10Esm4RECW9_Grr9O52NS7eAcYq4NnHDHrU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    const { data: clients } = await supabase.from('clients').select('id, barbershop_id').limit(1);
    const { data: plans } = await supabase.from('plans').select('id').limit(1);
    
    if (!clients || clients.length === 0 || !plans || plans.length === 0) return;
    
    const cid = clients[0].id;
    const bid = clients[0].barbershop_id;
    const pid = plans[0].id;

    console.log('Testing insert into client_subscriptions...');
    const { data, error } = await supabase.from('client_subscriptions').insert({
        client_id: cid,
        plan_id: pid,
        status: 'active',
        haircuts_used: 0,
        shaves_used: 0,
        valid_until: new Date().toISOString()
    }).select('*');

    if (error) {
        console.log('Error:', error.message);
    } else {
        console.log('Success! ID:', data[0].id);
        await supabase.from('client_subscriptions').delete().eq('id', data[0].id);
    }
}

test();
