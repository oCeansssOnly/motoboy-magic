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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const accessToken = await getAccessToken();

    // Poll events
    const eventsRes = await fetch(`${IFOOD_API}/events/v1.0/events:polling`, {
      headers: { "Authorization": `Bearer ${accessToken}` },
    });

    let events: any[] = [];
    if (eventsRes.status === 200) {
      const parsed = await safeJson(eventsRes);
      if (Array.isArray(parsed)) events = parsed;
    } else {
      await eventsRes.text();
    }

    // Statuses we want to show in the restaurant queue
    const SHOW_STATUSES = ["ACCEPTED", "DISPATCHED", "READY_TO_PICKUP", "CONFIRMED"];
    // Delivery modes for restaurant's own fleet
    const OWN_DELIVERY_MODES = ["DEFAULT", "RESTAURANT", "OWN", "PADRAO"];

    const orders: any[] = [];
    const debug: any[] = [];
    const eventIdsToAck: string[] = [];
    const processedOrderIds = new Set<string>();

    for (const ev of events) {
      const orderId = ev.orderId;
      // Ack events without orderId
      if (!orderId) { eventIdsToAck.push(ev.id); continue; }
      // Deduplicate same orderId across multiple events
      if (processedOrderIds.has(orderId)) { eventIdsToAck.push(ev.id); continue; }

      try {
        const oRes = await fetch(`${IFOOD_API}/order/v1.0/orders/${orderId}`, {
          headers: { "Authorization": `Bearer ${accessToken}` },
        });

        if (oRes.status !== 200) { await oRes.text(); eventIdsToAck.push(ev.id); continue; }

        const o = await safeJson(oRes);
        const id = o?.id || o?.ID;
        if (!id) { eventIdsToAck.push(ev.id); continue; }

        let status = (o.orderStatus || o.ORDERSTATUS || "").toUpperCase();

        // iFood sandbox sends status in event code when order detail has empty orderStatus
        // CON = restaurant confirmed/accepted, DSP = dispatched, RTP = ready to pickup
        if (!status) {
          const evCodeMap: Record<string, string> = {
            "CON": "ACCEPTED", "ACK": "ACCEPTED", "ACCEPTED": "ACCEPTED",
            "DSP": "DISPATCHED", "DISPATCHED": "DISPATCHED",
            "DDCR": "DISPATCHED", // Driver/courier created = dispatched
            "RTP": "READY_TO_PICKUP",
          };
          const evCode = (ev.code || ev.fullCode || "").toUpperCase();
          status = evCodeMap[evCode] || "";
        }
        const delivery = o.delivery || o.DELIVERY || {};
        const deliveryMode = (delivery.mode || delivery.MODE || "").toUpperCase();
        const orderType = (o.orderType || o.ORDERTYPE || "DELIVERY").toUpperCase();

        // Always log for debug
        debug.push({ evCode: ev.code || ev.fullCode, status, deliveryMode, orderType, orderId });

        // Don't ack if order status not yet acceptable — will re-appear on next poll
        if (!SHOW_STATUSES.includes(status)) continue;

        // Ack-and-skip non-own-delivery orders
        if (orderType === "TAKEOUT" || orderType === "PICKUP") { eventIdsToAck.push(ev.id); continue; }
        if (deliveryMode && !OWN_DELIVERY_MODES.some(m => deliveryMode.includes(m))) {
          eventIdsToAck.push(ev.id); continue;
        }

        // This order is ready to show — ack and mark processed
        eventIdsToAck.push(ev.id);
        processedOrderIds.add(orderId);

        const customer = o.customer || o.CUSTOMER || {};
        const address = delivery.deliveryAddress || delivery.DELIVERYADDRESS || {};
        const coords = address.coordinates || address.COORDINATES || {};
        const totals = o.total || o.TOTAL || {};
        // payments can be an object { methods: [] } OR an array depending on API version
        const paymentsObj = o.payments || o.PAYMENTS || {};
        const paymentMethods = Array.isArray(paymentsObj) ? paymentsObj : (paymentsObj.methods || []);
        const itemsArr = o.items || o.ITEMS || [];

        const localizador = o.orderNumber || o.ORDERNUMBER || o.displayId || o.DISPLAYID || id.slice(0, 8);
        const displayId = o.displayId || o.DISPLAYID || id.slice(0, 8);
        const addressStr = [
          address.streetName || address.STREETNAME || "",
          address.streetNumber || address.STREETNUMBER || "",
          address.complement || address.COMPLEMENT || "",
          address.neighborhood || address.NEIGHBORHOOD || "",
          address.city || address.CITY || "",
          address.state || address.STATE || "",
        ].filter(Boolean).join(", ") || "Endereço não disponível";

        orders.push({
          id, displayId, localizador,
          customerName: customer.name || customer.NAME || "Cliente",
          customerPhone: customer.phone?.number || customer.PHONE?.NUMBER || "",
          address: addressStr,
          lat: coords.latitude || coords.LATITUDE || 0,
          lng: coords.longitude || coords.LONGITUDE || 0,
          total: totals.orderAmount || totals.ORDERAMOUNT || 0,
          paymentMethod: paymentMethods[0]?.type || paymentMethods[0]?.method || "ONLINE",
          items: itemsArr.map((i: any) => `${i.quantity || i.QUANTITY}x ${i.name || i.NAME}`).join(", ") || "",
          status,
          createdAt: o.createdAt || o.CREATEDAT,
          // pickupCode is the delivery confirmation code in iFood (required by courier to confirm delivery)
          deliveryCode: delivery.pickupCode || delivery.PICKUPCODE || delivery.deliveryCode || delivery.DELIVERYCODE || o.confirmationCode || "",
          raw: o,
        });

      } catch (err) {
        console.error(`Error fetching order ${orderId}:`, err);
        eventIdsToAck.push(ev.id);
      }
    }

    // Acknowledge only the events we've fully processed
    if (eventIdsToAck.length > 0) {
      await fetch(`${IFOOD_API}/events/v1.0/events/acknowledgment`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(eventIdsToAck.map((i: string) => ({ id: i }))),
      });
    }

    return new Response(JSON.stringify({ orders, eventsCount: events.length, debug }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    const message = error?.message || "Unknown error";
    const isAuthError = message.includes("NOT_AUTHENTICATED");
    return new Response(JSON.stringify({ error: message, orders: [], needsAuth: isAuthError }), {
      status: isAuthError ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
