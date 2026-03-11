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
    const { data, error } = await supabase.from('clients').select('*').limit(1);
    if (error) console.error('Error:', error);
    if (data && data.length > 0) {
        console.log('Columns:', Object.keys(data[0]));
    } else {
        console.log('No data or empty table');
    }
}
check();
