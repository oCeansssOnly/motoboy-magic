// fix-check-route-fn.cjs — replaces the checkRouteOrdersStatus function in Index.tsx
const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'src', 'pages', 'Index.tsx');

let content = fs.readFileSync(filePath, 'utf8');

// Find the function boundaries by line
const lines = content.split('\n');
let startLine = -1, endLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Direct status polling for in-route orders')) startLine = i - 0;
  if (startLine > -1 && lines[i].includes('}, [storeLat, storeLng, cleanupEmptyRoutes]);') && i > startLine) {
    endLine = i;
    break;
  }
}

if (startLine === -1 || endLine === -1) {
  console.error('❌ Could not find function boundaries. startLine:', startLine, 'endLine:', endLine);
  process.exit(1);
}

console.log(`Found block at lines ${startLine+1}–${endLine+1}`);

const newBlock = `  // Keep courierRoutesRef in sync with state
  useEffect(() => { courierRoutesRef.current = courierRoutes; }, [courierRoutes]);

  // ── Direct status polling for in-route orders ─────────────────────────────
  // Clean async function — reads from ref, single setCourierRoutes call, no nesting.
  const checkRouteOrdersStatus = useCallback(async () => {
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
      if (concluded.size === 0 && cancelled.size === 0) return;
      setCourierRoutes(routes => {
        const updated = routes.map(route => ({
          ...route,
          orders: route.orders.map(o => {
            if (concluded.has(o.id) && !o.confirmed) {
              const distKm = haversineKm(storeLat, storeLng, o.lat || storeLat, o.lng || storeLng) * 2;
              supabase.from("confirmed_orders").upsert({
                ifood_order_id: o.id, customer_name: o.customerName,
                customer_address: o.address, motoboy_name: route.name,
                status: "concluded_by_ifood",
                distance_km: Math.round(distKm * 10) / 10,
                order_total_cents: o.total,
                delivery_lat: o.lat || storeLat, delivery_lng: o.lng || storeLng,
              }, { onConflict: "ifood_order_id" }).then(() => {});
              supabase.from("pending_orders").delete().eq("id", o.id).then(() => {});
              return { ...o, confirmed: true };
            }
            if (cancelled.has(o.id) && !o.confirmed) {
              supabase.from("pending_orders").delete().eq("id", o.id).then(() => {});
              return { ...o, confirmed: true, cancelled: true };
            }
            return o;
          }),
        }));
        const cleaned = cleanupEmptyRoutes(updated);
        routes.filter(r => !cleaned.some(c => c.id === r.id))
          .forEach(r => (supabase).from("courier_routes").delete().eq("id", r.id).then(() => {}));
        if (concluded.size > 0) toast.info(\`\${concluded.size} pedido(s) finalizado(s) pelo iFood.\`, { duration: 5000 });
        if (cancelled.size > 0) toast.warning(\`\${cancelled.size} pedido(s) cancelado(s) pelo iFood.\`, { duration: 5000 });
        return cleaned;
      });
    } catch { /* silent */ }
  }, [storeLat, storeLng, cleanupEmptyRoutes]);`;

// Replace the block
const before = lines.slice(0, startLine).join('\n');
const after = lines.slice(endLine + 1).join('\n');
const newContent = before + '\n' + newBlock + '\n' + after;

fs.writeFileSync(filePath, newContent, 'utf8');
console.log('✅ Done! Replaced lines', startLine+1, 'to', endLine+1);
