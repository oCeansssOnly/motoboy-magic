// raw-deploy.cjs — Deploy raw TypeScript to Supabase (runtime handles TS natively)
const fs = require('fs');
const path = require('path');

const TOKEN = 'sbp_15fd2e795a8959ba6e815fef004faae3d1cb6be3';
const REF   = 'eyhdtiriqlnkmmlhclcr';
const API   = 'https://api.supabase.com/v1';
const H     = { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

async function req(method, url, body) {
  const res = await fetch(`${API}${url}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function deployFn(name) {
  const src = path.join(__dirname, 'supabase', 'functions', name, 'index.ts');
  const body = fs.readFileSync(src, 'utf8');
  const payload = { slug: name, name, body, verify_jwt: false };
  try {
    await req('PATCH', `/projects/${REF}/functions/${name}`, payload);
    console.log(`  ✓  ${name} (updated)`);
  } catch {
    await req('POST', `/projects/${REF}/functions`, payload);
    console.log(`  ✓  ${name} (created)`);
  }
}

async function main() {
  console.log(`\nDeploying raw TS to ${REF}...\n`);
  await deployFn('ifood-auth');
  await deployFn('ifood-orders');
  await deployFn('ifood-confirm');

  console.log('\nWaiting 10s for cold start...');
  await new Promise(r => setTimeout(r, 10000));

  const res = await fetch(`https://${REF}.supabase.co/functions/v1/ifood-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'check_status' }),
  });
  console.log(`\nHealth: HTTP ${res.status}`);
  console.log(await res.text());
}
main().catch(e => console.error('ERROR:', e.message));
