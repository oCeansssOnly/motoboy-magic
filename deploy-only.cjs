// deploy-only.cjs — Deploys functions to the already-created project and writes .env
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
  console.log(`\n🚀  Deploying functions to project ${REF}...\n`);

  await deployFn('ifood-auth');
  await deployFn('ifood-orders');
  await deployFn('ifood-confirm');

  console.log('\n🔑  Buscando chaves de API...');
  const keys = await api('GET', `/projects/${REF}/api-keys`);
  const anon = keys.find(k => k.name === 'anon')?.api_key || keys[0]?.api_key;
  const url  = `https://${REF}.supabase.co`;

  const env = `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_PUBLISHABLE_KEY=${anon}\n`;
  fs.writeFileSync(path.join(__dirname, '.env'), env, 'utf8');

  const tomlPath = path.join(__dirname, 'supabase', 'config.toml');
  let toml = fs.readFileSync(tomlPath, 'utf8');
  toml = toml.replace(/project_id\s*=\s*"[^"]*"/, `project_id = "${REF}"`);
  fs.writeFileSync(tomlPath, toml, 'utf8');

  console.log('\n' + '═'.repeat(55));
  console.log('✅  CONCLUÍDO!\n');
  console.log(`   URL:  ${url}`);
  console.log(`   Key:  ${anon?.slice(0,40)}...`);
  console.log('\n   ✓  .env criado');
  console.log('   ✓  config.toml atualizado');
  console.log('\n   Agora execute: npm run dev');
  console.log('═'.repeat(55) + '\n');
}

main().catch(e => { console.error('❌  Erro:', e.message); process.exit(1); });
