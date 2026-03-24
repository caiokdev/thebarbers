import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mafntxroeesyvwjybvjk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZm50eHJvZWVzeXZ3anlidmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjI2ODgsImV4cCI6MjA4Nzc5ODY4OH0.Nlzw_sbt10Esm4RECW9_Grr9O52NS7eAcYq4NnHDHrU';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkOrders() {
    const today = new Date('2026-03-24T00:01:10-03:00'); // Simulated today from metadata
    
    // Fetch all orders for the month to be sure
    const startOfMonth = new Date(2026, 2, 1, 0, 0, 0, 0).toISOString();
    const endOfMonth = new Date(2026, 3, 0, 23, 59, 59, 999).toISOString();

    const { data: shop } = await supabase
        .from('barbershops')
        .select('id')
        .limit(1)
        .single();

    const { data: orders, error } = await supabase
        .from('orders')
        .select('id, status, scheduled_at, clients(name)')
        .eq('barbershop_id', shop.id)
        .gte('scheduled_at', startOfMonth)
        .lte('scheduled_at', endOfMonth);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(`System Time: ${today.toISOString()} (${today.toLocaleString('pt-BR')})`);
    
    orders.forEach(o => {
        const schedTime = new Date(o.scheduled_at);
        const isHoje = schedTime.toLocaleDateString('pt-BR') === today.toLocaleDateString('pt-BR');
        const isFuture = schedTime.getTime() > today.getTime();
        
        if (isHoje) {
            console.log(`[HOJE] ID: ${o.id.substring(0,8)} | Status: ${o.status} | Scheduled: ${o.scheduled_at} | Local: ${schedTime.toLocaleString('pt-BR')} | Future: ${isFuture}`);
        } else {
             // console.log(`[OUTRO] ID: ${o.id.substring(0,8)} | Status: ${o.status} | Scheduled: ${o.scheduled_at} | Local: ${schedTime.toLocaleString('pt-BR')}`);
        }
    });
}

checkOrders();
