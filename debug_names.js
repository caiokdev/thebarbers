import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
    const { data: orders, error: err1 } = await supabase.from('orders').select('*').limit(3);
    console.log("ORDERS:", JSON.stringify(orders, null, 2));

    const { data: profs, error: err2 } = await supabase.from('profiles').select('*').eq('role', 'barber').limit(3);
    console.log("PROFILES:", JSON.stringify(profs, null, 2));
}

run();
