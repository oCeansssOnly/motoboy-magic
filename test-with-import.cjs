// test-with-import.cjs — Test if esm.sh imports work via REST deploy
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

// Test with a function that has ONE import from esm.sh
const FN_WITH_IMPORT = `
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  );
  return new Response(JSON.stringify({ ok: true, hasSupabase: !!supabase }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
});
`;

async function main() {
  console.log('Testing esm.sh import...');
  await req('PATCH', `/projects/${REF}/functions/ifood-auth`, {
    slug: 'ifood-auth', name: 'ifood-auth', body: FN_WITH_IMPORT, verify_jwt: false
  });
  console.log('Deployed. Waiting 10s...');
  await new Promise(r => setTimeout(r, 10000));
  const res = await fetch(`https://${REF}.supabase.co/functions/v1/ifood-auth`, { method: 'POST' });
  console.log(`HTTP ${res.status}: ${await res.text()}`);
}
main().catch(e => console.error('ERROR:', e.message));
