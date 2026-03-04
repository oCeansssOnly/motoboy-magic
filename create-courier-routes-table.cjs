// create-courier-routes-table.cjs
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
  console.log('Creating courier_routes table...');

  await runSQL(`
    CREATE TABLE IF NOT EXISTS public.courier_routes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      orders JSONB NOT NULL DEFAULT '[]',
      start_lat FLOAT,
      start_lng FLOAT,
      created_at TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log('  ✓ Table created');

  await runSQL(`ALTER TABLE public.courier_routes ENABLE ROW LEVEL SECURITY;`);
  await runSQL(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'courier_routes' AND policyname = 'Authenticated CRUD'
      ) THEN
        CREATE POLICY "Authenticated CRUD" ON public.courier_routes FOR ALL USING (auth.uid() IS NOT NULL);
      END IF;
    END $$;
  `);
  console.log('  ✓ RLS enabled');

  await runSQL(`ALTER TABLE public.courier_routes REPLICA IDENTITY FULL;`);
  console.log('  ✓ REPLICA IDENTITY FULL set');

  await runSQL(`ALTER PUBLICATION supabase_realtime ADD TABLE public.courier_routes;`);
  console.log('  ✓ Added to supabase_realtime publication');

  console.log('\n✅ Done!');
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
