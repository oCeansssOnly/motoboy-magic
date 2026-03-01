#!/usr/bin/env node
/**
 * migrate-supabase.js
 *
 * Fully automated Supabase migration script.
 * Creates a new project, runs migrations, deploys all 3 edge functions,
 * and prints the new env vars to paste into your .env file.
 *
 * ─── HOW TO USE ──────────────────────────────────────────────────────────────
 * 1. Create a FREE account at https://supabase.com
 * 2. Go to https://app.supabase.com/account/tokens  → "Generate new token"
 * 3. Paste the token below in SUPABASE_ACCESS_TOKEN
 * 4. Set your iFood credentials (CLIENT_ID and CLIENT_SECRET) below
 * 5. Run:  node migrate-supabase.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ══════════════════════════════════════════════════════════
//  CONFIGURE THESE VALUES BEFORE RUNNING
// ══════════════════════════════════════════════════════════
const SUPABASE_ACCESS_TOKEN = 'sbp_15fd2e795a8959ba6e815fef004faae3d1cb6be3';   // from app.supabase.com/account/tokens
const NEW_PROJECT_NAME      = 'motoboy-magic';        // name for the new project
const PROJECT_REGION        = 'sa-east-1';            // São Paulo region
const DB_PASSWORD           = 'MotoMagic2026!';       // strong password for the DB
const IFOOD_CLIENT_ID       = '49a35630-7c80-4250-8105-1c3d3425b266';
const IFOOD_CLIENT_SECRET   = '4uz5w5hguc5xenm74h15ucbq8e61bk1c6zcrfl7sahdzytcu3o4o7n03jp6muh1dqmi6qt0aw72j4esp5fbysa1zlpey87ve1tb';
// ══════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const API = 'https://api.supabase.com/v1';
const headers = {
  'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
};

async function api(method, endpoint, body) {
  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${endpoint} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForProject(ref) {
  process.stdout.write('  Aguardando projeto ficar online');
  for (let i = 0; i < 60; i++) {
    await wait(5000);
    process.stdout.write('.');
    try {
      const proj = await api('GET', `/projects/${ref}`);
      if (proj.status === 'ACTIVE_HEALTHY') { console.log(' ✓'); return; }
    } catch { /* still starting */ }
  }
  throw new Error('Projeto não ficou healthy em 5 minutos');
}

function readFunction(name) {
  const p = path.join(__dirname, 'supabase', 'functions', name, 'index.ts');
  return fs.readFileSync(p, 'utf8');
}

const SQL_MIGRATIONS = `
-- ifood_tokens
CREATE TABLE IF NOT EXISTS public.ifood_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.ifood_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access" ON public.ifood_tokens FOR ALL USING (true) WITH CHECK (true);

-- confirmed_orders
CREATE TABLE IF NOT EXISTS public.confirmed_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ifood_order_id TEXT NOT NULL,
  customer_name TEXT,
  customer_address TEXT,
  order_code TEXT,
  confirmation_code TEXT,
  motoboy_name TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  confirmed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.confirmed_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read"   ON public.confirmed_orders FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.confirmed_orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.confirmed_orders FOR UPDATE USING (true);
`;

async function deployFunction(ref, name) {
  const body = readFunction(name);
  try {
    // Try update (PATCH) first
    await api('PATCH', `/projects/${ref}/functions/${name}`, { name, body, verify_jwt: false });
    console.log(`  ✓  ${name} (updated)`);
  } catch {
    // Create (POST) if not found
    await api('POST', `/projects/${ref}/functions`, { name, body, verify_jwt: false });
    console.log(`  ✓  ${name} (created)`);
  }
}

async function setSecrets(ref) {
  await api('POST', `/projects/${ref}/secrets`, [
    { name: 'IFOOD_CLIENT_ID',     value: IFOOD_CLIENT_ID },
    { name: 'IFOOD_CLIENT_SECRET', value: IFOOD_CLIENT_SECRET },
  ]);
  console.log('  ✓  Secrets configurados');
}

async function runMigrations(ref) {
  await api('POST', `/projects/${ref}/database/query`, { query: SQL_MIGRATIONS });
  console.log('  ✓  Migrações executadas');
}

async function main() {
  if (SUPABASE_ACCESS_TOKEN === 'COLE_O_TOKEN_AQUI') {
    console.error('\n❌  Configure o SUPABASE_ACCESS_TOKEN no topo do arquivo!\n');
    console.error('   Gere um token em: https://app.supabase.com/account/tokens\n');
    process.exit(1);
  }

  console.log('\n🚀  Iniciando migração para nova conta Supabase...\n');

  // 1. Get organization
  console.log('1/5  Buscando organização...');
  const orgs = await api('GET', '/organizations');
  if (!orgs || orgs.length === 0) throw new Error('Nenhuma organização encontrada. Crie uma em app.supabase.com');
  const orgId = orgs[0].id;
  console.log(`  ✓  Organização: ${orgs[0].name}`);

  // 2. Create project
  console.log('\n2/5  Criando projeto...');
  const proj = await api('POST', '/projects', {
    name: NEW_PROJECT_NAME,
    organization_id: orgId,
    region: PROJECT_REGION,
    db_pass: DB_PASSWORD,
    plan: 'free',
  });
  const ref = proj.id;
  console.log(`  ✓  Projeto criado: ${proj.name} (ref: ${ref})`);

  // 3. Wait for project to be ready
  console.log('\n3/5  Aguardando projeto inicializar...');
  await waitForProject(ref);

  // 4. Run DB migrations
  console.log('\n4/5  Configurando banco de dados e funções...');
  await runMigrations(ref);
  await setSecrets(ref);
  await deployFunction(ref, 'ifood-auth');
  await deployFunction(ref, 'ifood-orders');
  await deployFunction(ref, 'ifood-confirm');

  // 5. Get API keys
  console.log('\n5/5  Buscando chaves de API...');
  const keys = await api('GET', `/projects/${ref}/api-keys`);
  const anonKey = keys.find(k => k.name === 'anon')?.api_key || keys[0]?.api_key;
  const projectUrl = `https://${ref}.supabase.co`;

  // Write .env file
  const envContent = `VITE_SUPABASE_URL=${projectUrl}
VITE_SUPABASE_PUBLISHABLE_KEY=${anonKey}
`;
  fs.writeFileSync(path.join(__dirname, '.env'), envContent, 'utf8');

  // Update config.toml
  const tomlPath = path.join(__dirname, 'supabase', 'config.toml');
  let toml = fs.readFileSync(tomlPath, 'utf8');
  toml = toml.replace(/project_id\s*=\s*"[^"]*"/, `project_id = "${ref}"`);
  fs.writeFileSync(tomlPath, toml, 'utf8');

  console.log('\n' + '═'.repeat(60));
  console.log('✅  MIGRAÇÃO CONCLUÍDA COM SUCESSO!\n');
  console.log(`   Projeto URL:  ${projectUrl}`);
  console.log(`   Anon Key:     ${anonKey?.slice(0, 30)}...`);
  console.log('\n   ✓  Arquivo .env criado automaticamente');
  console.log('   ✓  supabase/config.toml atualizado');
  console.log('\n   Próximos passos:');
  console.log('   1. Execute: npm run dev');
  console.log('   2. Acesse o app e configure a autenticação iFood');
  console.log('═'.repeat(60) + '\n');
}

main().catch(err => {
  console.error('\n❌  Erro:', err.message);
  process.exit(1);
});
