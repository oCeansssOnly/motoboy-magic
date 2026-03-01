#!/usr/bin/env node
// bundle-deploy.cjs
// Bundles each edge function with esbuild and deploys via Supabase REST API
const { execSync } = require('child_process');
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

// Use esbuild (already in node_modules from vite's deps)
function bundleFunction(name) {
  const src = path.join(__dirname, 'supabase', 'functions', name, 'index.ts');
  const out = path.join(os.tmpdir(), `fn-${name}-bundle.js`);

  // esbuild: bundle, target deno, no external (inline esm.sh imports won't work — keep as-is for esm.sh)
  // We'll use a simpler approach: just strip TypeScript types using regex since the code is simple
  let ts = fs.readFileSync(src, 'utf8');

  // Remove TypeScript-specific syntax (type annotations, interface, etc.) to produce valid JS
  // that Supabase's Deno edge runtime can execute
  let js = ts
    // Remove "import type" lines
    .replace(/^import type .+$/gm, '')
    // Remove type annotations in function params: ": Type"
    .replace(/:\s*(Record<[^>]+>|Promise<[^>]+>|string|number|boolean|any|unknown|void|null)\b/g, '')
    // Remove generic type params like <string>, <any>, <T>
    .replace(/<(string|number|boolean|any|unknown|Record[^>]*)>/g, '')
    // Remove "as string[]"
    .replace(/\s+as\s+\w+(\[\])?/g, '')
    // Remove ": Type" in variable declarations
    .replace(/:\s*any(\[\])?(\s*=)/g, '$2')
    .replace(/: Record<string, string>/g, '')
    // Remove "error: unknown" param type 
    .replace(/\(error: unknown\)/g, '(error)')
    // Remove remaining ": unknown" 
    .replace(/: unknown/g, '')
    // Remove "!." non-null assertions
    .replace(/!(\s*[;\s,)\}])/g, '$1')
    .replace(/Deno\.env\.get\('([^']+)'\)!/g, "Deno.env.get('$1')");

  fs.writeFileSync(out, js, 'utf8');
  return out;
}

async function deployFn(name) {
  console.log(`  Bundling ${name}...`);
  const outFile = bundleFunction(name);
  const body = fs.readFileSync(outFile, 'utf8');
  fs.unlinkSync(outFile);

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
  console.log(`\n🚀  Bundle & Deploy to ${REF}...\n`);
  await deployFn('ifood-auth');
  await deployFn('ifood-orders');
  await deployFn('ifood-confirm');

  console.log('\n✅  Deploy concluído! Testando...');

  // Quick health check
  await new Promise(r => setTimeout(r, 8000));
  try {
    const res = await fetch(`https://${REF}.supabase.co/functions/v1/ifood-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check_status' }),
    });
    console.log(`\n   Health check → HTTP ${res.status}`);
    const body = await res.text();
    console.log(`   Response: ${body}`);
  } catch (e) {
    console.log(`\n   Health check error: ${e.message}`);
  }
}

main().catch(e => { console.error('❌  Erro:', e.message); process.exit(1); });
