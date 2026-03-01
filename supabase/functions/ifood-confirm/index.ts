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

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("IFOOD_CLIENT_ID");
  const clientSecret = Deno.env.get("IFOOD_CLIENT_SECRET");

  // Try stored (user-authenticated) token first — has the most permissions
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/ifood_tokens?select=*&order=created_at.desc&limit=1`, {
    headers: sbHeaders(),
  });
  const text = await res.text();
  const tokens = text ? JSON.parse(text) : null;

  if (Array.isArray(tokens) && tokens.length > 0) {
    const token = tokens[0];
    if (new Date(token.expires_at) > new Date()) return token.access_token;

    // Refresh
    const rRes = await fetch(IFOOD_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grantType: "refresh_token", clientId, clientSecret, refreshToken: token.refresh_token }),
    });
    const rData = rRes.ok ? JSON.parse(await rRes.text()) : null;
    if (rData?.accessToken) {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/ifood_tokens?id=eq.${token.id}`, {
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

  // Fallback: client_credentials (lower access but works for some endpoints)
  const authRes = await fetch(IFOOD_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grantType: "client_credentials", clientId, clientSecret }),
  });
  const data = authRes.ok ? JSON.parse(await authRes.text()) : null;
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
    } catch { /* empty */ }

    if (!orderId || !confirmationCode) {
      return new Response(JSON.stringify({ error: "orderId and confirmationCode are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Get an access token
    let accessToken = "";
    let authError = "";
    try { accessToken = await getAccessToken(); }
    catch (e: any) { authError = e.message; }

    // 2. Call iFood order conclude endpoint to confirm delivery
    //    POST /order/v1.0/orders/{orderId}/conclude
    //    This moves the order to CONCLUDED status in iFood.
    let apiSuccess = false;
    let apiMessage = "";

    if (accessToken) {
      try {
        const concludeRes = await fetch(
          `${IFOOD_API}/order/v1.0/orders/${orderId}/conclude`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );
        const body = await concludeRes.text();

        if (concludeRes.ok || concludeRes.status === 202) {
          apiSuccess = true;
          apiMessage = "Pedido concluído via API iFood!";
        } else if (concludeRes.status === 410) {
          // 410 = order already in terminal state — treat as success
          apiSuccess = true;
          apiMessage = "Pedido já estava concluído.";
        } else {
          apiMessage = `iFood retornou ${concludeRes.status}: ${body}`;
          console.error("conclude failed:", apiMessage);
        }
      } catch (e: any) {
        apiMessage = `Erro na chamada iFood: ${e.message}`;
        console.error(apiMessage);
      }
    } else {
      apiMessage = `Sem token: ${authError}`;
    }

    // 3. Record the confirmation in Supabase regardless of API result
    const insertRes = await fetch(sbUrl("/confirmed_orders"), {
      method: "POST",
      headers: sbHeaders(),
      body: JSON.stringify({
        ifood_order_id: orderId,
        confirmation_code: confirmationCode,
        motoboy_name: motoboyName,
        status: apiSuccess ? "concluded_api" : "concluded_manual",
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
      apiConfirmed: apiSuccess,
      message: apiSuccess
        ? apiMessage
        : "Confirmação salva localmente. Confirme manualmente no painel iFood se necessário.",
      details: apiMessage,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
