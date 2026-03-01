-- Transfer requests: drivers request to take orders from other drivers
CREATE TABLE public.transfer_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id TEXT NOT NULL,
  order_data JSONB NOT NULL,           -- full IFoodOrder snapshot for cross-device reconstruction
  requester_name TEXT NOT NULL,        -- driver who wants the order
  current_owner_name TEXT NOT NULL,    -- driver who currently holds it
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected | completed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transfer_requests ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can manage transfer requests
CREATE POLICY "Authenticated CRUD" ON public.transfer_requests
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Clean up old completed/rejected requests automatically after 24h
CREATE INDEX transfer_requests_status_idx ON public.transfer_requests (status, created_at);
