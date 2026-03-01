-- No-contact orders: orders that couldn't be delivered (cliente não encontrado).
-- These stay DISPATCHED on iFood but are surfaced here for retry by any driver.
CREATE TABLE public.no_contact_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      TEXT NOT NULL UNIQUE,     -- iFood order ID (prevents duplicates)
  order_data    JSONB NOT NULL,           -- Full IFoodOrder snapshot
  marked_by     TEXT NOT NULL,            -- driver name who marked no-contact
  attempt_count INTEGER NOT NULL DEFAULT 1,
  marked_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.no_contact_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth CRUD" ON public.no_contact_orders
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Full replica so Realtime UPDATE/DELETE events include all columns
ALTER TABLE public.no_contact_orders REPLICA IDENTITY FULL;
