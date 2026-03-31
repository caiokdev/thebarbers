import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = 'https://mafntxroeesyvwjybvjk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZm50eHJvZWVzeXZ3anlidmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjI2ODgsImV4cCI6MjA4Nzc5ODY4OH0.Nlzw_sbt10Esm4RECW9_Grr9O52NS7eAcYq4NnHDHrU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function dump() {
    const { data: clients } = await supabase.from('clients').select('*');
    fs.writeFileSync('clients_full.json', JSON.stringify(clients, null, 2));
    
    const { data: plans } = await supabase.from('plans').select('*');
    fs.writeFileSync('plans_full.json', JSON.stringify(plans, null, 2));

    console.log('Dumped to clients_full.json and plans_full.json');
}

dump();
