const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const IFOOD_API = "https://merchant-api.ifood.com.br";

function sbHeaders() {
  return {
    "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
  };
}
function sbUrl(p) { return `${Deno.env.get("SUPABASE_URL")}/rest/v1${p}`; }

async function safeJson(res) {
  try { const t = await res.text(); return t ? JSON.parse(t) : null; }
  catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await safeJson(req);
    const { orderId, confirmationCode, motoboyName } = body || {};

    if (!orderId || !confirmationCode) {
      return new Response(JSON.stringify({ error: "orderId and confirmationCode are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try to get a token via client_credentials
    const clientId = Deno.env.get("IFOOD_CLIENT_ID");
    const clientSecret = Deno.env.get("IFOOD_CLIENT_SECRET");

    let accessToken = "";
    try {
      const authRes = await fetch("https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grantType: "client_credentials", clientId, clientSecret }),
      });
      const data = await safeJson(authRes);
      accessToken = data?.accessToken || "";
    } catch { /* proceed without */ }

    let apiSuccess = false;
    let apiMessage = "";

    if (accessToken) {
      try {
        const dispatchRes = await fetch(`${IFOOD_API}/order/v1.0/orders/${orderId}/dispatch`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
        });
        if (dispatchRes.ok || dispatchRes.status === 202) {
          apiSuccess = true;
          apiMessage = "Pedido despachado via API iFood";
          await dispatchRes.text();
        } else {
          apiMessage = `API iFood retornou ${dispatchRes.status}: ${await dispatchRes.text()}`;
        }
      } catch (err) {
        apiMessage = `Erro ao chamar API: ${err?.message || "Unknown"}`;
      }
    }

    await fetch(sbUrl("/confirmed_orders"), {
      method: "POST",
      headers: sbHeaders(),
      body: JSON.stringify({
        ifood_order_id: orderId,
        confirmation_code: confirmationCode,
        motoboy_name: motoboyName || "Motoboy",
        status: apiSuccess ? "confirmed_api" : "confirmed_manual",
        customer_name: "", customer_address: "", order_code: orderId,
      }),
    });

    return new Response(JSON.stringify({
      success: true,
      apiConfirmed: apiSuccess,
      message: apiSuccess ? "Entrega confirmada via iFood!" : "Confirmação salva. Confirme manualmente no painel iFood.",
      details: apiMessage,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
