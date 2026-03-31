import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mafntxroeesyvwjybvjk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZm50eHJvZWVzeXZ3anlidmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjI2ODgsImV4cCI6MjA4Nzc5ODY4OH0.Nlzw_sbt10Esm4RECW9_Grr9O52NS7eAcYq4NnHDHrU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    // Attempt to insert a dummy row and catch the error which often lists expected columns
    const { error } = await supabase.from('subscriptions').insert({ dummy_col: 'test' });
    console.log('Insert Error (should list columns if it failed due to schema):');
    console.log(error);

    // Also try to dynamic select
    const { data, error: e2 } = await supabase.rpc('get_table_columns', { table_name: 'subscriptions' }); // if RPC exists
    if (!e2) console.log('RPC columns:', data);
    
    // Last resort: query one row and check keys
    const { data: rows } = await supabase.from('subscriptions').select('*').limit(1);
    if (rows && rows.length > 0) {
        console.log('Real Columns:', Object.keys(rows[0]));
    } else {
        console.log('Table is empty, cannot use select(*) keys.');
    }
}

check();
