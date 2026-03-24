
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function getAdmin() {
    const { data, error } = await supabase
        .from('profiles')
        .select('email, name')
        .eq('role', 'admin')
        .limit(1)
        .single();
    
    if (error) {
        console.error('Error fetching admin:', error.message);
        return;
    }
    
    console.log('Admin Email:', data.email);
    console.log('Admin Name:', data.name);
}

getAdmin();
