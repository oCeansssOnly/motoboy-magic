// register-ifood-webhook.cjs
const MGMT_TOKEN = 'sbp_15fd2e795a8959ba6e815fef004faae3d1cb6be3';
const REF = 'eyhdtiriqlnkmmlhclcr';
const IFOOD_API = 'https://merchant-api.ifood.com.br';
const WEBHOOK_URL = `https://eyhdtiriqlnkmmlhclcr.supabase.co/functions/v1/ifood-webhook`;

async function runSQL(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${MGMT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function ifood(method, path, body) {
  const res = await fetch(`${IFOOD_API}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, text, data: (() => { try { return JSON.parse(text); } catch { return null; } })() };
}

let accessToken = '';

async function main() {
  // Get access token via SQL
  const tokens = await runSQL(`SELECT access_token, expires_at FROM public.ifood_tokens ORDER BY created_at DESC LIMIT 1`);
  if (!tokens?.length) { console.error('❌ No iFood tokens found.'); process.exit(1); }
  accessToken = tokens[0].access_token;
  console.log('✓ Got access token (expires:', tokens[0].expires_at, ')');

  // Get merchant ID
  const merchants = await ifood('GET', '/merchant/v1.0/merchants');
  console.log(`\nMerchants [${merchants.status}]:`, merchants.text.slice(0, 300));

  const merchantList = Array.isArray(merchants.data) ? merchants.data : merchants.data?.merchants || [];
  const merchantId = merchantList[0]?.id || merchantList[0]?.uuid;

  if (!merchantId) {
    console.log('\n⚠️  Could not get merchant ID. Trying webhook registration without it...');
  } else {
    console.log('✓ Merchant ID:', merchantId);
  }

  console.log(`\n📡 Webhook URL: ${WEBHOOK_URL}`);
  console.log('\nTrying registration endpoints...\n');

  // Try all known iFood webhook registration endpoints
  const endpoints = [
    { method: 'PUT', path: merchantId ? `/merchant/v1.0/merchants/${merchantId}/notification-settings` : null,
      body: { webhookUrl: WEBHOOK_URL, status: 'ACTIVE' } },
    { method: 'POST', path: '/events/v1.0/webhooks',
      body: { url: WEBHOOK_URL } },
    { method: 'POST', path: merchantId ? `/merchant/v1.0/merchants/${merchantId}/webhooks` : null,
      body: { url: WEBHOOK_URL, events: ['ORDER_STATUS_CHANGED'] } },
    { method: 'GET', path: '/order/v1.0/events/types', body: null },
  ];

  for (const ep of endpoints) {
    if (!ep.path) continue;
    const r = await ifood(ep.method, ep.path, ep.body);
    console.log(`${ep.method} ${ep.path} → [${r.status}]: ${r.text.slice(0, 200)}`);
    if (r.ok) { console.log('\n✅ Registration succeeded!'); break; }
  }
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
