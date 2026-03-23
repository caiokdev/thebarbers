const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://mafntxroeesyvwjybvjk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZm50eHJvZWVzeXZ3anlidmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjI2ODgsImV4cCI6MjA4Nzc5ODY4OH0.Nlzw_sbt10Esm4RECW9_Grr9O52NS7eAcYq4NnHDHrU';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testQuery(rel) {
  const { data, error } = await supabase.from('orders').select('id, ' + rel).limit(1);
  return { rel, res: error ? error.message : 'SUCCESS', data: data ? data[0] : null };
}

async function run() {
  const r1 = await testQuery('profiles(name)');
  const r2 = await testQuery('profiles!professional_id(name)');
  const r3 = await testQuery('profiles!orders_professional_id_fkey(name)');
  const r4 = await testQuery('professionals(name)');
  console.log(JSON.stringify([r1, r2, r3, r4], null, 2));
}
run();
