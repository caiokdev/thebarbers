import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://mafntxroeesyvwjybvjk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZm50eHJvZWVzeXZ3anlidmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjI2ODgsImV4cCI6MjA4Nzc5ODY4OH0.Nlzw_sbt10Esm4RECW9_Grr9O52NS7eAcYq4NnHDHrU'
);

async function cleanup() {
  const cid = '0cca9c7b-5e7b-441d-9bc7-099720ae6979'; // caio

  // Get all records, keep only the FIRST one (oldest), delete the rest
  const { data: recs } = await supabase
    .from('client_subscriptions')
    .select('id, created_at')
    .eq('client_id', cid)
    .order('created_at', { ascending: true });

  if (!recs || recs.length <= 1) {
    console.log('No duplicates to clean');
    return;
  }

  const keepId = recs[0].id;
  const deleteIds = recs.slice(1).map(r => r.id);
  console.log(`Keeping: ${keepId}, Deleting ${deleteIds.length} duplicates`);

  for (const id of deleteIds) {
    const { error } = await supabase.from('client_subscriptions').delete().eq('id', id);
    if (error) console.error(`Failed to delete ${id}:`, error.message);
  }

  // Verify
  const { data: remaining } = await supabase.from('client_subscriptions').select('id').eq('client_id', cid);
  console.log(`Remaining records: ${remaining?.length}`);
}

cleanup();
