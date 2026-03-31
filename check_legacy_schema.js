import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mafntxroeesyvwjybvjk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZm50eHJvZWVzeXZ3anlidmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjI2ODgsImV4cCI6MjA4Nzc5ODY4OH0.Nlzw_sbt10Esm4RECW9_Grr9O52NS7eAcYq4NnHDHrU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase.from('client_subscriptions').select('*').limit(1);
    if (data && data.length > 0) {
        console.log('CLIENT_SUBS_COLUMNS:', Object.keys(data[0]));
    } else {
        console.log('Client Subscriptions is empty or error:', error?.message);
    }
}

check();
