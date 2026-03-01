// esbuild-deploy.cjs - Properly bundles TS functions and deploys via Supabase REST API
const { build } = require('./node_modules/esbuild/lib/main.js');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TOKEN = 'sbp_15fd2e795a8959ba6e815fef004faae3d1cb6be3';
const REF   = 'eyhdtiriqlnkmmlhclcr';
const API   = 'https://api.supabase.com/v1';
const H     = { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

async function request(method, url, body) {
  const res = await fetch(`${API}${url}`, {
    method, headers: H, body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function bundleFunction(name) {
  const src = path.join(__dirname, 'supabase', 'functions', name, 'index.ts');
  const outfile = path.join(os.tmpdir(), `fn-${name}.js`);

  await build({
    entryPoints: [src],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    outfile,
    external: ['https://esm.sh/*', 'https://deno.land/*', 'node:*'],
    loader: { '.ts': 'ts' },
    treeShaking: false,
    minify: false,
  });

  const code = fs.readFileSync(outfile, 'utf8');
  fs.unlinkSync(outfile);
  return code;
}

async function deployFn(name) {
  console.log(`  Bundling ${name}...`);
  let body;
  try {
    body = await bundleFunction(name);
  } catch(e) {
    console.error(`  ✗  esbuild failed: ${e.message}`);
    throw e;
  }

  const payload = { slug: name, name, body, verify_jwt: false };
  try {
    await request('PATCH', `/projects/${REF}/functions/${name}`, payload);
    console.log(`  ✓  ${name} (updated)`);
  } catch {
    await request('POST', `/projects/${REF}/functions`, payload);
    console.log(`  ✓  ${name} (created)`);
  }
}

async function main() {
  console.log(`\n🚀  esbuild + Deploy to ${REF}...\n`);
  await deployFn('ifood-auth');
  await deployFn('ifood-orders');
  await deployFn('ifood-confirm');

  console.log('\n✅  Deploy concluído! Aguardando cold start...');
  await new Promise(r => setTimeout(r, 10000));

  const res = await fetch(`https://${REF}.supabase.co/functions/v1/ifood-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'check_status' }),
  });
  console.log(`\n   Health check → HTTP ${res.status}`);
  const txt = await res.text();
  console.log(`   Response: ${txt.slice(0, 200)}`);
}

main().catch(e => { console.error('❌  Erro:', e.message); process.exit(1); });
