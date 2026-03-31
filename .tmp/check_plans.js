import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkPlans() {
  const { data, error } = await supabase.from('plans').select('*');
  if (error) {
    console.error("Error fetching plans:", error);
  } else {
    console.log("Current plans:", JSON.stringify(data, null, 2));
  }
}

checkPlans();
