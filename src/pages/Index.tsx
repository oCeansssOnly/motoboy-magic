import { useState, useEffect, useCallback, useRef } from "react";
import { OrderCard } from "@/components/OrderCard";
import { IFoodSetup } from "@/components/IFoodSetup";
import { CourierTab } from "@/components/CourierTab";
import { AssignCourierModal } from "@/components/AssignCourierModal";
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
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const POLL_INTERVAL = 30_000; // 30 seconds
const LS_ROUTES_KEY = "courier_routes_v1";
const LS_STORE_KEY = "store_coords_v1";

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

const Index = () => {
  const [orders, setOrders] = useState<IFoodOrder[]>([]);
  const [courierRoutes, setCourierRoutes] = useState<CourierRoute[]>(loadRoutesFromStorage);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"queue" | string>("queue"); // "queue" | routeId
  const [showAssignModal, setShowAssignModal] = useState(false);

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
  const [showStoreConfig, setShowStoreConfig] = useState(false);

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

  // Geolocation
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => { setStoreLat(pos.coords.latitude); setStoreLng(pos.coords.longitude); },
      () => {}
    );
  }, []);

  // Merge new orders without wiping existing local state (selected, confirmed, etc.)
  const mergeOrders = useCallback((freshOrders: IFoodOrder[]) => {
    setOrders((prev) => {
      const existing = new Map(prev.map((o) => [o.id, o]));
      let added = 0;
      freshOrders.forEach((fresh) => {
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
        if (silent) {
          mergeOrders(data.orders);
        } else {
          // First load: set orders directly
          setOrders(
            data.orders.map((o: IFoodOrder) => ({
              ...o, selected: false, confirmed: false, confirmationCode: "",
            }))
          );
          if (data.orders.length > 0) {
            toast.success(`${data.orders.length} pedido(s) carregado(s)`);
          }
        }
      } else if (data?.error) {
        if (!silent) { setError(data.error); toast.error("Erro ao buscar pedidos", { description: data.error }); }
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
  const handleAssignCourier = (courierName: string) => {
    const routeOrders = selectedOrders.map((o) => ({ ...o, confirmed: false }));
    const newRoute: CourierRoute = {
      id: Date.now().toString(),
      name: courierName,
      orders: routeOrders,
      createdAt: new Date().toISOString(),
    };
    setCourierRoutes((prev) => [...prev, newRoute]);
    // Remove assigned orders from main queue
    const assignedIds = new Set(selectedOrders.map((o) => o.id));
    setOrders((prev) => prev.filter((o) => !assignedIds.has(o.id)));
    setSelectedIds(new Set());
    setShowAssignModal(false);
    setActiveTab(newRoute.id);
    toast.success(`Rota atribuída a ${courierName}!`);
  };

  const handleCloseCourierRoute = (routeId: string) => {
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

  const handleConfirmOrderInQueue = (orderId: string, code: string) => {
    setOrders((prev) =>
      prev.map((o) => o.id === orderId ? { ...o, confirmed: true, confirmationCode: code } : o)
    );
  };

  const unconfirmedOrders = orders.filter((o) => !o.confirmed);
  const confirmedOrders = orders.filter((o) => o.confirmed);

  const activeRouteData = courierRoutes.find((r) => r.id === activeTab);

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
            <button
              onClick={() => fetchOrders(false)}
              disabled={loading || polling}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all text-sm"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Atualizar
            </button>
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
            onClose={() => handleCloseCourierRoute(activeRouteData.id)}
            onOrderConfirmed={handleOrderConfirmed}
          />
        )}

        {/* ── Main queue view ── */}
        {!needsAuth && !checkingAuth && activeTab === "queue" && (
          <>
            {/* Store config */}
            <button
              onClick={() => setShowStoreConfig(!showStoreConfig)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <MapPin size={11} /> Local da loja: {storeLat.toFixed(4)}, {storeLng.toFixed(4)}
            </button>
            {showStoreConfig && (
              <div className="glass-card rounded-lg p-3 space-y-2 animate-slide-up">
                <label className="text-xs text-muted-foreground">Coordenadas da loja</label>
                <div className="flex gap-2">
                  <input type="number" step="0.0001" value={storeLat} onChange={(e) => setStoreLat(parseFloat(e.target.value) || 0)} className="flex-1 bg-input border border-border rounded px-2 py-1.5 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none" placeholder="Latitude" />
                  <input type="number" step="0.0001" value={storeLng} onChange={(e) => setStoreLng(parseFloat(e.target.value) || 0)} className="flex-1 bg-input border border-border rounded px-2 py-1.5 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none" placeholder="Longitude" />
                </div>
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
                    <button
                      onClick={() => setShowAssignModal(true)}
                      className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all glow-primary flex items-center justify-center gap-2"
                    >
                      <Bike size={16} /> Enviar para Motoboy ({selectedOrders.length})
                    </button>
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
    </div>
  );
};

export default Index;
