const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envStr = fs.readFileSync('../.env', 'utf8');
let supabaseUrl = '';
let supabaseKey = '';
envStr.split('\n').forEach(line => {
    if (line.startsWith('VITE_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim().replace(/^"|"$/g, '');
    if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) supabaseKey = line.split('=')[1].trim().replace(/^"|"$/g, '');
});

const supabase = createClient(supabaseUrl, supabaseKey);

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
