import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mafntxroeesyvwjybvjk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZm50eHJvZWVzeXZ3anlidmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjI2ODgsImV4cCI6MjA4Nzc5ODY4OH0.Nlzw_sbt10Esm4RECW9_Grr9O52NS7eAcYq4NnHDHrU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const cols = ['id', 'client_id', 'plan_id', 'barbershop_id', 'status', 'haircuts_used', 'shaves_used', 'valid_until', 'payment_method', 'price', 'created_at'];
    for (const col of cols) {
        const { error } = await supabase.from('subscriptions').select(col).limit(1);
        if (error) {
            console.log(`[X] ${col}: ${error.message}`);
        } else {
            console.log(`[O] ${col}: EXISTS`);
        }
    }
}

check();
