import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const IFOOD_API = 'https://merchant-api.ifood.com.br';

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get('IFOOD_CLIENT_ID');
  const clientSecret = Deno.env.get('IFOOD_CLIENT_SECRET');
  
  if (!clientId || !clientSecret) {
    throw new Error('iFood credentials not configured');
  }

  const response = await fetch('https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grantType: 'client_credentials',
      clientId,
      clientSecret,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Auth failed [${response.status}]: ${error}`);
  }

  const data = await response.json();
  return data.accessToken;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const token = await getAccessToken();
    const merchantId = Deno.env.get('IFOOD_MERCHANT_ID');
    
    if (!merchantId) {
      throw new Error('IFOOD_MERCHANT_ID not configured');
    }

    // 1. Poll events
    const eventsRes = await fetch(`${IFOOD_API}/events/v1.0/events:polling`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    let events: any[] = [];
    if (eventsRes.ok) {
      events = await eventsRes.json();
      
      // Acknowledge events
      if (events.length > 0) {
        await fetch(`${IFOOD_API}/events/v1.0/events/acknowledgment`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(events.map((e: any) => ({ id: e.id }))),
        });
      }
    } else {
      const text = await eventsRes.text();
      console.log(`Events polling returned ${eventsRes.status}: ${text}`);
    }

    // 2. Get confirmed/accepted order IDs from events
    const confirmedOrderIds = events
      .filter((e: any) => e.code === 'CFM' || e.code === 'PLC' || e.code === 'RTP')
      .map((e: any) => e.orderId);

    // Also try to get orders directly from the merchant
    // Fetch details for each order
    const orders: any[] = [];
    
    // Get unique order IDs
    const uniqueOrderIds = [...new Set(confirmedOrderIds)] as string[];
    
    for (const orderId of uniqueOrderIds) {
      try {
        const orderRes = await fetch(`${IFOOD_API}/order/v1.0/orders/${orderId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        
        if (orderRes.ok) {
          const order = await orderRes.json();
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
          await orderRes.text(); // consume body
        }
      } catch (err) {
        console.error(`Error fetching order ${orderId}:`, err);
      }
    }

    return new Response(JSON.stringify({ orders, events: events.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message, orders: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function formatAddress(addr: any): string {
  if (!addr) return 'Endereço não disponível';
  const parts = [
    addr.streetName,
    addr.streetNumber,
    addr.complement,
    addr.neighborhood,
    addr.city,
    addr.state,
  ].filter(Boolean);
  return parts.join(', ') || 'Endereço não disponível';
}
