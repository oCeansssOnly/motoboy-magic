// cleanup-stale-db-records.cjs
// Deletes completed/rejected transfer_requests and completed courier_routes
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
  // Delete completed and rejected transfer_requests (they were only updated, never deleted before)
  const tr = await runSQL(`DELETE FROM public.transfer_requests WHERE status IN ('completed', 'rejected') RETURNING id;`);
  console.log(`  ✓ Deleted ${tr?.length ?? 0} stale transfer_requests`);

  // Delete courier_routes rows for routes where ALL orders are confirmed
  // (orders jsonb array - check if all have confirmed=true)
  const cr = await runSQL(`
    DELETE FROM public.courier_routes
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(orders) AS o
      WHERE (o->>'confirmed')::boolean IS NOT TRUE
    )
    RETURNING id;
  `);
  console.log(`  ✓ Deleted ${cr?.length ?? 0} completed courier_routes`);

  console.log('\n✅ Done!');
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
