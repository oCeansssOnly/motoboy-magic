
-- Table to store confirmed deliveries
CREATE TABLE public.confirmed_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ifood_order_id TEXT NOT NULL,
  customer_name TEXT,
  customer_address TEXT,
  order_code TEXT,
  confirmation_code TEXT,
  motoboy_name TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  confirmed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS - public access since motoboys don't have auth
ALTER TABLE public.confirmed_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON public.confirmed_orders FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.confirmed_orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.confirmed_orders FOR UPDATE USING (true);
