const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'c:/Users/CAIO/Desktop/Antigravityy/thebarbers/.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function getSummary() {
    const { data: bs } = await supabase.from('barber_shops').select('id').limit(1);
    const realBId = bs[0].id;
    console.log('Shop ID:', realBId);

    // Call RPC exactly like the frontend at 01:38 AM
    const { data, error } = await supabase.rpc('get_dashboard_summary', {
        p_b_id: realBId,
        p_start_month: '2026-03-01T03:00:00.000Z',
        p_end_month: '2026-04-01T02:59:59.999Z',
        p_start_today: '2026-03-26T03:00:00.000Z',
        p_end_today: '2026-03-27T02:59:59.999Z',
        p_date_today: '2026-03-26'
    });

    console.log('RPC Result:', JSON.stringify(data, null, 2));

    const { data: raw } = await supabase.from('orders').select('id, total_amount, closed_at, scheduled_at').eq('barbershop_id', realBId).order('closed_at', { ascending: false }).limit(5);
    console.log('Recent orders:', JSON.stringify(raw, null, 2));
}

getSummary();
