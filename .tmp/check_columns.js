const { createClient } = require('@supabase/supabase-client');
require('dotenv').config({ path: 'c:/Users/CAIO/Desktop/Antigravityy/thebarbers/.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    const { data, error } = await supabase
        .from('client_subscriptions')
        .select('*')
        .limit(1);
    
    if (error) {
        console.error('Error fetching:', error);
    } else {
        console.log('Sample row columns:', Object.keys(data[0] || {}));
    }
}

checkSchema();
