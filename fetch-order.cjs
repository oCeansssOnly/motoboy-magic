const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8').split('\n');
const supabaseUrl = env.find(l => l.startsWith('VITE_SUPABASE_URL')).split('=')[1].trim();
const anonKey = env.find(l => l.startsWith('VITE_SUPABASE_PUBLISHABLE_KEY')).split('=')[1].trim();

async function main() {
  const url = supabaseUrl + '/functions/v1/ifood-orders';
  console.log("Fetching from:", url);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${anonKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });
  
  if (!res.ok) {
     console.log("Error:", res.status, await res.text());
     return;
  }
  
  const data = await res.json();
  console.log("Response:", JSON.stringify(data, null, 2));
}

main().catch(console.error);
