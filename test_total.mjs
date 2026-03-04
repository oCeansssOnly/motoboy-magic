import { createClient } from '@supabase/supabase-js';

const url = 'https://eyhdtiriqlnkmmlhclcr.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5aGR0aXJpcWxua21tbGhjbGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNDI5NDAsImV4cCI6MjA4NzkxODk0MH0.0Ni9j4nahrx6PxjABbA4mxY8ujijjZqtqyV3O_az9Lk';
const sb = createClient(url, key);

async function run() {
  const { data: conf } = await sb.from('confirmed_orders').select('ifood_order_id').order('confirmed_at', { ascending: false }).limit(2);
  const targetId = conf?.[0]?.ifood_order_id;
  if (!targetId) return;

  const { data: tokens } = await sb.from('ifood_tokens').select('*').order('created_at', { ascending: false }).limit(1);
  let token = tokens?.[0]?.access_token;
  
  const res = await fetch(`https://merchant-api.ifood.com.br/order/v1.0/orders/${targetId}`, {
     headers: { "Authorization": `Bearer ${token}` }
  });
  const data = await res.json();
  if (data.message === "token expired") {
      console.log("Token expired, cannot fetch without full auth refresh");
      // Read order_status_events where order_id = targetId and status='concluded'
      const { data: evs } = await sb.from('order_status_events').select('*').eq('order_id', targetId);
      console.log("Logged Event:", JSON.stringify(evs, null, 2));
      return;
  }
  
  console.log("=== FULL PAYLOAD ===");
  console.log(JSON.stringify(data.total || data, null, 2));
}
run();
