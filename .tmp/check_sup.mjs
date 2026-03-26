import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'c:/Users/CAIO/Desktop/Antigravityy/thebarbers/.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  const { data } = await supabase.from('orders').select('closed_at, scheduled_at').order('created_at', { ascending: false }).limit(2);
  console.log('Result:', JSON.stringify(data, null, 2));
}
check();
