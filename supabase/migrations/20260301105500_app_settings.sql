-- App-level settings (store name, store address config, etc.)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON public.app_settings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Public write" ON public.app_settings FOR ALL USING (true);
INSERT INTO public.app_settings (key, value) VALUES ('store_address', null) ON CONFLICT DO NOTHING;
INSERT INTO public.app_settings (key, value) VALUES ('store_name', null) ON CONFLICT DO NOTHING;
