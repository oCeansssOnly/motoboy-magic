// add-unique-constraint.cjs
// Adds UNIQUE constraint on confirmed_orders.ifood_order_id via Supabase Management API
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
  console.log('Adding UNIQUE constraint on confirmed_orders.ifood_order_id...');

  // First: deduplicate any existing duplicate rows (keep the one with the latest confirmed_at)
  await runSQL(`
    DELETE FROM public.confirmed_orders a
    USING public.confirmed_orders b
    WHERE a.id < b.id
      AND a.ifood_order_id = b.ifood_order_id;
  `);
  console.log('  ✓ Deduplicated existing rows');

  // Then: add the unique constraint
  await runSQL(`
    ALTER TABLE public.confirmed_orders
    ADD CONSTRAINT confirmed_orders_ifood_order_id_unique UNIQUE (ifood_order_id);
  `);
  console.log('  ✓ UNIQUE constraint added');

  console.log('\n✅ Done!');
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
