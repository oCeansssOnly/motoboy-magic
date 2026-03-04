// enable-pending-realtime.cjs
const TOKEN = 'sbp_15fd2e795a8959ba6e815fef004faae3d1cb6be3';
const REF   = 'eyhdtiriqlnkmmlhclcr';

async function runSQL(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  console.log('Enabling Realtime + REPLICA IDENTITY on pending_orders...');

  // REPLICA IDENTITY FULL so DELETE payloads include the id
  await runSQL(`ALTER TABLE public.pending_orders REPLICA IDENTITY FULL;`);
  console.log('  ✓ REPLICA IDENTITY FULL set');

  // Add to supabase_realtime publication
  await runSQL(`ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_orders;`);
  console.log('  ✓ Added to supabase_realtime publication');

  console.log('\n✅ Done!');
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
