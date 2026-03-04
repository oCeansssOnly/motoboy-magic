// patch-debug-logs.cjs — adds console.log to checkRouteOrdersStatus for debugging
const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'src', 'pages', 'Index.tsx');

let content = fs.readFileSync(filePath, 'utf8');

const OLD = `  const checkRouteOrdersStatus = useCallback(async () => {
    const snapshot = courierRoutesRef.current;
    const inRouteOrders = snapshot.flatMap(r =>
      r.orders.filter(o => !o.confirmed).map(o => ({ routeId: r.id, routeName: r.name, order: o }))
    );
    if (inRouteOrders.length === 0) return;
    try {
      const orderIds = inRouteOrders.map(x => x.order.id);
      const { data, error } = await supabase.functions.invoke("ifood-orders", {
        body: { action: "check_route_orders", orderIds },
      });
      if (error || !data?.results) return;
      const concluded = new Set();
      const cancelled = new Set();
      for (const r of data.results) {
        if (!r.terminal) continue;
        if (r.cancelled) cancelled.add(r.id);
        else concluded.add(r.id);
      }
      if (concluded.size === 0 && cancelled.size === 0) return;`;

const NEW = `  const checkRouteOrdersStatus = useCallback(async () => {
    const snapshot = courierRoutesRef.current;
    console.log('[checkRoute] running. routes:', snapshot.length, 'orders:', snapshot.flatMap(r=>r.orders).length);
    const inRouteOrders = snapshot.flatMap(r =>
      r.orders.filter(o => !o.confirmed).map(o => ({ routeId: r.id, routeName: r.name, order: o }))
    );
    console.log('[checkRoute] unconfirmed in-route orders:', inRouteOrders.map(x => x.order.id));
    if (inRouteOrders.length === 0) return;
    try {
      const orderIds = inRouteOrders.map(x => x.order.id);
      const { data, error } = await supabase.functions.invoke("ifood-orders", {
        body: { action: "check_route_orders", orderIds },
      });
      console.log('[checkRoute] edge fn result:', JSON.stringify({ error, results: data?.results }));
      if (error || !data?.results) return;
      const concluded = new Set();
      const cancelled = new Set();
      for (const r of data.results) {
        console.log('[checkRoute] order', r.id, '→ terminal:', r.terminal, 'cancelled:', r.cancelled, 'status:', r.status);
        if (!r.terminal) continue;
        if (r.cancelled) cancelled.add(r.id);
        else concluded.add(r.id);
      }
      console.log('[checkRoute] concluded:', [...concluded], 'cancelled:', [...cancelled]);
      if (concluded.size === 0 && cancelled.size === 0) return;`;

if (content.includes(OLD)) {
  content = content.replace(OLD, NEW);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ Debug logs added successfully');
} else {
  console.error('❌ Could not find target string in file');
  process.exit(1);
}
