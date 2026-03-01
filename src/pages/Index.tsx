import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { OrderCard } from "@/components/OrderCard";
import { IFoodSetup } from "@/components/IFoodSetup";
import { CourierTab } from "@/components/CourierTab";
import { AssignCourierModal } from "@/components/AssignCourierModal";
import { AuthGate } from "@/pages/AuthGate";
import { ProfileMenu } from "@/components/ProfileMenu";
import { HoldTransferModal } from "@/components/HoldTransferModal";
import { useAuth } from "@/contexts/AuthContext";
import { useTransferRequests } from "@/hooks/useTransferRequests";
import { IFoodOrder, CourierRoute, optimizeRoute, generateGoogleMapsUrl } from "@/lib/types";
import {
  Navigation,
  RefreshCw,
  Route,
  MapPin,
  Copy,
  Check,
  Loader2,
  Package,
  AlertCircle,
  Bike,
  Radio,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const POLL_INTERVAL = 30_000;
const LS_ROUTES_KEY = "courier_routes_v1";
const LS_STORE_KEY = "store_coords_v1";
const LS_DISMISSED_KEY = "dismissed_order_ids_v1";
const LS_ADDRESS_KEY = "store_address_v1";

/** Haversine distance in km between two lat/lng points */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function loadRoutesFromStorage(): CourierRoute[] {
  try {
    const raw = localStorage.getItem(LS_ROUTES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRoutesToStorage(routes: CourierRoute[]) {
  localStorage.setItem(LS_ROUTES_KEY, JSON.stringify(routes));
}

function loadDismissedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_DISMISSED_KEY);
    return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
  } catch {
    return new Set<string>();
  }
}

function saveDismissedIds(ids: Set<string>) {
  localStorage.setItem(LS_DISMISSED_KEY, JSON.stringify([...ids]));
}

const Index = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, isApproved, isAdmin, isDriver, driver } = useAuth();
  const [driverStats, setDriverStats] = useState({ total: 0, thisMonth: 0 });
  const [orders, setOrders] = useState<IFoodOrder[]>([]);
  const [courierRoutes, setCourierRoutes] = useState<CourierRoute[]>(loadRoutesFromStorage);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"queue" | string>("queue"); // "queue" | routeId
  const [showAssignModal, setShowAssignModal] = useState(false);
  // Track order IDs that have been assigned to a motoboy so they never
  // re-appear in the main queue when iFood emits subsequent events for them.
  const [dismissedOrderIds, setDismissedOrderIds] = useState<Set<string>>(loadDismissedIds);
  // Ref mirrors the state so mergeOrders can read the CURRENT dismissed set
  // without stale-closure or nested-setState issues.
  const dismissedIdsRef = useRef<Set<string>>(dismissedOrderIds);

  const [assigning, setAssigning] = useState(false);
  const [storeAddress, setStoreAddress] = useState<string | null>(
    () => localStorage.getItem(LS_ADDRESS_KEY) || null
  );

  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [storeLat, setStoreLat] = useState<number>(() => {
    try { return JSON.parse(localStorage.getItem(LS_STORE_KEY) || "null")?.lat ?? -23.55052; } catch { return -23.55052; }
  });
  const [storeLng, setStoreLng] = useState<number>(() => {
    try { return JSON.parse(localStorage.getItem(LS_STORE_KEY) || "null")?.lng ?? -46.633308; } catch { return -46.633308; }
  });

  // ── Transfer request (approved: add order to my route) ─────────────────────
  const handleOrderApproved = useCallback((order: IFoodOrder, gpsLat: number, gpsLng: number) => {
    if (!driver) return;
    setCourierRoutes(prev => {
      const destIdx = prev.findIndex(r => r.name.toLowerCase() === driver.name.toLowerCase());
      if (destIdx >= 0) {
        const updated = [...prev];
        updated[destIdx] = { ...updated[destIdx], startLat: gpsLat, startLng: gpsLng, orders: [...updated[destIdx].orders, order] };
        return updated;
      }
      const newRoute: CourierRoute = { id: crypto.randomUUID(), name: driver.name, orders: [order], startLat: gpsLat, startLng: gpsLng, createdAt: new Date().toISOString() };
      return [...prev, newRoute];
    });
    toast.success("Pedido transferido com sucesso! Confira sua rota.");
  }, [driver]);

  const { incomingRequest, outgoingPending, requestTransfer, approveIncoming, rejectIncoming } = useTransferRequests({
    myName: isDriver ? (driver?.name ?? null) : null,
    onOrderApproved: handleOrderApproved,
    storeLat,
    storeLng,
  });

  const [needsAuth, setNeedsAuth] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Persist store coords
  useEffect(() => {
    localStorage.setItem(LS_STORE_KEY, JSON.stringify({ lat: storeLat, lng: storeLng }));
  }, [storeLat, storeLng]);

  // Persist courier routes
  useEffect(() => {
    saveRoutesToStorage(courierRoutes);
  }, [courierRoutes]);

  // Persist dismissed order IDs
  useEffect(() => {
    saveDismissedIds(dismissedOrderIds);
  }, [dismissedOrderIds]);

  // Check auth on load
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("ifood-auth", { body: { action: "check_status" } });
        setNeedsAuth(!data?.authenticated);
      } catch {
        setNeedsAuth(true);
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, []);

  // Load persisted orders from DB on mount (fixes refresh/logout order loss)
  // This runs once after auth is confirmed — pulls the pending_orders table which
  // the edge function keeps in sync with iFood events.
  const loadPersistedOrders = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("pending_orders")
        .select("id,display_id,localizador,customer_name,customer_phone,customer_address,lat,lng,total,payment_method,items,status,created_at,delivery_code")
        .order("received_at", { ascending: true });

      if (!data || data.length === 0) return;

      const mapped: IFoodOrder[] = data.map(r => ({
        id: r.id,
        displayId: r.display_id ?? r.id.slice(0, 8),
        localizador: r.localizador ?? "",
        customerName: r.customer_name ?? "Cliente",
        customerPhone: r.customer_phone ?? "",
        address: r.customer_address ?? "Endereço não disponível",
        lat: r.lat ?? 0,
        lng: r.lng ?? 0,
        total: r.total ?? 0,
        paymentMethod: r.payment_method ?? "ONLINE",
        items: r.items ?? "",
        status: r.status ?? "ACCEPTED",
        createdAt: r.created_at ?? new Date().toISOString(),
        deliveryCode: r.delivery_code ?? "",
        selected: false,
        confirmed: false,
        confirmationCode: "",
      }));

      setOrders(prev => {
        const dismissed = dismissedIdsRef.current;
        const existing = new Map(prev.map(o => [o.id, o]));
        mapped.forEach(o => {
          if (!dismissed.has(o.id) && !existing.has(o.id)) existing.set(o.id, o);
        });
        return Array.from(existing.values());
      });
    } catch { /* silent — edge function poll will populate on next refresh */ }
  }, []);

  // Driver delivery stats (for ProfileMenu)
  useEffect(() => {
    if (!isDriver || !driver) { setDriverStats({ total: 0, thisMonth: 0 }); return; }
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    supabase
      .from("confirmed_orders")
      .select("confirmed_at")
      .eq("motoboy_name", driver.name)
      .then(({ data }) => {
        const all = data || [];
        setDriverStats({
          total: all.length,
          thisMonth: all.filter(o => o.confirmed_at >= monthStart).length,
        });
      });
  }, [isDriver, driver]);

  // Merge new orders without wiping existing local state.
  // Uses ref so it always sees the current dismissed set — no nested setState.
  const mergeOrders = useCallback((freshOrders: IFoodOrder[]) => {
    setOrders((prev) => {
      const dismissed = dismissedIdsRef.current;
      const existing = new Map(prev.map((o) => [o.id, o]));
      let added = 0;
      freshOrders.forEach((fresh) => {
        if (dismissed.has(fresh.id)) return; // skip assigned/dismissed orders
        if (!existing.has(fresh.id)) {
          existing.set(fresh.id, { ...fresh, selected: false, confirmed: false, confirmationCode: "" });
          added++;
        }
      });
      if (added > 0) {
        toast.success(`🆕 ${added} novo(s) pedido(s) chegaram!`, { duration: 5000 });
      }
      return Array.from(existing.values());
    });
  }, []);

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setPolling(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("ifood-orders");
      if (data?.needsAuth) { setNeedsAuth(true); return; }
      if (fnError) throw fnError;
      if (data?.orders && Array.isArray(data.orders)) {
        // Capture + persist store address from real iFood merchant data
        if (data.merchantAddress) {
          setStoreAddress(data.merchantAddress);
          localStorage.setItem(LS_ADDRESS_KEY, data.merchantAddress);
        }
        // Use store coords from iFood if none set
        if (data.storeLat && data.storeLng) {
          setStoreLat(prev => prev === -23.55052 ? data.storeLat : prev);
          setStoreLng(prev => prev === -46.633308 ? data.storeLng : prev);
        }
        // Only toast 'orders processed' during non-silent loads (manual refresh)
        mergeOrders(data.orders);
        if (!silent && data.orders.length > 0) {
          toast.success(`${data.orders.length} pedido(s) processado(s)`);
        }
      } else if (data?.error) {
        if (!silent) { setError(data.error); toast.error("Erro ao buscar pedidos", { description: data.error }); }
      }

      // ── Sync concluded orders (finished outside our site) ──────────────────
      if (Array.isArray(data?.concludedOrders) && data.concludedOrders.length > 0) {
        const concluded = data.concludedOrders as { id: string; displayId: string; customerName: string; address: string; lat: number; lng: number; total: number }[];
        setCourierRoutes(prev => {
          const updated = prev.map(route => {
            const toFinalize = route.orders.filter(o => concluded.some(c => c.id === o.id));
            if (toFinalize.length === 0) return route;
            // Save each concluded order to DB
            toFinalize.forEach(async order => {
              const cInfo = concluded.find(c => c.id === order.id)!;
              const distKm = haversineKm(storeLat, storeLng, cInfo.lat || order.lat, cInfo.lng || order.lng) * 2;
              await supabase.from("confirmed_orders").insert({
                ifood_order_id: order.id,
                customer_name: order.customerName,
                customer_address: order.address,
                motoboy_name: route.name,
                status: "concluded_by_ifood",
                distance_km: Math.round(distKm * 10) / 10,
                order_total_cents: order.total,
                delivery_lat: cInfo.lat || order.lat,
                delivery_lng: cInfo.lng || order.lng,
              });
            });
            return { ...route, orders: route.orders.filter(o => !concluded.some(c => c.id === o.id)) };
          }).filter(r => r.orders.length > 0);
          return updated;
        });
        toast.info(`${data.concludedOrders.length} pedido(s) finalizado(s) pelo iFood e removido(s) das rotas.`, { duration: 6000 });
      }

      // ── Remove cancelled orders from routes ─────────────────────────────────
      if (Array.isArray(data?.cancelledOrderIds) && data.cancelledOrderIds.length > 0) {
        const cancelled = new Set<string>(data.cancelledOrderIds);
        setCourierRoutes(prev =>
          prev.map(r => ({ ...r, orders: r.orders.filter(o => !cancelled.has(o.id)) }))
            .filter(r => r.orders.length > 0)
        );
        setOrders(prev => prev.filter(o => !cancelled.has(o.id)));
        toast.warning(`${data.cancelledOrderIds.length} pedido(s) cancelado(s) removido(s).`, { duration: 5000 });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      if (!silent) { setError(msg); toast.error("Erro ao conectar com iFood"); }
    } finally {
      setLoading(false);
      setPolling(false);
    }
  }, [mergeOrders]);

  // Initial fetch + polling
  useEffect(() => {
    if (needsAuth || checkingAuth) return;
    fetchOrders(false);
    pollingRef.current = setInterval(() => fetchOrders(true), POLL_INTERVAL);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [needsAuth, checkingAuth, fetchOrders]);

  // Load persisted orders on auth confirmed, then start polling
  useEffect(() => {
    if (needsAuth || checkingAuth) return;
    loadPersistedOrders();
    fetchOrders(false);
    pollingRef.current = setInterval(() => fetchOrders(true), POLL_INTERVAL);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [needsAuth, checkingAuth, fetchOrders, loadPersistedOrders]);

  // ── Selection ──
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const unconfirmed = orders.filter((o) => !o.confirmed);
    setSelectedIds(selectedIds.size === unconfirmed.length ? new Set() : new Set(unconfirmed.map((o) => o.id)));
  };

  const selectedOrders = orders.filter((o) => selectedIds.has(o.id));
  const optimizedRoute = optimizeRoute(selectedOrders, storeLat, storeLng);

  const openRoute = () => {
    if (selectedOrders.length === 0) { toast.error("Selecione pelo menos um pedido"); return; }
    window.open(generateGoogleMapsUrl(optimizedRoute, storeLat, storeLng), "_blank");
  };

  const copyRoute = () => {
    if (selectedOrders.length === 0) return;
    const url = generateGoogleMapsUrl(optimizedRoute, storeLat, storeLng);
    const desc = optimizedRoute.map((o, i) => `${i + 1}. ${o.customerName} – ${o.address}`).join("\n");
    navigator.clipboard.writeText(`ROTA DE ENTREGAS (${optimizedRoute.length} paradas)\n${"─".repeat(40)}\n${desc}\n${"─".repeat(40)}\n🗺️ ${url}`);
    setCopied(true);
    toast.success("Rota copiada!");
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Courier route assignment ──
  const handleAssignCourier = async (courierName: string) => {
    if (selectedOrders.length === 0) return;
    setAssigning(true);
    setShowAssignModal(false);

    // Dispatch all selected orders via iFood API.
    // Note: supabase.functions.invoke() always resolves (never rejects) —
    // errors are returned in data.error, not as promise rejections.
    const dispatchResults = await Promise.all(
      selectedOrders.map((o) =>
        supabase.functions.invoke("ifood-dispatch", { body: { orderId: o.id } })
          .then(({ data, error }) => ({
            orderId: o.id,
            ok: !!data?.success && !error,
            message: error?.message || data?.message || "",
          }))
      )
    );
    const failedDispatches = dispatchResults.filter((r) => !r.ok);
    if (failedDispatches.length > 0) {
      toast.warning(
        `${failedDispatches.length} pedido(s) não despachado(s) via API.`,
        { description: failedDispatches.map(r => r.message).filter(Boolean).join("; ") || "Verifique o painel iFood." }
      );
    } else {
      toast.success(`${dispatchResults.length} pedido(s) despachado(s) via iFood!`);
    }

    // Mark orders as DISPATCHED locally so the confirmation section appears
    const ordersToAssign = selectedOrders.map((o) => ({ ...o, confirmed: false, status: "DISPATCHED" }));
    let assignedRouteId = "";

    setCourierRoutes((prev) => {
      const existingRouteIndex = prev.findIndex(r => r.name.toLowerCase() === courierName.toLowerCase());
      if (existingRouteIndex >= 0) {
        const newRoutes = [...prev];
        const existingRoute = newRoutes[existingRouteIndex];
        const existingOrderIds = new Set(existingRoute.orders.map(o => o.id));
        const newUniqueOrders = ordersToAssign.filter(o => !existingOrderIds.has(o.id));
        newRoutes[existingRouteIndex] = { ...existingRoute, orders: [...existingRoute.orders, ...newUniqueOrders] };
        assignedRouteId = existingRoute.id;
        return newRoutes;
      } else {
        const newRoute: CourierRoute = {
          id: crypto.randomUUID(),
          name: courierName,
          orders: ordersToAssign,
          createdAt: new Date().toISOString(),
        };
        assignedRouteId = newRoute.id;
        return [...prev, newRoute];
      }
    });

    // Dismiss all assigned order IDs — update both ref and state atomically
    const assignedIds = new Set(selectedOrders.map((o) => o.id));
    const nextDismissed = new Set(dismissedIdsRef.current);
    assignedIds.forEach((id) => nextDismissed.add(id));
    dismissedIdsRef.current = nextDismissed;
    setDismissedOrderIds(nextDismissed);
    saveDismissedIds(nextDismissed);

    setOrders((prev) => prev.filter((o) => !assignedIds.has(o.id)));
    setSelectedIds(new Set());
    setAssigning(false);
    if (assignedRouteId) setActiveTab(assignedRouteId);
    toast.success(`${ordersToAssign.length} pedido(s) atribuído(s) para ${courierName}!`);
  };

  const handleCloseCourierRoute = (routeId: string) => {
    const routeToClose = courierRoutes.find((r) => r.id === routeId);
    if (routeToClose) {
      // Only un-dismiss UNCONFIRMED orders when closing a route.
      // Confirmed/delivered orders must stay dismissed so late iFood events
      // (e.g. a delayed CONCLUDED event) never bring them back into the queue.
      const toUndismiss = routeToClose.orders
        .filter((o) => !o.confirmed)
        .map((o) => o.id);
      if (toUndismiss.length > 0) {
        const nextDismissed = new Set(dismissedIdsRef.current);
        toUndismiss.forEach((id) => nextDismissed.delete(id));
        dismissedIdsRef.current = nextDismissed;
        setDismissedOrderIds(nextDismissed);
        saveDismissedIds(nextDismissed);
      }
    }
    setCourierRoutes((prev) => prev.filter((r) => r.id !== routeId));
    setActiveTab("queue");
    toast.info("Rota encerrada.");
  };

  const handleOrderConfirmed = (routeId: string, orderId: string, code: string) => {
    setCourierRoutes((prev) =>
      prev.map((r) =>
        r.id === routeId
          ? { ...r, orders: r.orders.map((o) => o.id === orderId ? { ...o, confirmed: true, confirmationCode: code } : o) }
          : r
      )
    );
  };

  // ── Order transfer (driver takes order from another route) ──────────────────
  const handleTransferOrder = async (fromRouteId: string, orderId: string) => {
    if (!driver) return;

    // Try to capture current GPS position; fall back to store coords
    let startLat = storeLat;
    let startLng = storeLng;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
      );
      startLat = pos.coords.latitude;
      startLng = pos.coords.longitude;
    } catch { /* use store coords as fallback */ }

    setCourierRoutes((prev) => {
      // Find the order in the source route
      const fromRoute = prev.find(r => r.id === fromRouteId);
      const order = fromRoute?.orders.find(o => o.id === orderId);
      if (!order) return prev;

      // Remove from source (remove entire route if now empty)
      const withoutOrder = prev
        .map(r => r.id === fromRouteId ? { ...r, orders: r.orders.filter(o => o.id !== orderId) } : r)
        .filter(r => r.orders.length > 0);

      // Find or create a route for this driver
      const destIdx = withoutOrder.findIndex(r => r.name.toLowerCase() === driver.name.toLowerCase());
      if (destIdx >= 0) {
        const updated = [...withoutOrder];
        updated[destIdx] = { ...updated[destIdx], startLat, startLng, orders: [...updated[destIdx].orders, order] };
        return updated;
      } else {
        const newRoute = {
          id: crypto.randomUUID(),
          name: driver.name,
          orders: [order],
          startLat,
          startLng,
          createdAt: new Date().toISOString(),
        };
        return [...withoutOrder, newRoute];
      }
    });

    toast.success(`Pedido transferido para você! Rota atualizada.`);
    // Switch to own route tab
    setTimeout(() => {
      setCourierRoutes(prev => {
        const ownRoute = prev.find(r => r.name.toLowerCase() === driver.name.toLowerCase());
        if (ownRoute) setActiveTab(ownRoute.id);
        return prev;
      });
    }, 100);
  };

  // ── Admin direct reassign (no hold needed) ──────────────────────────
  const handleAdminReassign = (fromRouteId: string, orderId: string, toDriver: string) => {
    setCourierRoutes(prev => {
      const fromRoute = prev.find(r => r.id === fromRouteId);
      const order = fromRoute?.orders.find(o => o.id === orderId);
      if (!order) return prev;
      const withoutOrder = prev
        .map(r => r.id === fromRouteId ? { ...r, orders: r.orders.filter(o => o.id !== orderId) } : r)
        .filter(r => r.orders.length > 0);
      const destIdx = withoutOrder.findIndex(r => r.name.toLowerCase() === toDriver.toLowerCase());
      if (destIdx >= 0) {
        const updated = [...withoutOrder];
        updated[destIdx] = { ...updated[destIdx], orders: [...updated[destIdx].orders, order] };
        return updated;
      }
      return [...withoutOrder, { id: crypto.randomUUID(), name: toDriver, orders: [order], createdAt: new Date().toISOString() }];
    });
    toast.success(`Pedido reatribuído para ${toDriver}.`);
  };

  const handleConfirmOrderInQueue = (orderId: string, code: string) => {
    setOrders((prev) =>
      prev.map((o) => o.id === orderId ? { ...o, confirmed: true, confirmationCode: code } : o)
    );
  };


  const unconfirmedOrders = orders.filter((o) => !o.confirmed);
  const confirmedOrders = orders.filter((o) => o.confirmed);
  const activeRouteData = courierRoutes.find((r) => r.id === activeTab);

  // ── Auth gate: render fullscreen auth/status screen when needed ────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 size={32} className="text-primary animate-spin" />
      </div>
    );
  }
  if (!user || !isApproved) {
    return <AuthGate />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border sticky top-0 z-40 bg-background/90 backdrop-blur">
        <div className="container py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center glow-primary">
                <Navigation size={18} className="text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">RotaFácil</h1>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-muted-foreground">iFood • Rota Otimizada</p>
                  {polling && <Radio size={10} className="text-primary animate-pulse" />}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchOrders(false)}
                disabled={loading || polling}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all text-sm"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Atualizar
              </button>
              <ProfileMenu driverStats={isDriver ? driverStats : undefined} />
            </div>
          </div>
        </div>

        {/* Tabs */}
        {!needsAuth && !checkingAuth && courierRoutes.length > 0 && (
          <div className="container pb-0 overflow-x-auto">
            <div className="flex gap-1 min-w-max">
              <button
                onClick={() => setActiveTab("queue")}
                className={`px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-all whitespace-nowrap ${activeTab === "queue" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                📋 Fila
                {unconfirmedOrders.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px]">
                    {unconfirmedOrders.length}
                  </span>
                )}
              </button>
              {courierRoutes.map((r) => {
                const active = r.orders.filter((o) => !o.confirmed).length;
                return (
                  <button
                    key={r.id}
                    onClick={() => setActiveTab(r.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-all whitespace-nowrap ${activeTab === r.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                  >
                    <Bike size={11} /> {r.name}
                    {active > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px]">{active}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      <main className="container py-5 space-y-4 max-w-lg mx-auto">
        {/* Auth flow */}
        {checkingAuth && (
          <div className="text-center py-16">
            <Loader2 size={32} className="text-primary animate-spin mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Verificando autenticação iFood...</p>
          </div>
        )}

        {needsAuth && !checkingAuth && (
          <IFoodSetup onAuthenticated={() => { setNeedsAuth(false); }} />
        )}

        {/* ── Courier tab view ── */}
        {!needsAuth && !checkingAuth && activeTab !== "queue" && activeRouteData && (
          <CourierTab
            route={activeRouteData}
            storeLat={storeLat}
            storeLng={storeLng}
            currentDriverName={isDriver ? driver?.name ?? null : null}
            isAdmin={isAdmin}
            outgoingPending={outgoingPending}
            onClose={() => handleCloseCourierRoute(activeRouteData.id)}
            onOrderConfirmed={handleOrderConfirmed}
            onRequestTransfer={(order, ownerName) => requestTransfer(order, ownerName)}
            onAdminReassign={(fromRouteId, orderId, toDriver) => handleAdminReassign(fromRouteId, orderId, toDriver)}
          />
        )}

        {/* ── Main queue view ── */}
        {!needsAuth && !checkingAuth && activeTab === "queue" && (
          <>
            {/* Store address (from iFood) */}
            {storeAddress && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Store size={11} />
                <span className="truncate">Loja: {storeAddress}</span>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="glass-card rounded-lg p-4 border-l-2 border-l-destructive">
                <div className="flex items-start gap-2">
                  <AlertCircle size={16} className="text-destructive mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Erro ao carregar pedidos</p>
                    <p className="text-xs text-muted-foreground mt-1">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Loading state */}
            {loading && orders.length === 0 && (
              <div className="text-center py-16">
                <Loader2 size={32} className="text-primary animate-spin mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">Buscando pedidos do iFood...</p>
              </div>
            )}

            {/* Empty state */}
            {!loading && unconfirmedOrders.length === 0 && !error && (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Package size={28} className="text-primary animate-pulse" />
                </div>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  Aguardando novos pedidos... A fila é atualizada automaticamente a cada 30 segundos.
                </p>
                <div className="flex items-center justify-center gap-1.5 mt-3 text-xs text-muted-foreground">
                  <Radio size={12} className="text-primary animate-pulse" />
                  Online
                </div>
              </div>
            )}

            {/* Orders list */}
            {unconfirmedOrders.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package size={16} className="text-primary" />
                    <h2 className="font-semibold text-foreground">{unconfirmedOrders.length} pedido(s) disponível(is)</h2>
                  </div>
                  <button
                    onClick={selectAll}
                    className="text-xs px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all"
                  >
                    {selectedIds.size === unconfirmedOrders.length ? "Desmarcar todos" : "Selecionar todos"}
                  </button>
                </div>

                <div className="space-y-3">
                  {unconfirmedOrders.map((order, i) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      index={i}
                      selectable
                      selected={selectedIds.has(order.id)}
                      onToggleSelect={toggleSelect}
                      onConfirm={handleConfirmOrderInQueue}
                      showConfirmation={false}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Route / Assign actions */}
            {selectedOrders.length > 0 && (
              <div className="sticky bottom-4 space-y-2 pt-2">
                <div className="glass-card rounded-lg p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    <Route size={11} className="inline mr-1" />
                    Loja → {optimizedRoute.map((o) => o.customerName).join(" → ")} → Loja
                  </p>
                  <div className="space-y-1.5">
                    {/* Admin: full dispatch modal | Driver: assign to self only */}
                    {isAdmin ? (
                      <button
                        onClick={() => setShowAssignModal(true)}
                        className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all glow-primary flex items-center justify-center gap-2"
                      >
                        <Bike size={16} /> Enviar para Motoboy ({selectedOrders.length})
                      </button>
                    ) : (
                      <button
                        onClick={() => driver && handleAssignCourier(driver.name)}
                        disabled={assigning || !driver}
                        className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all glow-primary flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {assigning ? <Loader2 size={16} className="animate-spin" /> : <Bike size={16} />}
                        {assigning ? "Atribuindo..." : `Atribuir a Mim (${selectedOrders.length})`}
                      </button>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={openRoute}
                        className="flex-1 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-all border border-border flex items-center justify-center gap-1.5"
                      >
                        <Navigation size={13} /> Abrir Rota
                      </button>
                      <button
                        onClick={copyRoute}
                        className="flex-1 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-all border border-border flex items-center justify-center gap-1.5"
                      >
                        {copied ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
                        {copied ? "Copiado!" : "Copiar Rota"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Confirmed orders in queue */}
            {confirmedOrders.length > 0 && (
              <>
                <div className="flex items-center gap-2 pt-2">
                  <Check size={16} className="text-accent-foreground" />
                  <h2 className="font-semibold text-foreground">Confirmados ({confirmedOrders.length})</h2>
                </div>
                <div className="space-y-3 opacity-70">
                  {confirmedOrders.map((order, i) => (
                    <OrderCard key={order.id} order={order} index={i} onConfirm={handleConfirmOrderInQueue} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>

      {/* Assign courier modal */}
      {showAssignModal && (
        <AssignCourierModal
          orderCount={selectedOrders.length}
          onConfirm={handleAssignCourier}
          onCancel={() => setShowAssignModal(false)}
        />
      )}

      {/* Incoming transfer request popup (owner/receiver) */}
      {incomingRequest && (
        <HoldTransferModal
          order={incomingRequest.order_data}
          fromDriverName={incomingRequest.current_owner_name}
          toDriverName={incomingRequest.requester_name}
          onCancel={rejectIncoming}
          onApprove={() => {
            // Remove order from my local route
            setCourierRoutes(prev =>
              prev.map(r =>
                r.orders.some(o => o.id === incomingRequest.order_id)
                  ? { ...r, orders: r.orders.filter(o => o.id !== incomingRequest.order_id) }
                  : r
              ).filter(r => r.orders.length > 0)
            );
            approveIncoming();
          }}
        />
      )}
    </div>
  );
};

export default Index;
