import { createClient } from '@supabase/supabase-js';

const url = 'https://eyhdtiriqlnkmmlhclcr.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5aGR0aXJpcWxua21tbGhjbGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNDI5NDAsImV4cCI6MjA4NzkxODk0MH0.0Ni9j4nahrx6PxjABbA4mxY8ujijjZqtqyV3O_az9Lk';

const supabase = createClient(url, key);

async function fix() {
  const { data: conf } = await supabase.from('confirmed_orders').select('*').order('confirmed_at', { ascending: false }).limit(20);
  console.log("Found recent orders:");
  for (const c of conf || []) {
    if (c.order_total_cents === 0) {
      console.log(`Fixing ${c.ifood_order_id} (${c.customer_name}) to 500 cents...`);
      await supabase.from('confirmed_orders').update({ order_total_cents: 500 }).eq('ifood_order_id', c.ifood_order_id);
    }
  }
}
fix();
