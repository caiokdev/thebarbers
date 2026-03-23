const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://mafntxroeesyvwjybvjk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZm50eHJvZWVzeXZ3anlidmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjI2ODgsImV4cCI6MjA4Nzc5ODY4OH0.Nlzw_sbt10Esm4RECW9_Grr9O52NS7eAcYq4NnHDHrU';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
    
    // Test exact dashboard query logic
    const { data: raw, error } = await supabase
                    .from('orders')
                    .select('id, status, scheduled_at, created_at')
                    .gte('scheduled_at', startOfMonth.toISOString())
                    .lte('scheduled_at', endOfMonth.toISOString());
                    
    const { data: all, error: err2 } = await supabase
                    .from('orders')
                    .select('id, status, scheduled_at, created_at')
                    .limit(5);

    fs.writeFileSync('.tmp/test_dates_out.json', JSON.stringify({ 
        filterCount: raw ? raw.length : null, 
        err: error ? error : null,
        firstFiltered: raw && raw.length > 0 ? raw[0] : null,
        firstAll: all && all.length > 0 ? all[0] : null
    }, null, 2));
}
run();
