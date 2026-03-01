const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const IFOOD_AUTH_URL = "https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token";

function supabaseHeaders() {
  return {
    "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
  };
}

function supabaseUrl(path) {
  return `${Deno.env.get("SUPABASE_URL")}/rest/v1${path}`;
}

async function safeJson(res) {
  try {
    const t = await res.text();
    return t ? JSON.parse(t) : null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await safeJson(req);
    const action = body?.action;
    const clientId = Deno.env.get("IFOOD_CLIENT_ID");
    const clientSecret = Deno.env.get("IFOOD_CLIENT_SECRET");

    if (action === "get_user_code") {
      const res = await fetch("https://merchant-api.ifood.com.br/authentication/v1.0/oauth/userCode", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ clientId }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(`UserCode failed [${res.status}]: ${JSON.stringify(data)}`);
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "exchange_code") {
      const res = await fetch(IFOOD_AUTH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grantType: "authorization_code",
          clientId,
          clientSecret,
          authorizationCode: body.authorizationCode || "",
          authorizationCodeVerifier: body.authorizationCodeVerifier || "",
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(`Token exchange failed [${res.status}]: ${JSON.stringify(data)}`);

      // Delete old tokens via REST
      await fetch(supabaseUrl("/ifood_tokens?id=neq.00000000-0000-0000-0000-000000000000"), {
        method: "DELETE", headers: supabaseHeaders(),
      });
      // Insert new token
      await fetch(supabaseUrl("/ifood_tokens"), {
        method: "POST",
        headers: supabaseHeaders(),
        body: JSON.stringify({
          access_token: data.accessToken,
          refresh_token: data.refreshToken,
          expires_at: new Date(Date.now() + (data.expiresIn || 3600) * 1000).toISOString(),
        }),
      });

      return new Response(JSON.stringify({ success: true, message: "Tokens salvos!" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "check_status") {
      const res = await fetch(supabaseUrl("/ifood_tokens?select=*&order=created_at.desc&limit=1"), {
        headers: supabaseHeaders(),
      });
      const tokens = await safeJson(res);
      const hasToken = Array.isArray(tokens) && tokens.length > 0;
      const isExpired = hasToken && new Date(tokens[0].expires_at) < new Date();
      return new Response(JSON.stringify({ authenticated: hasToken && !isExpired, hasToken, isExpired }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
