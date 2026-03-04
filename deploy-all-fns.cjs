// deploy-all-fns.cjs — Deploys all 3 functions (ifood-auth, ifood-orders, ifood-confirm, ifood-dispatch)
const fs = require('fs');
const path = require('path');

const TOKEN = 'sbp_15fd2e795a8959ba6e815fef004faae3d1cb6be3';
const REF   = 'eyhdtiriqlnkmmlhclcr';
const API   = 'https://api.supabase.com/v1';
const H     = { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

async function api(method, url, body) {
  const res = await fetch(`${API}${url}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

function readFn(name) {
  return fs.readFileSync(path.join(__dirname, 'supabase', 'functions', name, 'index.ts'), 'utf8');
}

async function deployFn(name) {
  const body = readFn(name);
  const payload = { slug: name, name, body, verify_jwt: false };
  try {
    await api('PATCH', `/projects/${REF}/functions/${name}`, payload);
    console.log(`  ✓  ${name} (updated)`);
  } catch {
    await api('POST', `/projects/${REF}/functions`, payload);
    console.log(`  ✓  ${name} (created)`);
  }
}

async function main() {
  console.log(`\n🚀  Deploying functions...\n`);
  await deployFn('ifood-orders');
  await deployFn('ifood-dispatch');
  await deployFn('ifood-webhook');
  console.log('\n✅  Done!\n');
}

main().catch(e => { console.error('❌  Erro:', e.message); process.exit(1); });
