-- user_profiles: links Supabase auth users to their roles and optional driver record
CREATE TABLE public.user_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'driver', -- 'admin' | 'driver'
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read/insert only their own profile row
CREATE POLICY "Own profile select" ON public.user_profiles FOR SELECT USING (auth.uid() = auth_user_id);
CREATE POLICY "Own profile insert" ON public.user_profiles FOR INSERT WITH CHECK (auth.uid() = auth_user_id);
-- Allow update so we can link driver_id later
CREATE POLICY "Own profile update" ON public.user_profiles FOR UPDATE USING (auth.uid() = auth_user_id);
