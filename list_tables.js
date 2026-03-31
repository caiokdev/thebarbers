import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mafntxroeesyvwjybvjk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZm50eHJvZWVzeXZ3anlidmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjI2ODgsImV4cCI6MjA4Nzc5ODY4OH0.Nlzw_sbt10Esm4RECW9_Grr9O52NS7eAcYq4NnHDHrU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function listTables() {
    // There is no direct "list tables" in PostgREST but we can try to query common tables or use an RPC if it exists.
    // Or we can check the error message of a non-existent table to see if it lists others? No.
    // Actually, I'll try to query information_schema if RLS allows (unlikely for anon).
    
    // Let's try to query a few likely ones or check the files for table names.
    console.log('--- Checking for tables ---');
    const tables = ['subscriptions', 'client_subscriptions', 'plans', 'clients', 'appointments', 'orders'];
    for (const t of tables) {
        const { error } = await supabase.from(t).select('id').limit(1);
        console.log(`Table [${t}]: ${error ? 'Error ' + error.code : 'Exists'}`);
    }
}

listTables();
