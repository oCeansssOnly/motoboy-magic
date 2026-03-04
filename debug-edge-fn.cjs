// debug-edge-fn.cjs
// Calls the ifood-orders edge function and prints the full debug output.
// Run while an order is being concluded to see what events arrive.
const SUPABASE_URL = 'https://eyhdtiriqlnkmmlhclcr.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5aGR0aXJpcWxua21tbGhjbGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA4MzI2NTksImV4cCI6MjA1NjQwODY1OX0.4hLFGHnkNgTFgdFknkpgS7K0-d3LzEfFLBi9FBmB2gI';

async function poll() {
  console.log(`[${new Date().toISOString()}] Calling ifood-orders edge function...`);
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ifood-orders`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await res.json();
  console.log('\n📦 ORDERS:', data.orders?.length ?? 0);
  console.log('✅ CONCLUDED:', JSON.stringify(data.concludedOrders, null, 2));
  console.log('❌ CANCELLED:', JSON.stringify(data.cancelledOrderIds, null, 2));
  console.log('🐛 DEBUG:', JSON.stringify(data.debug, null, 2));
  console.log('---');
}

// Poll every 5 seconds for 2 minutes
let count = 0;
const interval = setInterval(async () => {
  await poll();
  if (++count >= 24) { clearInterval(interval); console.log('Done.'); }
}, 5000);

poll();
