// diagnose-order.cjs
// Prints the FULL raw response from GET /order/v1.0/orders/{id}
// for every in-route order. Run AFTER marking an order as concluded on iFood.
// Usage: node diagnose-order.cjs

const MGMT_TOKEN = 'sbp_15fd2e795a8959ba6e815fef004faae3d1cb6be3';
const REF        = 'eyhdtiriqlnkmmlhclcr';
const IFOOD_API  = 'https://merchant-api.ifood.com.br';

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
  console.log('✓ Got access token\n');

  // 2. Get in-route order IDs from courier_routes
  const routes = await sql(`SELECT id, name, orders FROM public.courier_routes`);
  if (!routes?.length) { console.log('⚠️  No courier routes found in DB.'); return; }

  const orderIds = [];
  for (const route of routes) {
    const orders = route.orders || [];
    console.log(`Route "${route.name}": ${orders.length} order(s)`);
    for (const o of orders) {
      if (o.id) orderIds.push({ routeName: route.name, orderId: o.id, confirmed: o.confirmed });
    }
  }

  if (orderIds.length === 0) { console.log('\n⚠️  No orders found in any route.'); return; }

  console.log(`\n📡 Fetching ${orderIds.length} order(s) from iFood...\n`);

  for (const { routeName, orderId, confirmed } of orderIds) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Order: ${orderId}`);
    console.log(`Route: ${routeName}  |  confirmed: ${confirmed}`);

    const res = await fetch(`${IFOOD_API}/order/v1.0/orders/${orderId}/status`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });

    console.log(`HTTP Status: ${res.status}`);

    if (res.status === 404 || res.status === 410) {
      console.log('⚠️  404/410 — order not found (may be concluded/archived)');
      continue;
    }

    const text = await res.text();
    try {
      const body = JSON.parse(text);
      console.log('Top-level keys:', Object.keys(body).join(', '));
      console.log('\nFULL RESPONSE:');
      console.log(JSON.stringify(body, null, 2));
    } catch {
      console.log('Raw response:', text);
    }
  }
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
