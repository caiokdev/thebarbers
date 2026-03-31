import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mafntxroeesyvwjybvjk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZm50eHJvZWVzeXZ3anlidmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjI2ODgsImV4cCI6MjA4Nzc5ODY4OH0.Nlzw_sbt10Esm4RECW9_Grr9O52NS7eAcYq4NnHDHrU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    // Try to get one row to see columns
    const { data, error } = await supabase.from('subscriptions').select('*').limit(1);
    if (data && data.length > 0) {
        console.log('Subscriptions columns:', Object.keys(data[0]));
    } else {
        // If empty, try to get column names via PostgREST error or something?
        // Actually, let's try to query a known column to see if it exists.
        const cols = ['id', 'client_id', 'plan_id', 'haircuts_used', 'shaves_used', 'valid_until', 'status', 'barbershop_id'];
        for (const col of cols) {
            const { error: e } = await supabase.from('subscriptions').select(col).limit(1);
            console.log(`Column [${col}]: ${e ? 'Error ' + e.code : 'Exists'}`);
        }
    }
}

checkSchema();
