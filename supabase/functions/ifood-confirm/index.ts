import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { orderId, confirmationCode, motoboyName } = await req.json();
    
    if (!orderId || !confirmationCode) {
      return new Response(JSON.stringify({ error: 'orderId and confirmationCode are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = await getAccessToken();
    
    // Try to dispatch the order (confirm delivery)
    let apiSuccess = false;
    let apiMessage = '';
    
    try {
      // Try dispatch endpoint
      const dispatchRes = await fetch(`${IFOOD_API}/order/v1.0/orders/${orderId}/dispatch`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (dispatchRes.ok || dispatchRes.status === 202) {
        apiSuccess = true;
        apiMessage = 'Pedido despachado com sucesso via API iFood';
        await dispatchRes.text();
      } else {
        const errorText = await dispatchRes.text();
        apiMessage = `API iFood retornou ${dispatchRes.status}: ${errorText}`;
      }
    } catch (err) {
      apiMessage = `Erro ao chamar API: ${err instanceof Error ? err.message : 'Unknown'}`;
    }

    // Save confirmation to database regardless
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error: dbError } = await supabase
      .from('confirmed_orders')
      .insert({
        ifood_order_id: orderId,
        confirmation_code: confirmationCode,
        motoboy_name: motoboyName || 'Motoboy',
        status: apiSuccess ? 'confirmed_api' : 'confirmed_manual',
        customer_name: '',
        customer_address: '',
        order_code: orderId,
      });

    if (dbError) {
      console.error('DB error:', dbError);
    }

    return new Response(JSON.stringify({
      success: true,
      apiConfirmed: apiSuccess,
      message: apiSuccess 
        ? 'Entrega confirmada automaticamente via iFood!' 
        : 'Confirmação salva localmente. Confirme manualmente no painel do iFood.',
      details: apiMessage,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
