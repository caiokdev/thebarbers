const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mafntxroeesyvwjybvjk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZm50eHJvZWVzeXZ3anlidmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjI2ODgsImV4cCI6MjA4Nzc5ODY4OH0.Nlzw_sbt10Esm4RECW9_Grr9O52NS7eAcYq4NnHDHrU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
  console.log('--- Verifying Professional Mapping ---');
  // 1. Get closed orders from current month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, professional_id, status, closed_at')
    .eq('status', 'closed')
    .gte('closed_at', startOfMonth);

  if (error) {
    console.error('Error fetching orders:', error);
    return;
  }

  const proIds = [...new Set(orders.map(o => o.professional_id).filter(Boolean))];
  console.log(`Found ${orders.length} closed orders this month with ${proIds.length} distinct professionals.`);

  const { data: pros, error: e2 } = await supabase
    .from('professionals')
    .select('id, name')
    .in('id', proIds);

  if (e2) {
    console.error('Error fetching professionals:', e2);
    return;
  }

  const proMap = {};
  (pros || []).forEach(p => proMap[p.id] = p.name);

  const missing = proIds.filter(id => !proMap[id]);
  if (missing.length > 0) {
    console.warn('CRITICAL: Professionals missing from "professionals" table:', missing);
  } else {
    console.log('SUCCESS: All professional IDs resolved in the "professionals" table.');
  }

  // Check if any matching IDs exist in profiles instead (which we should ignore/move)
  const { data: profileCheck } = await supabase.from('profiles').select('id, name').in('id', proIds);
  if (profileCheck?.length > 0) {
    console.log(`Note: ${profileCheck.length} IDs also found in 'profiles', but we are now correctly ignoring them for names.`);
  }
}

verify();
