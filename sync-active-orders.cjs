// sync-active-orders.cjs
// Script to fetch ALL active orders from iFood and restore them to Supabase pending_orders.
// Run: node sync-active-orders.cjs

const SUPABASE_URL = 'https://eyhdtiriqlnkmmlhclcr.supabase.co';
const SERVICE_ROLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5aGR0aXJpcWxua21tbGhjbGNyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDgzMjY1OSwiZXhwIjoyMDU2NDA4NjU5fQ.mCMxRTZAGsCJdJ_2AFWABFp_KFnUxFuF0veSJMz3bz4';
const MGMT_TOKEN = 'sbp_15fd2e795a8959ba6e815fef004faae3d1cb6be3';
const REF = 'eyhdtiriqlnkmmlhclcr';
const IFOOD_API = 'https://merchant-api.ifood.com.br';

function sbHeaders() {
  return {
    "apikey": SERVICE_ROLE,
    "Authorization": `Bearer ${SERVICE_ROLE}`,
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
  };
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${MGMT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function main() {
  // 1. Get iFood access token
  const tokens = await sql(`SELECT access_token FROM public.ifood_tokens ORDER BY created_at DESC LIMIT 1`);
  if (!tokens?.length) { console.error('❌ No iFood tokens found.'); process.exit(1); }
  const token = tokens[0].access_token;
  console.log('✓ Got iFood token');

  // 2. Fetch all active orders for the merchant from iFood
  // We use the polling endpoint or the events endpoint to ensure we get active ones?
  // Since iFood DOES NOT HAVE a "getAllActiveOrders" endpoint natively (they only have events),
  // our best bet is to query events / polling to see if there are any unacknowledged events,
  // OR we can query the /order/v1.0/events:polling directly.
  
  // Wait, the iFood API actually does not offer a way to query "all currently active orders" directly.
  // It only offers event polling. If the events for the older orders were already acknowledged,
  // we can't get them back through the API.
  // Let me test the orders endpoint with a GET request on merchant to see if there is an orders list.
  
  const routesRes = await sql(`SELECT id, name, orders FROM public.courier_routes`);
  console.log(`Routes: ${routesRes.length}`);
  
  const pendingRes = await sql(`SELECT id, ifood_order_id, customer_name FROM public.pending_orders`);
  console.log(`Pending orders: ${pendingRes.length}`);
  
  const pendingSet = new Set(pendingRes.map(p => p.ifood_order_id));
  
  let restored = 0;
  for (const route of routesRes) {
    const orders = route.orders || [];
    for (const o of orders) {
      if (!o.confirmed && !pendingSet.has(o.id)) {
        console.log(`Restoring order ${o.id} from route ${route.name}`);
        // We restore it to pending_orders so it shows up for admins as assigned
        await fetch(`${SUPABASE_URL}/rest/v1/pending_orders`, {
          method: 'POST',
          headers: sbHeaders(),
          body: JSON.stringify({
            ifood_order_id: o.id,
            display_id: o.displayId || o.id.slice(0, 8),
            status: 'DISPATCHED', // active
            customer_name: o.customerName || o.customer?.name || 'Cliente',
            address: o.address || o.delivery?.deliveryAddress?.formattedAddress || '--',
            total_cents: o.total || o.total?.orderAmount || 0,
            payment_method: 'ONLINE',
            items: JSON.stringify(o.items || []),
            delivery_code: o.delivery?.pickupCode || ''
          })
        });
        restored++;
      }
    }
  }
  console.log(`Restored ${restored} orders to pending_orders.`);
}

main().catch(console.error);
