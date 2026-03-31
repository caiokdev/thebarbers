import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mafntxroeesyvwjybvjk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZm50eHJvZWVzeXZ3anlidmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjI2ODgsImV4cCI6MjA4Nzc5ODY4OH0.Nlzw_sbt10Esm4RECW9_Grr9O52NS7eAcYq4NnHDHrU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function probe() {
    const { data: clients } = await supabase.from('clients').select('id, barbershop_id').limit(1);
    const { data: plans } = await supabase.from('plans').select('id').limit(1);
    
    if (!clients || clients.length === 0 || !plans || plans.length === 0) {
        console.log('Missing data.');
        return;
    }
    const cid = clients[0].id;
    const bid = clients[0].barbershop_id;
    const pid = plans[0].id;

    console.log('Probing v4...');
    const { data, error } = await supabase.from('subscriptions').insert({
        client_id: cid,
        barbershop_id: bid,
        plan_id: pid,
        status: 'active',
        payment_method: 'PIX'
    }).select('*');

    if (error) {
        console.log('Probe Error V4:', JSON.stringify(error, null, 2));
    } else {
        console.log('SUCCESS V4! COLUMNS:', Object.keys(data[0]));
        await supabase.from('subscriptions').delete().eq('id', data[0].id);
    }
}

probe();
