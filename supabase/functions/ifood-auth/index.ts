import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const IFOOD_AUTH_URL = 'https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const { action, authorizationCode, authorizationCodeVerifier } = await req.json();
    const clientId = Deno.env.get('IFOOD_CLIENT_ID')!;
    const clientSecret = Deno.env.get('IFOOD_CLIENT_SECRET')!;

    if (action === 'get_user_code') {
      // Step 1: Get user code for device authorization
      const res = await fetch('https://merchant-api.ifood.com.br/authentication/v1.0/oauth/userCode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ clientId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`UserCode failed [${res.status}]: ${JSON.stringify(data)}`);
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'exchange_code') {
      // Step 2: Exchange authorization code for tokens
      const body: Record<string, string> = {
        grantType: 'authorization_code',
        clientId,
        clientSecret,
        authorizationCode: authorizationCode || '',
        authorizationCodeVerifier: authorizationCodeVerifier || '',
      };

      const res = await fetch(IFOOD_AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`Token exchange failed [${res.status}]: ${JSON.stringify(data)}`);

      // Save tokens
      await supabase.from('ifood_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('ifood_tokens').insert({
        access_token: data.accessToken,
        refresh_token: data.refreshToken,
        expires_at: new Date(Date.now() + (data.expiresIn || 3600) * 1000).toISOString(),
      });

      return new Response(JSON.stringify({ success: true, message: 'Tokens salvos!' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'check_status') {
      const { data: tokens } = await supabase
        .from('ifood_tokens')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

      const hasToken = tokens && tokens.length > 0;
      const isExpired = hasToken && new Date(tokens[0].expires_at) < new Date();

      return new Response(JSON.stringify({ 
        authenticated: hasToken && !isExpired,
        hasToken,
        isExpired,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
