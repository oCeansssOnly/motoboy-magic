require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: pending } = await supabase.from('pending_orders').select('display_id, raw_data').order('received_at', { ascending: false }).limit(3);
  console.log("PENDING RAW:");
  console.log(JSON.stringify(pending.map(p => ({
    id: p.display_id,
    total: p.raw_data.total || p.raw_data.TOTAL,
    delivery: p.raw_data.delivery || p.raw_data.DELIVERY,
    payments: p.raw_data.payments || p.raw_data.PAYMENTS,
  })), null, 2));
}
run();
