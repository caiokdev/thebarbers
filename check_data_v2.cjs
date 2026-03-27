const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mafntxroeesyvwjybvjk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZm50eHJvZWVzeXZ3anlidmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjI2ODgsImV4cCI6MjA4Nzc5ODY4OH0.Nlzw_sbt10Esm4RECW9_Grr9O52NS7eAcYq4NnHDHrU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  try {
    const { data: pros, error: e1 } = await supabase.from('professionals').select('id, name').limit(10);
    console.log('--- Professionals ---');
    if (e1) console.error(e1); else console.log(pros);

    const { data: profs, error: e2 } = await supabase.from('profiles').select('id, name, role').eq('role', 'barber').limit(10);
    console.log('--- Barber Profiles ---');
    if (e2) console.error(e2); else console.log(profs);

    const { data: orders, error: e3 } = await supabase.from('orders').select('professional_id').limit(10);
    console.log('--- Order Pro IDs ---');
    if (e3) console.error(e3); else console.log(orders);
  } catch (err) {
    console.error(err);
  }
}

check();
