// test-minimal.cjs — Deploy a minimal hello world to see if it boots
const fs = require('fs');
const os = require('os');

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

const HELLO = `
Deno.serve((req) => {
  return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
});
`;

async function main() {
  console.log('Deploying minimal hello-world to ifood-auth...');
  const payload = { slug: 'ifood-auth', name: 'ifood-auth', body: HELLO, verify_jwt: false };
  try {
    await req('PATCH', `/projects/${REF}/functions/ifood-auth`, payload);
    console.log('Updated OK. Waiting 8s...');
  } catch(e) {
    console.error('Deploy error:', e.message);
    return;
  }

  await new Promise(r => setTimeout(r, 8000));
  const res = await fetch(`https://${REF}.supabase.co/functions/v1/ifood-auth`, { method: 'POST' });
  console.log(`Health: HTTP ${res.status}`);
  console.log(await res.text());
}
main().catch(e => console.error('ERROR:', e.message));
