// check-merchant.cjs
const SUPABASE_URL = 'https://eyhdtiriqlnkmmlhclcr.supabase.co';
const SERVICE_ROLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5aGR0aXJpcWxua21tbGhjbGNyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDgzMjY1OSwiZXhwIjoyMDU2NDA4NjU5fQ.mCMxRTZAGsCJdJ_2AFWABFp_KFnUxFuF0veSJMz3bz4';
const MGMT_TOKEN = 'sbp_15fd2e795a8959ba6e815fef004faae3d1cb6be3';
const REF = 'eyhdtiriqlnkmmlhclcr';
const IFOOD_API = 'https://merchant-api.ifood.com.br';

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
  const tokens = await sql(`SELECT access_token FROM public.ifood_tokens ORDER BY created_at DESC LIMIT 1`);
  const token = tokens[0].access_token;
  
  const mRes = await fetch(`${IFOOD_API}/merchant/v1.0/merchants`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const data = await mRes.json();
  const id = data[0]?.id;
  if (id) {
    const detailRes = await fetch(`${IFOOD_API}/merchant/v1.0/merchants/${id}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const detail = await detailRes.json();
    console.log(JSON.stringify(detail, null, 2));
  }
}
main().catch(console.error);
