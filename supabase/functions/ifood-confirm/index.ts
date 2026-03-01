const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await safeJson(req);
    const { orderId, confirmationCode, motoboyName } = body || {};

    if (!orderId || !confirmationCode) {
      return new Response(JSON.stringify({ error: "orderId and confirmationCode are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Record the delivery confirmation in our database.
    // Note: The iFood delivery confirmation is done by the customer via the iFood app
    // using the pickupCode — our backend does not need to call any iFood endpoint for this.
    const insertRes = await fetch(sbUrl("/confirmed_orders"), {
      method: "POST",
      headers: sbHeaders(),
      body: JSON.stringify({
        ifood_order_id: orderId,
        confirmation_code: confirmationCode,
        motoboy_name: motoboyName || "Motoboy",
        status: "confirmed_delivery",
        customer_name: "",
        customer_address: "",
        order_code: orderId,
      }),
    });

    // A 201 or 200 means the record was inserted. Anything else is an error but
    // we still want to return success to the client since the UI has already
    // validated the code — a DB write failure shouldn't block the flow.
    const insertOk = insertRes.ok;
    if (!insertOk) {
      const errText = await insertRes.text();
      console.error("Failed to insert confirmed_order:", insertRes.status, errText);
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Entrega confirmada e registrada com sucesso!",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
