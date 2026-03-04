// create-order-status-events.cjs
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
  console.log('Creating order_status_events table...');

  await runSQL(`
    CREATE TABLE IF NOT EXISTS public.order_status_events (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      order_id TEXT NOT NULL,
      status TEXT NOT NULL, -- 'concluded' | 'cancelled'
      order_data JSONB,     -- full order info for stats (concluded orders)
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log('  ✓ Table created');

  await runSQL(`ALTER TABLE public.order_status_events ENABLE ROW LEVEL SECURITY;`);
  await runSQL(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'order_status_events' AND policyname = 'Authenticated CRUD'
      ) THEN
        CREATE POLICY "Authenticated CRUD" ON public.order_status_events FOR ALL USING (auth.uid() IS NOT NULL);
      END IF;
    END $$;
  `);
  console.log('  ✓ RLS enabled');

  await runSQL(`ALTER TABLE public.order_status_events REPLICA IDENTITY FULL;`);
  await runSQL(`ALTER PUBLICATION supabase_realtime ADD TABLE public.order_status_events;`);
  console.log('  ✓ Realtime enabled');

  // Auto-cleanup: remove events older than 2 hours (handled by edge function, but safety net)
  await runSQL(`CREATE INDEX IF NOT EXISTS order_status_events_created_idx ON public.order_status_events (created_at);`);
  console.log('  ✓ Index created');

  console.log('\n✅ Done!');
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
