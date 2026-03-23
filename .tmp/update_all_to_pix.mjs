import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mafntxroeesyvwjybvjk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZm50eHJvZWVzeXZ3anlidmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjI2ODgsImV4cCI6MjA4Nzc5ODY4OH0.Nlzw_sbt10Esm4RECW9_Grr9O52NS7eAcYq4NnHDHrU';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function updateAllToPix() {
    console.log('Updating all subscriptions to PIX...');
    const { data, error } = await supabase
        .from('client_subscriptions')
        .update({ payment_method: 'PIX' })
        .not('id', 'is', null); // update all rows
    
    if (error) {
        console.error('Error updating:', error);
    } else {
        console.log('Update successful!');
    }
}

updateAllToPix();
