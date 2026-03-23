const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://mafntxroeesyvwjybvjk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZm50eHJvZWVzeXZ3anlidmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjI2ODgsImV4cCI6MjA4Nzc5ODY4OH0.Nlzw_sbt10Esm4RECW9_Grr9O52NS7eAcYq4NnHDHrU';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const localDateFunc = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function run() {
    // Need to get the barbershop ID first
    const { data: shop } = await supabase.from('barbershops').select('id').limit(1).single();
    
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    
    console.log("Input:", {
        bId: shop.id,
        p_start_month: startOfMonth.toISOString(),
        p_end_month: endOfMonth.toISOString(),
        p_start_today: startOfDay.toISOString(),
        p_end_today: endOfDay.toISOString(),
        p_date_today: localDateFunc(today)
    });

    const { data: summaryData, error: summaryErr } = await supabase.rpc('get_dashboard_summary', {
        p_b_id: shop.id,
        p_start_month: startOfMonth.toISOString(),
        p_end_month: endOfMonth.toISOString(),
        p_start_today: startOfDay.toISOString(),
        p_end_today: endOfDay.toISOString(),
        p_date_today: localDateFunc(today)
    });
    
    fs.writeFileSync('.tmp/test_rpc.json', JSON.stringify({ summaryData, summaryErr }, null, 2));
}
run();
