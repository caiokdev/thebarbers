const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://mafntxroeesyvwjybvjk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZm50eHJvZWVzeXZ3anlidmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjI2ODgsImV4cCI6MjA4Nzc5ODY4OH0.Nlzw_sbt10Esm4RECW9_Grr9O52NS7eAcYq4NnHDHrU';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

(async function fix() {
    try {
        console.log("Fetching subscriptions...");
        const { data: subs, error: err1 } = await supabase.from('client_subscriptions').select('*');
        if (err1) throw err1;
        
        let updated = 0;
        for (const sub of subs) {
            if (sub.valid_until && sub.valid_until.includes('-05-')) {
                const newDate = sub.valid_until.replace('-05-', '-04-');
                console.log(`Updating ${sub.id} from ${sub.valid_until} to ${newDate}`);
                const { error: updErr } = await supabase.from('client_subscriptions').update({ valid_until: newDate }).eq('id', sub.id);
                if (updErr) throw updErr;
                updated++;
            }
        }
        console.log(`Updated ${updated} subscriptions.`);

        console.log("Fetching client Jose Roberto...");
        const { data: clients, error: err2 } = await supabase.from('clients').select('*').ilike('name', '%Jose Roberto%');
        if (err2) throw err2;
        
        for (const c of clients) {
            console.log(`Fixing status for client ${c.id} (${c.name})`);
            const { error: cliErr } = await supabase.from('clients').update({ subscription_status: 'active' }).eq('id', c.id);
            if (cliErr) throw cliErr;
        }
        
        console.log("All fixes applied successfully.");
    } catch (e) {
        console.error("Error during execution: ", e);
    }
})();
