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

    // Poll events — don't acknowledge yet; we'll only ack orders we actually process
    let events = [];
    if (eventsRes.status === 200) {
      const parsed = await safeJson(eventsRes);
      if (Array.isArray(parsed)) events = parsed;
    } else {
      await eventsRes.text();
    }

    const orderIds = events.map(e => e.orderId).filter(Boolean);
    const uniqueIds = [...new Set(orderIds)];
    const orders = [];

    // Statuses we want to show in the restaurant queue
    const SHOW_STATUSES = ["ACCEPTED", "DISPATCHED", "READY_TO_PICKUP"];
    // Delivery modes for restaurant's own fleet (not iFood partners or pickup)
    const OWN_DELIVERY_MODES = ["DEFAULT", "RESTAURANT", "OWN"];

    // Track which event IDs to acknowledge (only accepted-or-later orders)
    const eventIdsToAck: string[] = [];

    for (const event of events) {
      const orderId = event.orderId;
      if (!orderId) { eventIdsToAck.push(event.id); continue; } // ack non-order events
      if (!uniqueIds.includes(orderId)) continue;
      // Remove from uniqueIds to avoid double-processing
      uniqueIds.splice(uniqueIds.indexOf(orderId), 1);

      try {
        const oRes = await fetch(`${IFOOD_API}/order/v1.0/orders/${orderId}`, {
          headers: { "Authorization": `Bearer ${accessToken}` },
        });
        if (oRes.status === 200) {
          const o = await safeJson(oRes);
          const id = o.id || o.ID;
          if (!id) { eventIdsToAck.push(event.id); continue; }

          const status = (o.orderStatus || o.ORDERSTATUS || "").toUpperCase();

          // Skip orders not yet accepted — leave event un-acked so it reappears next poll
          if (!SHOW_STATUSES.includes(status)) continue;

          const delivery = o.delivery || o.DELIVERY || {};
          const deliveryMode = (delivery.mode || delivery.MODE || "").toUpperCase();

          // Only show own-delivery orders; skip pickup and partner delivery
          const orderType = (o.orderType || o.ORDERTYPE || "").toUpperCase();
          if (orderType === "TAKEOUT" || orderType === "PICKUP") { eventIdsToAck.push(event.id); continue; }
          if (deliveryMode && !OWN_DELIVERY_MODES.some(m => deliveryMode.includes(m))) {
            eventIdsToAck.push(event.id); continue;
          }

          // Mark this event as processed
          eventIdsToAck.push(event.id);

          const customer = o.customer || o.CUSTOMER || {};
          const address = delivery.deliveryAddress || delivery.DELIVERYADDRESS || {};
          const coords = address.coordinates || address.COORDINATES || {};
          const totals = o.total || o.TOTAL || {};
          const paymentsArr = o.payments || o.PAYMENTS || [];
          const itemsArr = o.items || o.ITEMS || [];

          const localizador = o.orderNumber || o.ORDERNUMBER || o.displayId || o.DISPLAYID || id.slice(0, 8);
          const displayId = o.displayId || o.DISPLAYID || id.slice(0, 8);

          const streetName = address.streetName || address.STREETNAME || "";
          const streetNum  = address.streetNumber || address.STREETNUMBER || "";
          const complement = address.complement || address.COMPLEMENT || "";
          const neighborhood = address.neighborhood || address.NEIGHBORHOOD || "";
          const city = address.city || address.CITY || "";
          const state = address.state || address.STATE || "";
          const addressStr = [streetName, streetNum, complement, neighborhood, city, state].filter(Boolean).join(", ") || "Endereço não disponível";

          orders.push({
            id,
            displayId,
            localizador,
            customerName: customer.name || customer.NAME || "Cliente",
            customerPhone: customer.phone?.number || customer.PHONE?.NUMBER || "",
            address: addressStr,
            lat: coords.latitude || coords.LATITUDE || 0,
            lng: coords.longitude || coords.LONGITUDE || 0,
            total: totals.orderAmount || totals.ORDERAMOUNT || 0,
            paymentMethod: paymentsArr[0]?.methods?.[0]?.type || paymentsArr[0]?.METHODS?.[0]?.TYPE || "ONLINE",
            items: itemsArr.map((i: any) => `${i.quantity || i.QUANTITY}x ${i.name || i.NAME}`).join(", ") || "",
            status,
            createdAt: o.createdAt || o.CREATEDAT,
            deliveryCode: delivery.deliveryCode || delivery.DELIVERYCODE || o.CONFIRMATIONTOKEN || o.confirmationToken || "",
            raw: o,
          });
        } else {
          await oRes.text();
          eventIdsToAck.push(event.id); // ack failed fetches to avoid infinite loops
        }
      } catch (err) {
        console.error(`Error fetching order ${event.orderId}:`, err);
        eventIdsToAck.push(event.id);
      }
    }

    // Only acknowledge events we've fully processed
    if (eventIdsToAck.length > 0) {
      await fetch(`${IFOOD_API}/events/v1.0/events/acknowledgment`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(eventIdsToAck.map(id => ({ id }))),
      });
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
