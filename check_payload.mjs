import { createClient } from '@supabase/supabase-js';

const url = 'https://eyhdtiriqlnkmmlhclcr.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5aGR0aXJpcWxua21tbGhjbGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNDI5NDAsImV4cCI6MjA4NzkxODk0MH0.0Ni9j4nahrx6PxjABbA4mxY8ujijjZqtqyV3O_az9Lk';

const supabase = createClient(url, key);

async function check() {
  const { data } = await supabase.from('order_status_events').select('order_data').order('created_at', { ascending: false }).limit(5);
  
  if (data && data.length > 0) {
    for (const d of data) {
      if (d.order_data?.raw) {
         console.log('Order: ', d.order_data.id);
         console.log(JSON.stringify(d.order_data.raw.total, null, 2));
         console.log(JSON.stringify(d.order_data.raw.delivery, null, 2));
      } else {
         console.log('Order without raw data', d);
      }
    }
  } else {
    // Try confirmed_orders
    const { data: conf } = await supabase.from('confirmed_orders').select('*').order('confirmed_at', { ascending: false }).limit(2);
    console.log("Confirmed: ", conf);
  }
}
check();
