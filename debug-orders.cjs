const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8').split('\n');
const supabaseUrl = env.find(l => l.startsWith('VITE_SUPABASE_URL')).split('=')[1].trim();
const anonKey = env.find(l => l.startsWith('VITE_SUPABASE_PUBLISHABLE_KEY')).split('=')[1].trim();

async function main() {
  const res = await fetch(supabaseUrl + '/functions/v1/ifood-orders', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  const data = await res.json();
  console.log("orders:", data.orders?.length);
  if (data.orders?.length > 0) {
    const o = data.orders[0];
    console.log("--- PROCESSED ORDER ---");
    const { raw, ...rest } = o;
    console.log(JSON.stringify(rest, null, 2));
    console.log("--- RAW ORDER (from iFood) ---");
    console.log(JSON.stringify(raw, null, 2));
  } else {
    console.log("debug:", JSON.stringify(data.debug, null, 2));
  }
}
main().catch(console.error);
