import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://mafntxroeesyvwjybvjk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZm50eHJvZWVzeXZ3anlidmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjI2ODgsImV4cCI6MjA4Nzc5ODY4OH0.Nlzw_sbt10Esm4RECW9_Grr9O52NS7eAcYq4NnHDHrU'
);

async function check() {
  // 1. Check client_subscriptions columns
  const { data: cs1 } = await supabase.from('client_subscriptions').select('*').limit(1);
  console.log('=== client_subscriptions COLUMNS ===');
  console.log(cs1?.length ? Object.keys(cs1[0]) : 'EMPTY TABLE');

  // 2. Check subscriptions columns
  const { data: s1 } = await supabase.from('subscriptions').select('*').limit(1);
  console.log('\n=== subscriptions COLUMNS ===');
  console.log(s1?.length ? Object.keys(s1[0]) : 'EMPTY TABLE');

  // 3. All records for caio
  const { data: clients } = await supabase.from('clients').select('id, name, is_subscriber, subscription_status').eq('name', 'caio');
  console.log('\n=== caio client record ===');
  console.log(JSON.stringify(clients, null, 2));

  if (clients?.length) {
    const cid = clients[0].id;
    
    const { data: csRecs } = await supabase.from('client_subscriptions').select('*').eq('client_id', cid);
    console.log('\n=== caio client_subscriptions ===');
    console.log(JSON.stringify(csRecs, null, 2));

    const { data: sRecs } = await supabase.from('subscriptions').select('*').eq('client_id', cid);
    console.log('\n=== caio subscriptions ===');
    console.log(JSON.stringify(sRecs, null, 2));
  }

  // 4. Check ALL subscribers
  const { data: allSubs } = await supabase.from('clients').select('id, name').eq('is_subscriber', true);
  console.log('\n=== ALL subscribers ===');
  console.log(JSON.stringify(allSubs?.map(s => s.name), null, 2));
  
  // 5. Check all client_subscriptions
  const { data: allCS } = await supabase.from('client_subscriptions').select('client_id, plan_id, status');
  console.log('\n=== ALL client_subscriptions ===');
  console.log(JSON.stringify(allCS, null, 2));
}

check();
