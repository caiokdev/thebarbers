const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('professionals').select('*').limit(5);
  if (error) {
    console.error('Error fetching professionals:', error);
  } else {
    console.log('Professionals samples:', data);
  }

  const { data: profiles, error: err2 } = await supabase.from('profiles').select('*').eq('role', 'barber').limit(5);
  if (err2) {
    console.error('Error fetching profiles:', err2);
  } else {
    console.log('Barber profiles samples:', profiles);
  }
}

check();
