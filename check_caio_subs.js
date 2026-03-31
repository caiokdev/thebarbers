import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mafntxroeesyvwjybvjk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZm50eHJvZWVzeXZ3anlidmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjI2ODgsImV4cCI6MjA4Nzc5ODY4OH0.Nlzw_sbt10Esm4RECW9_Grr9O52NS7eAcYq4NnHDHrU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data: clients } = await supabase.from('clients').select('*').eq('name', 'caio');
    if (!clients || clients.length === 0) return;
    const cid = clients[0].id;
    console.log('Client ID:', cid);

    const { data: subs } = await supabase.from('subscriptions').select('*').eq('client_id', cid);
    console.log('Subscriptions:', subs);

    const { data: legacy } = await supabase.from('client_subscriptions').select('*').eq('client_id', cid);
    console.log('Legacy Subs:', legacy);
}

check();
