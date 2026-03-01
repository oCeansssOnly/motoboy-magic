const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("IFOOD_CLIENT_ID");
  const clientSecret = Deno.env.get("IFOOD_CLIENT_SECRET");

  // Try the stored user-authenticated token first (has broadest permissions)
  const res = await fetch(sbUrl("/ifood_tokens?select=*&order=created_at.desc&limit=1"), {
    headers: sbHeaders(),
  });
  const text = await res.text();
  const tokens = text ? JSON.parse(text) : null;

  if (Array.isArray(tokens) && tokens.length > 0) {
    const token = tokens[0];
    if (new Date(token.expires_at) > new Date()) return token.access_token;

    // Refresh expired token
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
    if (rRes.ok) {
      const rData = JSON.parse(await rRes.text());
      if (rData?.accessToken) {
        await fetch(sbUrl(`/ifood_tokens?id=eq.${token.id}`), {
          method: "PATCH",
          headers: sbHeaders(),
          body: JSON.stringify({
            access_token: rData.accessToken,
            refresh_token: rData.refreshToken || token.refresh_token,
            expires_at: new Date(Date.now() + (rData.expiresIn || 3600) * 1000).toISOString(),
          }),
        });
        return rData.accessToken;
      }
    }
  }

  // Fallback: client_credentials
  const authRes = await fetch(IFOOD_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grantType: "client_credentials", clientId, clientSecret }),
  });
  if (!authRes.ok) throw new Error("Falha na autenticação iFood.");
  const data = JSON.parse(await authRes.text());
  if (!data?.accessToken) throw new Error("Falha na autenticação iFood.");
  return data.accessToken;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let orderId = "", confirmationCode = "", motoboyName = "Motoboy";
    try {
      const body = await req.json();
      orderId = body?.orderId || "";
      confirmationCode = body?.confirmationCode || "";
      motoboyName = body?.motoboyName || "Motoboy";
    } catch { /* empty body */ }

    if (!orderId || !confirmationCode) {
      return new Response(JSON.stringify({ success: false, error: "orderId and confirmationCode are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get iFood access token
    let accessToken = "";
    try { accessToken = await getAccessToken(); }
    catch (e: any) {
      return new Response(JSON.stringify({
        success: false,
        error: `Falha na autenticação: ${e.message}`,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Step 1: Verify the delivery code via iFood API ──────────────────────
    // POST /logistics/v1.0/orders/{id}/verifyDeliveryCode
    // iFood validates the code the customer showed the courier.
    // If { success: true }, the delivery is confirmed on iFood's side.
    const verifyRes = await fetch(
      `https://merchant-api.ifood.com.br/logistics/v1.0/orders/${orderId}/verifyDeliveryCode`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: confirmationCode }),
      }
    );

    const verifyBody = await verifyRes.text();
    let verifyData: any = null;
    try { verifyData = verifyBody ? JSON.parse(verifyBody) : null; } catch { /* ignore */ }

    // iFood returns { success: true } if the code matches, { success: false } otherwise.
    // A non-2xx status (e.g. 400, 404) also means failure.
    const codeValid = verifyRes.ok && verifyData?.success === true;

    if (!codeValid) {
      // Code is wrong — do NOT record anything, return failure to the client
      const reason = verifyData?.message || verifyData?.error
        || (verifyRes.ok ? "Código incorreto" : `iFood retornou ${verifyRes.status}: ${verifyBody}`);
      return new Response(JSON.stringify({
        success: false,
        invalidCode: true,
        error: reason,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Step 2: Code is valid — record the confirmed delivery in Supabase ───
    const insertRes = await fetch(sbUrl("/confirmed_orders"), {
      method: "POST",
      headers: sbHeaders(),
      body: JSON.stringify({
        ifood_order_id: orderId,
        confirmation_code: confirmationCode,
        motoboy_name: motoboyName,
        status: "concluded_api",
        customer_name: "",
        customer_address: "",
        order_code: orderId,
      }),
    });
    if (!insertRes.ok) {
      const err = await insertRes.text();
      console.error("DB insert failed:", insertRes.status, err);
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Entrega confirmada com sucesso via iFood!",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
