const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const content = fs.readFileSync('src/supabaseClient.js', 'utf8');
const lines = content.split('\n');
const supabaseUrlLine = lines.find(l => l.includes('const supabaseUrl ='));
const supabaseKeyLine = lines.find(l => l.includes('const supabaseKey ='));

const url = supabaseUrlLine.split("'")[1] || supabaseUrlLine.split('"')[1];
const key = supabaseKeyLine.split("'")[1] || supabaseKeyLine.split('"')[1];

const supabase = createClient(url, key);

async function check() {
    const { data: orders } = await supabase.from('orders').select('professional_id').neq('professional_id', null).limit(20);
    console.log('Orders pro ids:', [...new Set(orders.map(o => o.professional_id))]);

    if (orders && orders.length > 0) {
        const id = orders[0].professional_id;
        console.log('Checking ID:', id);

        const { data: pros1 } = await supabase.from('professionals').select('id, name').eq('id', id);
        console.log('Professionals match:', pros1);

        const { data: pros2 } = await supabase.from('profiles').select('id, name').eq('id', id);
        console.log('Profiles match:', pros2);
    }
}
check();
