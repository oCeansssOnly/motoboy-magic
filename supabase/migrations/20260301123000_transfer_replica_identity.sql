-- Enable REPLICA IDENTITY FULL on transfer_requests so that Supabase Realtime
-- UPDATE events include ALL columns (including order_data JSONB) in payload.new.
-- Without this, only the primary key is included in UPDATE payloads, causing
-- order_data to be null/undefined when the requester's client receives the event.
ALTER TABLE public.transfer_requests REPLICA IDENTITY FULL;
