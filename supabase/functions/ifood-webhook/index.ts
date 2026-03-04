const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ifood-signature",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function sbHeaders() {
  return {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
  };
}
function sbUrl(p: string) { return `${SUPABASE_URL}/rest/v1${p}`; }

const TERMINAL_STATUSES = new Set(["CONCLUDED", "CANCELLED", "CANCELLATION_REQUESTED", "CONSUMER_CANCELLED", "CLOSED"]);
const CANCELLED_STATUSES = new Set(["CANCELLED", "CANCELLATION_REQUESTED", "CONSUMER_CANCELLED"]);

// iFood sends webhook events as POST with JSON body.
// Each event has: orderId, orderStatus, eventType, etc.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // iFood webhooks always POST
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body) return new Response("Bad Request", { status: 400, headers: corsHeaders });

    // iFood webhook payload may be a single event or an array
    const events: any[] = Array.isArray(body) ? body : [body];

    const statusEvents: any[] = [];

    for (const ev of events) {
      // iFood sends different field names depending on API version
      const orderId = ev.orderId || ev.id || ev.order_id;
      const status = (ev.orderStatus || ev.status || ev.eventType || ev.code || "").toUpperCase();

      if (!orderId || !status) continue;

      console.log(`[ifood-webhook] orderId=${orderId} status=${status}`);

      if (CANCELLED_STATUSES.has(status) || status === "CANCELLED" || status === "CAN" || status === "CAR") {
        statusEvents.push({ order_id: orderId, status: "cancelled", order_data: null });
      } else if (status === "CONCLUDED" || status === "DELIVERED" || status === "COR" || status === "CDD" || status === "CON") {
        // Extract delivery details for stats if available
        const orderData = {
          id: orderId,
          displayId: ev.displayId || ev.shortReference || orderId.slice(0, 8),
          customerName: ev.customer?.name || "Cliente",
          address: ev.deliveryAddress || "",
          lat: ev.deliveryAddress?.coordinates?.latitude || 0,
          lng: ev.deliveryAddress?.coordinates?.longitude || 0,
          total: ev.total?.orderAmount || 0,
        };
        statusEvents.push({ order_id: orderId, status: "concluded", order_data: orderData });
      }
      // Other status transitions (DISPATCHED, CONFIRMED, etc.) — no action needed here
    }

    // Publish to order_status_events so all Realtime subscribers react instantly
    if (statusEvents.length > 0) {
      await fetch(sbUrl("/order_status_events"), {
        method: "POST",
        headers: sbHeaders(),
        body: JSON.stringify(statusEvents),
      });
      console.log(`[ifood-webhook] Published ${statusEvents.length} status event(s)`);
    }

    return new Response(JSON.stringify({ received: events.length, published: statusEvents.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[ifood-webhook] Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
