const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf8');
const env = envFile.split('\n').reduce((acc, line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        acc[match[1]] = match[2].trim().replace(/^"|"$/g, '');
    }
    return acc;
}, {});

const supabaseUrl = env['VITE_SUPABASE_URL'];
const supabaseKey = env['VITE_SUPABASE_ANON_KEY'];
const supabase = createClient(supabaseUrl, supabaseKey);

async function fix() {
    console.log("Fetching subs...");
    const { data: subs, error: err1 } = await supabase.from('client_subscriptions').select('*');
    if (err1) console.error(err1);
    
    let updated = 0;
    for (const sub of subs) {
        if (sub.valid_until && sub.valid_until.includes('-05-')) {
            const newDate = sub.valid_until.replace('-05-', '-04-');
            console.log(`Updating ${sub.id} from ${sub.valid_until} to ${newDate}`);
            await supabase.from('client_subscriptions').update({ valid_until: newDate }).eq('id', sub.id);
            updated++;
        }
    }
    console.log(`Updated ${updated} subscriptions.`);

    console.log("Fetching client Jose Roberto...");
    const { data: clients, error: err2 } = await supabase.from('clients').select('*').ilike('name', '%Jose Roberto%');
    if (err2) console.error(err2);
    
    for (const c of clients) {
        console.log(`Fixing status for client ${c.id} (${c.name})`);
        await supabase.from('clients').update({ subscription_status: 'active' }).eq('id', c.id);
    }
    
    console.log("Done");
}

fix();
