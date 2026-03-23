import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mafntxroeesyvwjybvjk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZm50eHJvZWVzeXZ3anlidmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjI2ODgsImV4cCI6MjA4Nzc5ODY4OH0.Nlzw_sbt10Esm4RECW9_Grr9O52NS7eAcYq4NnHDHrU';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testUpdate() {
    console.log("Starting Subscription Status Verification (ESM)...");

    try {
        // 1. Get a test subscriber
        const { data: client, error: fetchErr } = await supabase
            .from('clients')
            .select('id, name, subscription_status')
            .eq('is_subscriber', true)
            .limit(1)
            .single();

        if (fetchErr) {
            console.error("Error fetching test client:", fetchErr);
            return;
        }

        console.log(`Testing with client: ${client.name} (ID: ${client.id}, Current Status: ${client.subscription_status})`);

        // 2. Get the corresponding subscription
        const { data: sub, error: subErr } = await supabase
            .from('client_subscriptions')
            .select('id, status')
            .eq('client_id', client.id)
            .single();

        if (subErr) {
            console.error("Error fetching client subscription:", subErr);
            return;
        }

        console.log(`Current Subscription Status: ${sub.status}`);

        const originalClientStatus = client.subscription_status;
        const originalSubStatus = sub.status;

        // 3. Simulate "Mark as Overdue" manually
        const targetStatus = 'overdue';
        console.log(`Updating status to: ${targetStatus}...`);

        const { error: updateSubErr } = await supabase
            .from('client_subscriptions')
            .update({ status: targetStatus })
            .eq('id', sub.id);
        
        if (updateSubErr) {
            console.error("Error updating client_subscriptions:", updateSubErr);
            return;
        }

        const { error: updateClientErr } = await supabase
            .from('clients')
            .update({ subscription_status: targetStatus })
            .eq('id', client.id);

        if (updateClientErr) {
            console.error("Error updating clients:", updateClientErr);
            return;
        }

        // 4. Verify updates
        const { data: verifiedClient } = await supabase.from('clients').select('subscription_status').eq('id', client.id).single();
        const { data: verifiedSub } = await supabase.from('client_subscriptions').select('status').eq('id', sub.id).single();

        console.log(`Verified Statuses -> Clients: ${verifiedClient.subscription_status}, Subscriptions: ${verifiedSub.status}`);

        if (verifiedClient.subscription_status === targetStatus && verifiedSub.status === targetStatus) {
            console.log("✅ STATUS UPDATE VERIFIED SUCCESSFULLY!");
        } else {
            console.log("❌ STATUS UPDATE VERIFICATION FAILED!");
        }

        // 5. Revert to original status (to leave DB as it was)
        console.log("Reverting to original status...");
        await supabase.from('client_subscriptions').update({ status: originalSubStatus }).eq('id', sub.id);
        await supabase.from('clients').update({ subscription_status: originalClientStatus }).eq('id', client.id);
        console.log("Cleanup complete.");
    } catch (err) {
        console.error("Unexpected error:", err);
    }
}

testUpdate();
