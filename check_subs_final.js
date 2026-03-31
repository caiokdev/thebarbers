import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mafntxroeesyvwjybvjk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZm50eHJvZWVzeXZ3anlidmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjI2ODgsImV4cCI6MjA4Nzc5ODY4OH0.Nlzw_sbt10Esm4RECW9_Grr9O52NS7eAcYq4NnHDHrU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { error } = await supabase.from('subscriptions').select('valid_until').limit(1);
    if (error) {
        console.log('Error selecting valid_until:', error.message);
    } else {
        console.log('valid_until exists');
    }

    const { error: e2 } = await supabase.from('subscriptions').select('expires_at').limit(1);
    if (e2) {
        console.log('Error selecting expires_at:', e2.message);
    } else {
        console.log('expires_at exists');
    }
}

check();
