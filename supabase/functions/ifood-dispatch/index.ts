const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const IFOOD_API = "https://merchant-api.ifood.com.br";
const IFOOD_AUTH_URL = "https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token";

function sbHeaders() {
  return {
    "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
  };
}
function sbUrl(p: string) { return `${Deno.env.get("SUPABASE_URL")}/rest/v1${p}`; }

async function safeJson(res: Response) {
  try { const t = await res.text(); return t ? JSON.parse(t) : null; }
  catch { return null; }
}

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("IFOOD_CLIENT_ID");
  const clientSecret = Deno.env.get("IFOOD_CLIENT_SECRET");

  // Try stored token first
  const res = await fetch(sbUrl("/ifood_tokens?select=*&order=created_at.desc&limit=1"), {
    headers: sbHeaders(),
  });
  const tokens = await safeJson(res);

  if (Array.isArray(tokens) && tokens.length > 0) {
    const token = tokens[0];
    const isExpired = new Date(token.expires_at) < new Date();
    if (!isExpired) return token.access_token;

    // Refresh token
    const rRes = await fetch(IFOOD_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grantType: "refresh_token",
        clientId,
        clientSecret,
        refreshToken: token.refresh_token,
      }),
    });
    const data = await safeJson(rRes);
    if (rRes.ok && data?.accessToken) {
      await fetch(sbUrl(`/ifood_tokens?id=eq.${token.id}`), {
        method: "PATCH",
        headers: sbHeaders(),
        body: JSON.stringify({
          access_token: data.accessToken,
          refresh_token: data.refreshToken || token.refresh_token,
          expires_at: new Date(Date.now() + (data.expiresIn || 3600) * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
      return data.accessToken;
    }
  }

  // Fallback: client_credentials
  const authRes = await fetch(IFOOD_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grantType: "client_credentials",
      clientId,
      clientSecret,
    }),
  });
  const data = await safeJson(authRes);
  if (!data?.accessToken) throw new Error("NOT_AUTHENTICATED: Falha na autenticação iFood.");
  return data.accessToken;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let orderId = "";
    try { const body = await req.json(); orderId = body?.orderId || ""; } catch { /* empty body */ }

    if (!orderId) {
      return new Response(JSON.stringify({ error: "orderId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let accessToken = "";
    try {
      accessToken = await getAccessToken();
    } catch (e: any) {
      return new Response(JSON.stringify({ success: false, error: e.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call iFood dispatch endpoint — signals that the courier has left the store
    const dispatchRes = await fetch(
      `${IFOOD_API}/order/v1.0/orders/${orderId}/dispatch`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const dispatchBody = await dispatchRes.text();

    if (dispatchRes.ok || dispatchRes.status === 202) {
      return new Response(
        JSON.stringify({ success: true, message: "Pedido despachado via iFood!" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // iFood may return 410 if already dispatched — treat as success
    if (dispatchRes.status === 410) {
      return new Response(
        JSON.stringify({ success: true, message: "Pedido já estava despachado." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        message: `iFood retornou ${dispatchRes.status}: ${dispatchBody}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
