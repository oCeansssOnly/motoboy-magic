-- Persistent queue: keeps all unassigned active orders across sessions/refreshes.
-- The edge function upserts here when polling; the frontend loads from here on mount.
CREATE TABLE IF NOT EXISTS public.pending_orders (
  id TEXT PRIMARY KEY,              -- iFood order ID
  display_id TEXT,
  localizador TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  lat FLOAT DEFAULT 0,
  lng FLOAT DEFAULT 0,
  total INTEGER DEFAULT 0,
  payment_method TEXT,
  items TEXT,
  status TEXT,
  created_at TEXT,
  delivery_code TEXT,
  raw_data JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated CRUD" ON public.pending_orders FOR ALL USING (auth.uid() IS NOT NULL);

-- Remove old entries (>12h safety valve, orders should be assigned well before then)
CREATE INDEX IF NOT EXISTS pending_orders_received_idx ON public.pending_orders (received_at);
