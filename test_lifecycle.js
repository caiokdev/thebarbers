import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://mafntxroeesyvwjybvjk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZm50eHJvZWVzeXZ3anlidmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjI2ODgsImV4cCI6MjA4Nzc5ODY4OH0.Nlzw_sbt10Esm4RECW9_Grr9O52NS7eAcYq4NnHDHrU'
);

const CAIO_ID = '0cca9c7b-5e7b-441d-9bc7-099720ae6979';

async function test() {
  console.log('=== STEP 1: Current state ===');
  const { data: recs, error: e1 } = await supabase.from('client_subscriptions').select('id, plan_id, status').eq('client_id', CAIO_ID);
  console.log('Records:', recs?.length, 'Error:', e1?.message || 'none');
  if (recs) recs.forEach(r => console.log(' -', r.id, r.status, r.plan_id));

  console.log('\n=== STEP 2: Simulate cancel (delete all) ===');
  const { error: e2 } = await supabase.from('client_subscriptions').delete().eq('client_id', CAIO_ID);
  console.log('Delete error:', e2?.message || 'none');

  console.log('\n=== STEP 3: Verify deleted ===');
  const { data: r2 } = await supabase.from('client_subscriptions').select('id').eq('client_id', CAIO_ID);
  console.log('Records after delete:', r2?.length);

  console.log('\n=== STEP 4: Simulate re-subscribe (insert) ===');
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 30);
  const { data: inserted, error: e3 } = await supabase.from('client_subscriptions').insert({
    client_id: CAIO_ID,
    plan_id: 'af2e3f26-878b-4e8f-858a-4cc466e6d69f', // Plano Corte Ilimitado
    status: 'active',
    haircuts_used: 0,
    shaves_used: 0,
    valid_until: validUntil.toISOString(),
    payment_method: 'PIX'
  }).select().single();
  console.log('Insert result:', inserted ? 'OK' : 'FAILED');
  console.log('Insert error:', e3?.message || 'none');
  if (e3) console.log('Full error:', JSON.stringify(e3));

  console.log('\n=== STEP 5: Query back with limit(1) ===');
  const { data: r3, error: e4 } = await supabase
    .from('client_subscriptions')
    .select('*, plans(name, haircut_limit, shave_limit, allowed_days)')
    .eq('client_id', CAIO_ID)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1);
  console.log('Query result:', r3?.length, 'Error:', e4?.message || 'none');
  if (r3?.[0]) console.log('Record:', JSON.stringify(r3[0], null, 2));

  console.log('\n=== STEP 6: Check client flags ===');
  const { data: client } = await supabase.from('clients').select('is_subscriber, subscription_status').eq('id', CAIO_ID).single();
  console.log('Client:', JSON.stringify(client));
}

test();
