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
    let orderIds: string[] = [];
    try {
      const body = await req.json();
      orderIds = Array.isArray(body?.orderIds) ? body.orderIds : [];
    } catch { /* empty body */ }

    if (orderIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, cancelled: [], failed: [], message: "Nenhum pedido para cancelar." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let accessToken = "";
    try {
      accessToken = await getAccessToken();
    } catch (e: any) {
      return new Response(
        JSON.stringify({ success: false, error: e.message }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const cancelled: string[] = [];
    const failed: string[] = [];

    // Cancel each order individually on iFood
    await Promise.all(orderIds.map(async (orderId) => {
      try {
        console.log(`[ifood-cancel] Cancelling order ${orderId}...`);
        const res = await fetch(
          `${IFOOD_API}/order/v1.0/orders/${orderId}/requestCancellation`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              reason: "STORE_HAS_NO_DELIVERY_DRIVER",
            }),
          },
        );

        const body = await res.text();
        console.log(`[ifood-cancel] order ${orderId} → status ${res.status} body: ${body.slice(0, 200)}`);

        // 202 = accepted, 200 = ok, 410 = already cancelled — all treated as success
        if (res.ok || res.status === 202 || res.status === 410) {
          cancelled.push(orderId);
        } else {
          // Some orders may not be cancellable (already delivered etc.) — log but don't block
          console.warn(`[ifood-cancel] order ${orderId} failed to cancel: ${res.status} ${body}`);
          failed.push(orderId);
        }
      } catch (err: any) {
        console.error(`[ifood-cancel] exception for order ${orderId}:`, err?.message);
        failed.push(orderId);
      }
    }));

    return new Response(
      JSON.stringify({
        success: true,
        cancelled,
        failed,
        message: `${cancelled.length} pedido(s) cancelado(s) no iFood.${failed.length > 0 ? ` ${failed.length} falharam.` : ""}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
