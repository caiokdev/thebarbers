const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://mafntxroeesyvwjybvjk.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZm50eHJvZWVzeXZ3anlidmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjI2ODgsImV4cCI6MjA4Nzc5ODY4OH0.Nlzw_sbt10Esm4RECW9_Grr9O52NS7eAcYq4NnHDHrU');
supabase.from('orders').select('id, status, scheduled_at').eq('status', 'open').then(r => console.log('Open comandas:', r.data));
