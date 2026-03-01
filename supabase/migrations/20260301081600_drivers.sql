-- Create drivers table for driver management system
CREATE TABLE public.drivers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'active' | 'inactive'
  notes TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read"   ON public.drivers FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.drivers FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.drivers FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.drivers FOR DELETE USING (true);
