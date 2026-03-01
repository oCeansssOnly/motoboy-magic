
-- Store iFood auth tokens
CREATE TABLE public.ifood_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ifood_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access" ON public.ifood_tokens FOR ALL USING (true) WITH CHECK (true);
