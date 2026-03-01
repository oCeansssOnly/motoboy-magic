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
function sbUrl(p) { return `${Deno.env.get("SUPABASE_URL")}/rest/v1${p}`; }

async function safeJson(res) {
  try { const t = await res.text(); return t ? JSON.parse(t) : null; }
  catch { return null; }
}

async function getAccessToken() {
  const clientId = Deno.env.get("IFOOD_CLIENT_ID");
  const clientSecret = Deno.env.get("IFOOD_CLIENT_SECRET");

  const res = await fetch(sbUrl("/ifood_tokens?select=*&order=created_at.desc&limit=1"), { headers: sbHeaders() });
  const tokens = await safeJson(res);

  if (!Array.isArray(tokens) || tokens.length === 0)
    throw new Error("NOT_AUTHENTICATED: Configure a autenticação iFood primeiro.");

  const token = tokens[0];
  const isExpired = new Date(token.expires_at) < new Date();
  if (!isExpired) return token.access_token;

  // Refresh
  const rRes = await fetch(IFOOD_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grantType: "refresh_token", clientId, clientSecret, refreshToken: token.refresh_token }),
  });
  const data = await safeJson(rRes);
  if (!rRes.ok || !data?.accessToken)
    throw new Error("NOT_AUTHENTICATED: Token expirado. Reautentique o iFood.");

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

function formatAddress(addr) {
  if (!addr) return "Endereço não disponível";
  return [addr.streetName, addr.streetNumber, addr.complement, addr.neighborhood, addr.city, addr.state]
    .filter(Boolean).join(", ") || "Endereço não disponível";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const accessToken = await getAccessToken();

    // Poll events
    const eventsRes = await fetch(`${IFOOD_API}/events/v1.0/events:polling`, {
      headers: { "Authorization": `Bearer ${accessToken}` },
    });

    let events = [];
    if (eventsRes.status === 200) {
      const parsed = await safeJson(eventsRes);
      if (Array.isArray(parsed)) events = parsed;
      if (events.length > 0) {
        await fetch(`${IFOOD_API}/events/v1.0/events/acknowledgment`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(events.map(e => ({ id: e.id }))),
        });
      }
    } else {
      await eventsRes.text();
    }

    // Fetch orders
    const orderIds = events
      .filter(e => ["PLC", "CFM", "RTP", "PLACED", "CONFIRMED", "READY_TO_PICKUP"].includes(e.code || e.fullCode))
      .map(e => e.orderId);
    const uniqueIds = [...new Set(orderIds)];
    const orders = [];

    for (const orderId of uniqueIds) {
      try {
        const oRes = await fetch(`${IFOOD_API}/order/v1.0/orders/${orderId}`, {
          headers: { "Authorization": `Bearer ${accessToken}` },
        });
        if (oRes.status === 200) {
          const o = await safeJson(oRes);
          const id = o.id || o.ID;
          if (!id) continue;
          
          const delivery = o.delivery || o.DELIVERY || {};
          const customer = o.customer || o.CUSTOMER || {};
          const address = delivery?.deliveryAddress || delivery?.DELIVERYADDRESS || {};
          const coords = address?.coordinates || address?.COORDINATES || {};
          const totals = o.total || o.TOTAL || {};
          const paymentsArr = o.payments || o.PAYMENTS || [];
          const itemsArr = o.items || o.ITEMS || [];

          orders.push({
            id: id,
            displayId: o.displayId || o.DISPLAYID || id.slice(0, 8),
            customerName: customer?.name || customer?.NAME || "Cliente",
            customerPhone: customer?.phone?.number || customer?.PHONE?.NUMBER || "",
            address: formatAddress(address) || formatAddress(o.DELIVERY?.DELIVERYADDRESS) || "",
            lat: coords?.latitude || coords?.LATITUDE || 0,
            lng: coords?.longitude || coords?.LONGITUDE || 0,
            total: totals?.orderAmount || totals?.ORDERAMOUNT || 0,
            paymentMethod: paymentsArr?.[0]?.methods?.[0]?.type || paymentsArr?.[0]?.METHODS?.[0]?.TYPE || "ONLINE",
            items: itemsArr.map((i: any) => `${i.quantity || i.QUANTITY}x ${i.name || i.NAME}`).join(", ") || "",
            status: o.orderStatus || o.ORDERSTATUS || "CONFIRMED",
            createdAt: o.createdAt || o.CREATEDAT,
            deliveryCode: delivery?.deliveryCode || delivery?.DELIVERYCODE || "",
            raw: o,
          });
        } else { await oRes.text(); }
      } catch (err) { console.error(`Error fetching order ${orderId}:`, err); }
    }

    return new Response(JSON.stringify({ orders, eventsCount: events.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error?.message || "Unknown error";
    const isAuthError = message.includes("NOT_AUTHENTICATED");
    return new Response(JSON.stringify({ error: message, orders: [], needsAuth: isAuthError }), {
      status: isAuthError ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
