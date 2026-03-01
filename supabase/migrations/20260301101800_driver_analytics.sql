-- Enhance confirmed_orders with analytics fields
ALTER TABLE public.confirmed_orders
  ADD COLUMN IF NOT EXISTS distance_km FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_total_cents INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_lat FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_lng FLOAT DEFAULT 0;

-- Index for fast per-driver analytics queries
CREATE INDEX IF NOT EXISTS confirmed_orders_driver_idx ON public.confirmed_orders (motoboy_name, confirmed_at);
CREATE INDEX IF NOT EXISTS confirmed_orders_driver_id_idx ON public.confirmed_orders (driver_id, confirmed_at);

-- Store iFood merchant info for persistent store address
CREATE TABLE IF NOT EXISTS public.ifood_merchant (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id TEXT UNIQUE NOT NULL,
  name TEXT,
  address TEXT,
  lat FLOAT,
  lng FLOAT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ifood_merchant ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON public.ifood_merchant FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Service role write" ON public.ifood_merchant FOR ALL USING (true);
