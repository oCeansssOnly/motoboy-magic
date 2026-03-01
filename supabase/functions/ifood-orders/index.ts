import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const IFOOD_API = 'https://merchant-api.ifood.com.br';
const IFOOD_AUTH_URL = 'https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token';

/** Safely read a response body as text and parse as JSON.
 *  Returns null if the body is empty or not valid JSON. */
async function safeJson(res: Response): Promise<any> {
  let text = '';
  try {
    text = await res.text();
    if (!text || !text.trim()) return null;
    return JSON.parse(text);
  } catch {
    console.error(`safeJson parse error (status ${res.status}): ${text.slice(0, 200)}`);
    return null;
  }
}

async function getAccessToken(supabase: any): Promise<string> {
  const clientId = Deno.env.get('IFOOD_CLIENT_ID')!;
  const clientSecret = Deno.env.get('IFOOD_CLIENT_SECRET')!;

  const { data: tokens } = await supabase
    .from('ifood_tokens')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);

  if (!tokens || tokens.length === 0) {
    throw new Error('NOT_AUTHENTICATED: Configure a autenticação iFood primeiro.');
  }

  const token = tokens[0];
  const isExpired = new Date(token.expires_at) < new Date();

  if (!isExpired) {
    return token.access_token;
  }

  // Refresh token
  const res = await fetch(IFOOD_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grantType: 'refresh_token',
      clientId,
      clientSecret,
      refreshToken: token.refresh_token,
    }),
  });

  const data = await safeJson(res);

  if (!res.ok || !data) {
    throw new Error(`Token refresh failed [${res.status}]: ${JSON.stringify(data)}`);
  }

  if (!data.accessToken) {
    throw new Error(`NOT_AUTHENTICATED: Token de refresh expirado ou inválido. Reautentique o iFood.`);
  }

  await supabase.from('ifood_tokens').update({
    access_token: data.accessToken,
    refresh_token: data.refreshToken || token.refresh_token,
    expires_at: new Date(Date.now() + (data.expiresIn || 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', token.id);

  return data.accessToken;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const accessToken = await getAccessToken(supabase);

    // 1. Poll events
    const eventsRes = await fetch(`${IFOOD_API}/events/v1.0/events:polling`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    let events: any[] = [];

    if (eventsRes.status === 200) {
      const parsed = await safeJson(eventsRes);
      if (Array.isArray(parsed)) {
        events = parsed;
      }

      // Acknowledge events
      if (events.length > 0) {
        await fetch(`${IFOOD_API}/events/v1.0/events/acknowledgment`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(events.map((e: any) => ({ id: e.id }))),
        });
      }
    } else {
      // 204 = no events (normal), anything else = log it
      const body = await eventsRes.text();
      if (eventsRes.status !== 204 && eventsRes.status !== 202) {
        console.log(`Events polling: ${eventsRes.status}: ${body}`);
      }
    }

    // 2. Get order IDs from events (PLACED, CONFIRMED, READY_TO_PICKUP)
    const orderIds = events
      .filter((e: any) => ['PLC', 'CFM', 'RTP', 'PLACED', 'CONFIRMED', 'READY_TO_PICKUP'].includes(e.code || e.fullCode))
      .map((e: any) => e.orderId);

    const uniqueOrderIds = [...new Set(orderIds)] as string[];
    const orders: any[] = [];

    for (const orderId of uniqueOrderIds) {
      try {
        const orderRes = await fetch(`${IFOOD_API}/order/v1.0/orders/${orderId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (orderRes.status === 200) {
          const order = await safeJson(orderRes);
          if (!order || !order.id) continue;

          orders.push({
            id: order.id,
            displayId: order.displayId || order.id.slice(0, 8),
            customerName: order.customer?.name || 'Cliente',
            customerPhone: order.customer?.phone?.number || '',
            address: formatAddress(order.delivery?.deliveryAddress),
            lat: order.delivery?.deliveryAddress?.coordinates?.latitude || 0,
            lng: order.delivery?.deliveryAddress?.coordinates?.longitude || 0,
            total: order.total?.orderAmount || 0,
            paymentMethod: order.payments?.[0]?.methods?.[0]?.type || 'ONLINE',
            items: order.items?.map((i: any) => `${i.quantity}x ${i.name}`).join(', ') || '',
            status: order.orderStatus || 'CONFIRMED',
            createdAt: order.createdAt,
            deliveryCode: order.delivery?.deliveryCode || '',
          });
        } else {
          const body = await orderRes.text();
          console.log(`Order ${orderId} returned ${orderRes.status}: ${body}`);
        }
      } catch (err) {
        console.error(`Error fetching order ${orderId}:`, err);
      }
    }

    return new Response(JSON.stringify({ orders, eventsCount: events.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isAuthError = message.includes('NOT_AUTHENTICATED');
    return new Response(JSON.stringify({
      error: message,
      orders: [],
      needsAuth: isAuthError,
    }), {
      status: isAuthError ? 200 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function formatAddress(addr: any): string {
  if (!addr) return 'Endereço não disponível';
  return [addr.streetName, addr.streetNumber, addr.complement, addr.neighborhood, addr.city, addr.state]
    .filter(Boolean).join(', ') || 'Endereço não disponível';
}
