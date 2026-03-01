#!/usr/bin/env node
/**
 * deploy-function.js
 * 
 * Deploys the ifood-orders edge function to Supabase Cloud
 * using the Supabase Management API.
 *
 * Usage:
 *   1. Generate a Personal Access Token at: https://app.supabase.com/account/tokens
 *   2. Paste it in the SUPABASE_ACCESS_TOKEN variable below
 *   3. Run: node deploy-function.js
 */

const fs = require('fs');
const path = require('path');

// ── CONFIGURE THESE ──────────────────────────────────────
const SUPABASE_ACCESS_TOKEN = 'YOUR_PERSONAL_ACCESS_TOKEN_HERE';
const PROJECT_REF = 'yggbukplsmpbhkkiwsse';
const FUNCTION_NAME = 'ifood-orders';
// ─────────────────────────────────────────────────────────

if (SUPABASE_ACCESS_TOKEN === 'YOUR_PERSONAL_ACCESS_TOKEN_HERE') {
  console.error('❌  Please set your SUPABASE_ACCESS_TOKEN in deploy-function.js first.');
  console.error('   Get one at: https://app.supabase.com/account/tokens');
  process.exit(1);
}

const functionPath = path.join(__dirname, 'supabase', 'functions', FUNCTION_NAME, 'index.ts');
const functionBody = fs.readFileSync(functionPath, 'utf8');

async function deploy() {
  console.log(`🚀  Deploying ${FUNCTION_NAME} to project ${PROJECT_REF}...`);

  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/${FUNCTION_NAME}`;

  // Try PATCH first (update existing), then POST (create new)
  for (const method of ['PATCH', 'POST']) {
    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: FUNCTION_NAME,
        body: functionBody,
        verify_jwt: false,
      }),
    });

    const text = await res.text();

    if (res.ok) {
      console.log(`✅  Successfully deployed! (${method} ${res.status})`);
      return;
    }

    if (method === 'PATCH' && res.status === 404) {
      // Function doesn't exist yet, will try POST
      console.log('   Function not found with PATCH, trying POST...');
      continue;
    }

    console.error(`❌  Deploy failed (${method} ${res.status}): ${text}`);
    process.exit(1);
  }
}

deploy().catch((err) => {
  console.error('❌  Unexpected error:', err.message);
  process.exit(1);
});
