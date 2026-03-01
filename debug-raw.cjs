const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8').split('\n');
const supabaseUrl = env.find(l => l.startsWith('VITE_SUPABASE_URL')).split('=')[1].trim();
const anonKey = env.find(l => l.startsWith('VITE_SUPABASE_PUBLISHABLE_KEY')).split('=')[1].trim();
const TOKEN = 'sbp_15fd2e795a8959ba6e815fef004faae3d1cb6be3';
const REF = 'eyhdtiriqlnkmmlhclcr';

// Approach: get token from db, then call ifood order API directly
async function main() {
  // Get access token directly from the Supabase db
  const tokenRes = await fetch(
    `https://${REF}.supabase.co/rest/v1/ifood_tokens?select=*&order=created_at.desc&limit=1`,
    { headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` } }
  );
  const tokens = await tokenRes.json();
  if (!tokens?.[0]?.access_token) { console.log("no token"); return; }
  const accessToken = tokens[0].access_token;

  // Get events
  const evRes = await fetch('https://merchant-api.ifood.com.br/events/v1.0/events:polling', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const events = await evRes.json();
  console.log("Events:", JSON.stringify(events?.map(e => ({ id: e.id, orderId: e.orderId, code: e.code || e.fullCode })), null, 2));

  // Get first order details
  if (events?.length > 0) {
    const orderId = events[0].orderId;
    if (!orderId) { console.log("No orderId in first event"); return; }
    const oRes = await fetch(`https://merchant-api.ifood.com.br/order/v1.0/orders/${orderId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    console.log("Order status:", oRes.status);
    const raw = await oRes.text();
    console.log("Raw order:", raw);
  }
}
main().catch(console.error);
