import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mafntxroeesyvwjybvjk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZm50eHJvZWVzeXZ3anlidmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjI2ODgsImV4cCI6MjA4Nzc5ODY4OH0.Nlzw_sbt10Esm4RECW9_Grr9O52NS7eAcYq4NnHDHrU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    try {
        console.log('--- BUSCANDO CLIENTES ASSINANTES ---');
        const { data: clients, error: err1 } = await supabase
            .from('clients')
            .select('id, name, is_subscriber, subscription_status')
            .eq('is_subscriber', true);
        
        if (err1) {
            console.error('Erro ao buscar clientes:', err1);
            return;
        }
        console.log('Clientes encontrados:', clients?.length || 0);

        for (const client of clients || []) {
            console.log(`\n--- ${client.name} (${client.id}) ---`);
            
            const { data: subData } = await supabase.from('subscriptions').select('*').eq('client_id', client.id);
            console.log(`[subscriptions]: Found ${subData?.length || 0} records`, subData);

            const { data: legacyData } = await supabase.from('client_subscriptions').select('*').eq('client_id', client.id);
            console.log(`[client_subscriptions]: Found ${legacyData?.length || 0} records`, legacyData);
        }
    } catch (err) {
        console.error('Script Failed:', err);
    }
}

debug();
