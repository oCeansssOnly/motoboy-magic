import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationCenter } from "@/components/NotificationCenter";
import { RankingTab } from "@/components/RankingTab";
import { CourierTab } from "@/components/CourierTab";
import { AssignCourierModal } from "@/components/AssignCourierModal";
import { AuthGate } from "@/pages/AuthGate";
import { ProfileMenu } from "@/components/ProfileMenu";
import { HoldTransferModal } from "@/components/HoldTransferModal";
import { OrderCard } from "@/components/OrderCard";
import { IFoodSetup } from "@/components/IFoodSetup";
import { TrackingMap } from "@/components/TrackingMap";
import { useAuth } from "@/contexts/AuthContext";
import { useTransferRequests } from "@/hooks/useTransferRequests";
import { useDriverLocation } from "@/hooks/useDriverLocation";
import { useDriverEmojis } from "@/hooks/useDriverEmojis";
import { AppleEmoji } from "@/components/AppleEmoji";
import { IFoodOrder, CourierRoute, NoContactOrder, optimizeRoute, generateGoogleMapsUrl, getOrderDelay } from "@/lib/types";
import {
  Navigation, RefreshCw, Route, MapPin, Copy, Check, Loader2, Package,
  AlertCircle, Bike, Radio, Store, Edit2, Check as CheckIcon, X, UserX, RotateCcw,
  FlaskConical, PackagePlus, Trash2, ChevronRight, Trophy, Bell, ChevronDown, Wallet
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { haptic } from "@/lib/utils";

const POLL_INTERVAL = 15_000; // 15s — faster detection of iFood status changes
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

/**
 * Polyfill for crypto.randomUUID() — works on HTTP (local network IPs)
 * where the Web Crypto API's randomUUID is unavailable (non-secure context).
 */
function generateId(): string {
  if (typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function") {
    return (crypto as any).randomUUID() as string;
  }
  // Fallback: manual UUID v4 (for HTTP / non-secure contexts like LAN IPs)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
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
  const driverEmojis = useDriverEmojis();
  // Ref always mirrors courierRoutes so async callbacks read current state without stale closures
  const courierRoutesRef = useRef<CourierRoute[]>(courierRoutes);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"queue" | string>("queue"); // "queue" | routeId
  const [showNotifications, setShowNotifications] = useState(false);
  const { notifications, addNotification, unreadCount } = useNotifications();
  const [sortByDelay, setSortByDelay] = useState(false);

  // Driver today's earnings & deliveries (Refreshed on mount and when orders confirm)
  const [driverTodayStats, setDriverTodayStats] = useState({ earningsCents: 0, deliveries: 0 });

  useEffect(() => {
    // Start of the day in ISO UTC to match DB fields reasonably
    const now = new Date();
    // Use string offset to accurately query todays dates if possible, or simple ISO of local date
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const motoboyName = driver?.name || user?.email?.split('@')[0] || "Motoboy";

    let query = supabase
      .from("confirmed_orders")
      .select("order_total_cents, order_code")
      .gte("confirmed_at", startOfDay);

    if (!isAdmin) {
      query = query.eq("motoboy_name", motoboyName);
    }

    query.then(({ data }) => {
      const all = data || [];
      const earningsCents = all.reduce((sum, o) => {
        if (isAdmin) {
          const grossProduct = parseInt(o.order_code || "0", 10) || 0;
          // grossProduct is the full order amount paid by the customer.
          // Fallback to order_total_cents only for older orders before the schema fix today.
          return sum + (grossProduct > 0 ? grossProduct : (o.order_total_cents || 0));
        } else {
          // Drivers only sum delivery fee
          return sum + (o.order_total_cents || 0);
        }
      }, 0);
      setDriverTodayStats({ deliveries: all.length, earningsCents });
    });
  }, [isAdmin, isDriver, driver, user, courierRoutes]); // Re-queries when routes update (like confirming an order)


  // Fallback to "queue" if active route ceases to exist
  useEffect(() => {
    if (activeTab !== "queue" && activeTab !== "retentativas" && activeTab !== "map" && activeTab !== "dev_panel" && activeTab !== "ranking") {
      // Allow dynamic route IDs or a special "minha_rota" flag
      if (!courierRoutes.some(r => r.id === activeTab) && activeTab !== "minha_rota") {
        setActiveTab("queue");
      }
    }
  }, [activeTab, courierRoutes]);

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [dismissedOrderIds, setDismissedOrderIds] = useState<Set<string>>(loadDismissedIds);
  // Ref mirrors the state so mergeOrders can read the CURRENT dismissed set
  // without stale-closure or nested-setState issues.
  const dismissedIdsRef = useRef<Set<string>>(dismissedOrderIds);

  const [needsAuth, setNeedsAuth] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Synchronize dismissed IDs globally to fix bug where orders reappeared
  useEffect(() => {
    if (needsAuth || checkingAuth) return;
    const fetchGlobalDismissed = async () => {
      try {
        const queryLimitDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

        // Fetch confirmed orders
        const { data: confirmed } = await supabase
          .from("confirmed_orders")
          .select("ifood_order_id")
          .gte("created_at", queryLimitDate);

        // Fetch cancelled/concluded events
        const { data: events } = await supabase
          .from("order_status_events")
          .select("order_id")
          .in("status", ["concluded", "cancelled"])
          .gte("created_at", queryLimitDate);

        const globalDismissed = new Set(dismissedIdsRef.current);
        if (confirmed) confirmed.forEach(c => c.ifood_order_id && globalDismissed.add(c.ifood_order_id));
        if (events) events.forEach(e => e.order_id && globalDismissed.add(e.order_id));

        dismissedIdsRef.current = globalDismissed;
        setDismissedOrderIds(globalDismissed);
        saveDismissedIds(globalDismissed);

        // Prune any existing state orders that were fetched before this synced
        setOrders(prev => prev.filter(o => !globalDismissed.has(o.id)));
      } catch (err) {
        console.error("Error syncing global dismissed orders:", err);
      }
    };
    fetchGlobalDismissed();
  }, [needsAuth, checkingAuth]);

  const [assigning, setAssigning] = useState(false);
  // No contact orders — fed from Supabase (shared across all clients)
  const [noContactOrders, setNoContactOrders] = useState<NoContactOrder[]>([]);
  const [storeAddress, setStoreAddress] = useState<string | null>(
    () => localStorage.getItem(LS_ADDRESS_KEY) || null
  );
  // Admin-editable store address
  const [editingStoreAddr, setEditingStoreAddr] = useState(false);
  const [storeAddrInput, setStoreAddrInput] = useState("");
  // Ref to prevent iFood polling from overriding manual dev coordinates
  const storeLocationOverriddenRef = useRef(false);

  const [isGeneratingTestOrders, setIsGeneratingTestOrders] = useState(false);

  const handleGenerateTestOrders = async () => {
    setIsGeneratingTestOrders(true);
    try {
      const fakeOrders = Array.from({ length: 3 }).map((_, i) => {
        // random offset roughly 1km-3km from store
        const r_lat = (Math.random() - 0.5) * 0.04;
        const r_lng = (Math.random() - 0.5) * 0.04;
        const id = "TEST-" + generateId().substring(0, 8).toUpperCase();

        const order: IFoodOrder = {
          id,
          displayId: id,
          customerName: `Cliente Teste ${Math.floor(Math.random() * 1000)}`,
          customerPhone: "(00) 00000-0000",
          address: "Rua Fictícia de Teste, 123 - Centro",
          lat: storeLat + r_lat,
          lng: storeLng + r_lng,
          total: Math.floor(Math.random() * 8000) + 2000,
          deliveryFee: Math.floor(Math.random() * 500) + 500,
          paymentMethod: ["ONLINE", "CASH", "PIX"][Math.floor(Math.random() * 3)],
          items: "1x Item de Teste",
          status: "DISPATCHED",
          createdAt: new Date().toISOString(),
          deliveryCode: "1234"
        };

        // Mock orders stay purely local to avoid DB constraints and API checks
        return order;
      });

      mergeOrders(fakeOrders);
      toast.success("3 Pedidos teste gerados localmente! Aparecerão na Fila.");
    } catch (err: any) {
      toast.error("Erro ao gerar testes localmente: " + (err.message || String(err)));
    } finally {
      setIsGeneratingTestOrders(false);
    }
  };

  const handleClearTestOrders = async () => {
    try {
      await supabase.from("pending_orders").delete().like('id', 'TEST-%');
      toast.success("Pedidos de teste removidos do banco de dados.");
    } catch (err) {
      toast.error("Erro ao limpar testes");
    }
  };

  const [backgroundMode, setBackgroundMode] = useState(() => {
    return localStorage.getItem("background_tracking_v1") === "true";
  });

  useEffect(() => {
    localStorage.setItem("background_tracking_v1", String(backgroundMode));
  }, [backgroundMode]);

  // Driver real-time location
  const { location: driverLocation } = useDriverLocation(isDriver ? (driver?.name ?? null) : null, backgroundMode);

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

  // ── Auto-close helper: remove routes that have no unconfirmed orders left ──
  const cleanupEmptyRoutes = useCallback((prev: CourierRoute[]): CourierRoute[] =>
    prev.filter(r => r.orders.some(o => !o.confirmed))
    , []);

  // ── Transfer request (approved: add order to my route) ─────────────────────
  // Use a ref so handleOrderApproved always reads the current driver even if
  // the callback was captured when driver was still null (stale closure fix).
  const driverRef = useRef(driver);
  useEffect(() => { driverRef.current = driver; }, [driver]);

  const handleOrderApproved = useCallback((order: IFoodOrder, gpsLat: number, gpsLng: number) => {
    const currentDriver = driverRef.current;
    if (!currentDriver) return;
    setCourierRoutes(prev => {
      // Remove the order from any route that currently holds it (the source route)
      // so it doesn't show as duplicated while Realtime propagates the change.
      const withoutOrder = prev.map(r => ({
        ...r,
        orders: r.orders.filter(o => o.id !== order.id),
      }));
      const destIdx = withoutOrder.findIndex(r => r.name.toLowerCase() === currentDriver.name.toLowerCase());
      let updated: CourierRoute[];
      if (destIdx >= 0) {
        updated = [...withoutOrder];
        updated[destIdx] = { ...updated[destIdx], startLat: gpsLat, startLng: gpsLng, orders: [...updated[destIdx].orders, order] };
      } else {
        const newRoute: CourierRoute = { id: generateId(), name: currentDriver.name, orders: [order], startLat: gpsLat, startLng: gpsLng, createdAt: new Date().toISOString() };
        updated = [...withoutOrder, newRoute];
      }
      return cleanupEmptyRoutes(updated);
    });
    // Switch to the driver's own route tab
    setTimeout(() => {
      setCourierRoutes(prev => {
        const ownRoute = prev.find(r => r.name.toLowerCase() === currentDriver.name.toLowerCase());
        if (ownRoute) setActiveTab(ownRoute.id);
        return prev;
      });
    }, 100);
    toast.success("Pedido transferido com sucesso! Confira sua rota.");
  }, [cleanupEmptyRoutes]); // reads driverRef.current to avoid stale closure

  // Called on the APPROVER's side when they approve a transfer.
  // Removes the order from their route and writes directly to DB to avoid
  // the isRemoteRouteUpdateRef race condition in the diff-sync effect.
  const handleOrderTransferred = useCallback((orderId: string) => {
    setCourierRoutes(prev => {
      // Find every route that contains this order (should be exactly one)
      const sourcesWithOrder = prev.filter(r => r.orders.some(o => o.id === orderId));

      const updated = prev.map(r => ({
        ...r,
        orders: r.orders.filter(o => o.id !== orderId),
      }));
      const cleaned = cleanupEmptyRoutes(updated);

      // Direct DB write — bypasses diff-sync to avoid race conditions
      sourcesWithOrder.forEach(source => {
        const stillExists = cleaned.find(r => r.id === source.id);
        if (stillExists) {
          // Route still has other orders — update it in DB
          (supabase as any).from("courier_routes").update({
            orders: stillExists.orders,
            updated_at: new Date().toISOString(),
          }).eq("id", source.id).then(() => { });
        } else {
          // Route is now empty — delete from DB
          (supabase as any).from("courier_routes").delete().eq("id", source.id).then(() => { });
        }
      });

      return cleaned;
    });
  }, [cleanupEmptyRoutes]);

  const { incomingRequest, outgoingPending, pendingNotifications, requestTransfer, triggerPoll, approveIncoming, rejectIncoming } = useTransferRequests({
    myName: isDriver ? (driver?.name ?? null) : null,
    onOrderApproved: handleOrderApproved,
    onOrderTransferred: handleOrderTransferred,
    storeLat,
    storeLng,
    addNotification,
  });

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tracks whether the last courierRoutes change came from a Realtime/DB event
  // (not a local user action), to prevent re-writing received data back to DB.
  const isRemoteRouteUpdateRef = useRef(false);
  // Tracks the previous routes array for diff-syncing to DB
  const prevRoutesRef = useRef<CourierRoute[]>(courierRoutes);

  // Persist store coords
  useEffect(() => {
    localStorage.setItem(LS_STORE_KEY, JSON.stringify({ lat: storeLat, lng: storeLng }));
  }, [storeLat, storeLng]);

  // Persist courier routes to localStorage AND sync changes to DB (for cross-client Realtime)
  useEffect(() => {
    saveRoutesToStorage(courierRoutes);

    // Skip DB write if the change originated from a Realtime/DB event (avoid feedback loop)
    if (isRemoteRouteUpdateRef.current) {
      isRemoteRouteUpdateRef.current = false;
      prevRoutesRef.current = courierRoutes;
      return;
    }

    const prev = prevRoutesRef.current;
    prevRoutesRef.current = courierRoutes;

    // Upsert routes that are new or changed
    const toUpsert = courierRoutes.filter(r => {
      const old = prev.find(p => p.id === r.id);
      return !old || JSON.stringify(old.orders) !== JSON.stringify(r.orders)
        || old.startLat !== r.startLat || old.startLng !== r.startLng;
    });
    if (toUpsert.length > 0) {
      supabase.from("courier_routes" as any).upsert(
        toUpsert.map(r => ({
          id: r.id, name: r.name, orders: r.orders as any,
          start_lat: r.startLat ?? null, start_lng: r.startLng ?? null,
          created_at: r.createdAt, updated_at: new Date().toISOString(),
        })),
        { onConflict: "id" }
      ).then(() => { });
    }

    // Delete routes that were removed
    const deletedIds = prev
      .filter(p => !courierRoutes.some(r => r.id === p.id))
      .map(p => p.id);
    deletedIds.forEach(id => {
      supabase.from("courier_routes" as any).delete().eq("id", id).then(() => { });
    });
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

  // Load persisted orders from DB on mount (fixes refresh/logout order loss).
  // After loading from pending_orders, we cross-check every ID against the live
  // iFood API via the validate action — only truly valid orders are shown.
  const loadPersistedOrders = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("pending_orders")
        .select("id,display_id,localizador,customer_name,customer_phone,customer_address,lat,lng,total,payment_method,items,status,created_at,delivery_code,raw_data")
        .in("status", ["ACCEPTED", "DISPATCHED"])
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
        deliveryFee: (() => {
          const raw = r.raw_data as any || {};
          const safeTotal = raw.total || raw.TOTAL || {};
          const safeDelivery = raw.delivery || raw.DELIVERY || {};
          const rawFeeNum = Number(safeTotal.deliveryFee || safeTotal.DELIVERYFEE || raw.deliveryFee || raw.DELIVERYFEE || safeDelivery.fee || safeDelivery.FEE || 0);
          if (rawFeeNum > 0) {
            return Math.round(rawFeeNum * 100);
          }
          const distKm = haversineKm(storeLat, storeLng, r.lat ?? 0, r.lng ?? 0) * 2;
          return 300 + Math.round(distKm * 150);
        })(),
        paymentMethod: r.payment_method ?? "ONLINE",
        items: r.items ?? "",
        status: r.status ?? "ACCEPTED",
        createdAt: r.created_at ?? new Date().toISOString(),
        deliveryCode: r.delivery_code ?? "",
        selected: false,
        confirmed: false,
        confirmationCode: "",
        cancelled: r.status === "CANCELLED",
      }));

      // ── Cross-check with iFood API: discard stale/phantom orders ─────────
      let validIdSet: Set<string> | null = null;
      try {
        const ids = mapped.map(o => o.id);
        const { data: vData } = await supabase.functions.invoke("ifood-orders", {
          body: { action: "validate", ids },
        });
        if (Array.isArray(vData?.validIds)) {
          validIdSet = new Set<string>(vData.validIds);
          if (vData.staleIds?.length > 0) {
            console.log(`[loadPersistedOrders] Purged ${vData.staleIds.length} stale order(s) from DB.`);
          }
        }
      } catch {
        // If validation fails (e.g. network issue), show all DB orders as fallback
        validIdSet = null;
      }

      const validOrders = validIdSet ? mapped.filter(o => validIdSet!.has(o.id)) : mapped;

      setOrders(prev => {
        const dismissed = dismissedIdsRef.current;
        const existing = new Map(prev.map(o => [o.id, o]));
        validOrders.forEach(o => {
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

  // Load store address from app_settings (admin-configurable) on mount
  useEffect(() => {
    supabase.from("app_settings" as any)
      .select("key,value")
      .in("key", ["store_address", "store_name"])
      .then(({ data }) => {
        if (!data) return;
        const addr = data.find(r => r.key === "store_address")?.value;
        if (addr) {
          setStoreAddress(addr);
          localStorage.setItem(LS_ADDRESS_KEY, addr);
        }
      });
  }, []);

  const saveStoreAddress = async (addr: string) => {
    const trimmed = addr.trim();
    if (!trimmed) return;
    await supabase.from("app_settings" as any)
      .update({ value: trimmed, updated_at: new Date().toISOString() })
      .eq("key", "store_address");
    setStoreAddress(trimmed);
    localStorage.setItem(LS_ADDRESS_KEY, trimmed);
    setEditingStoreAddr(false);
    toast.success("Endereço da loja salvo!");
  };

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
          // Force robust calculation of delivery fee parsing out of raw data
          // to bypass stale Edge Function code output
          const raw = fresh.raw as any || {};
          const safeTotal = raw.total || raw.TOTAL || {};
          const safeDelivery = raw.delivery || raw.DELIVERY || {};
          const rawFeeNum = Number(safeTotal.deliveryFee || safeTotal.DELIVERYFEE || raw.deliveryFee || raw.DELIVERYFEE || safeDelivery.fee || safeDelivery.FEE || 0);

          let parsedFee = fresh.deliveryFee || 0;
          if (rawFeeNum > 0) {
            parsedFee = Math.round(rawFeeNum * 100);
          } else if (!parsedFee || parsedFee === 0) {
            const currentStoreLat = JSON.parse(localStorage.getItem(LS_STORE_KEY) || "null")?.lat ?? -23.55052;
            const currentStoreLng = JSON.parse(localStorage.getItem(LS_STORE_KEY) || "null")?.lng ?? -46.63330;
            const distKm = haversineKm(currentStoreLat, currentStoreLng, fresh.lat ?? 0, fresh.lng ?? 0) * 2;
            parsedFee = 300 + Math.round(distKm * 150);
          }

          existing.set(fresh.id, {
            ...fresh,
            deliveryFee: parsedFee,
            selected: false,
            confirmed: false,
            confirmationCode: ""
          });
          added++;
        }
      });
      if (added > 0) {
        addNotification("success", "Novo Pedido na Fila", `🆕 ${added} novo(s) pedido(s) chegaram do iFood!`);
        toast.success(`🆕 ${added} novo(s) pedido(s) chegaram!`, { duration: 5000 });
      }
      return Array.from(existing.values());
    });
  }, [addNotification]);

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setPolling(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("ifood-orders");
      if (data?.needsAuth) { setNeedsAuth(true); return; }
      if (fnError) throw fnError;
      if (data?.orders && Array.isArray(data.orders)) {
        // Always apply store address and coords from iFood (source of truth)
        // EXCEPT if the Admin is actively overriding them in the Dev Panel.
        if (!storeLocationOverriddenRef.current) {
          if (data.merchantAddress) {
            setStoreAddress(data.merchantAddress);
            localStorage.setItem(LS_ADDRESS_KEY, data.merchantAddress);
            supabase.from("app_settings" as any)
              .upsert({ key: "store_address", value: data.merchantAddress, updated_at: new Date().toISOString() }, { onConflict: "key" })
              .then(() => { });
          }
          if (data.storeLat && data.storeLng) {
            setStoreLat(data.storeLat);
            setStoreLng(data.storeLng);
            localStorage.setItem(LS_STORE_KEY, JSON.stringify({ lat: data.storeLat, lng: data.storeLng }));
          }
        }
        // Only toast 'orders processed' during non-silent loads (manual refresh)
        mergeOrders(data.orders);
        if (!silent && data.orders.length > 0) {
          toast.success(`${data.orders.length} pedido(s) processado(s)`);
        }
      } else if (data?.error) {
        if (!silent) { setError(data.error); toast.error("Erro ao buscar pedidos", { description: data.error }); }
      }

      // ── Sync concluded orders (confirmed externally on iFood — counts for stats) ──
      if (Array.isArray(data?.concludedOrders) && data.concludedOrders.length > 0) {
        const concluded = data.concludedOrders as { id: string; displayId: string; customerName: string; address: string; lat: number; lng: number; total: number }[];
        setCourierRoutes(prev => {
          const updated = prev.map(route => {
            const toFinalize = route.orders.filter(o => concluded.some(c => c.id === o.id) && !o.confirmed);
            if (toFinalize.length === 0) return route;
            toFinalize.forEach(async order => {
              const cInfo = concluded.find(c => c.id === order.id)!;
              const distKm = haversineKm(storeLat, storeLng, cInfo.lat || order.lat, cInfo.lng || order.lng) * 2;
              const deliveryFee = (cInfo as any).deliveryFee || order.deliveryFee || 0;
              // upsert prevents duplicate rows if driver already confirmed before iFood concluded
              await supabase.from("confirmed_orders").upsert({
                ifood_order_id: order.id, customer_name: order.customerName,
                customer_address: order.address, motoboy_name: route.name,
                status: "concluded_by_ifood",
                distance_km: Math.round(distKm * 10) / 10,
                order_total_cents: deliveryFee,
                order_code: String(Math.round(Number(order.total || 0) * 100)),
                delivery_lat: cInfo.lat || order.lat, delivery_lng: cInfo.lng || order.lng,
              }, { onConflict: "ifood_order_id" });
              // Remove from pending queue — order is done
              supabase.from("pending_orders").delete().eq("id", order.id).then(() => { });
            });
            return { ...route, orders: route.orders.map(o => concluded.some(c => c.id === o.id) ? { ...o, confirmed: true } : o) };
          });
          const cleaned = cleanupEmptyRoutes(updated);
          // Delete routes that became empty from courier_routes DB
          const removedRouteIds = prev
            .filter(r => !cleaned.some(c => c.id === r.id))
            .map(r => r.id);
          removedRouteIds.forEach(id =>
            (supabase as any).from("courier_routes").delete().eq("id", id).then(() => { })
          );
          return cleaned;
        });
        toast.info(`${data.concludedOrders.length} pedido(s) finalizado(s) pelo iFood.`, { duration: 6000 });
      }

      // ── Cancelled orders: in-route → badge "Cancelado"; not yet assigned → purge ──
      if (Array.isArray(data?.cancelledOrderIds) && data.cancelledOrderIds.length > 0) {
        const cancelledSet = new Set<string>(data.cancelledOrderIds);
        // In-route: mark confirmed+cancelled so driver sees the badge (no stat saved)
        setCourierRoutes(prev => {
          const updated = prev.map(r => ({
            ...r,
            orders: r.orders.map(o =>
              cancelledSet.has(o.id) && !o.confirmed ? { ...o, confirmed: true, cancelled: true } : o
            ),
          }));
          const cleaned = cleanupEmptyRoutes(updated);
          // Delete routes that became empty from courier_routes DB
          const removedRouteIds = prev
            .filter(r => !cleaned.some(c => c.id === r.id))
            .map(r => r.id);
          removedRouteIds.forEach(id =>
            (supabase as any).from("courier_routes").delete().eq("id", id).then(() => { })
          );
          return cleaned;
        });
        // Not yet assigned: mark as cancelled so the UI shows them faded
        setOrders(prev => prev.map(o => cancelledSet.has(o.id) ? { ...o, cancelled: true } : o));
        toast.warning(`${data.cancelledOrderIds.length} pedido(s) cancelado(s) pelo iFood.`, { duration: 5000 });
      }

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      if (!silent) { setError(msg); toast.error("Erro ao conectar com iFood"); }
    } finally {
      setLoading(false);
      setPolling(false);
    }
  }, [mergeOrders]);

  // ── Load no_contact_orders from Supabase (initial + Realtime) ──────────────
  useEffect(() => {
    if (needsAuth || checkingAuth) return;
    // Initial load
    (supabase as any).from("no_contact_orders").select("*").order("marked_at", { ascending: false })
      .then(({ data }: { data: NoContactOrder[] | null }) => { if (data) setNoContactOrders(data); });

    // Realtime subscription for live updates across all clients
    const channel = supabase
      .channel("no-contact-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "no_contact_orders" }, payload => {
        const nc = payload.new as unknown as NoContactOrder;
        // Replace temp optimistic entry or add new
        setNoContactOrders(prev => [nc, ...prev.filter(x => x.order_id !== nc.order_id && !x.id.startsWith('temp-'))]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "no_contact_orders" }, payload => {
        const nc = payload.new as unknown as NoContactOrder;
        setNoContactOrders(prev => prev.map(x => x.id === nc.id || x.order_id === nc.order_id ? nc : x));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "no_contact_orders" }, payload => {
        const id = (payload.old as any).id;
        setNoContactOrders(prev => prev.filter(x => x.id !== id));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [needsAuth, checkingAuth]);

  // ── Realtime: sync pending_orders across all connected clients ──────────────
  // When any client assigns/confirms an order (deletes from pending_orders),
  // all other open clients remove it from their queue instantly — no F5 needed.
  useEffect(() => {
    if (needsAuth || checkingAuth) return;

    const pendingChannel = supabase
      .channel("pending-orders-realtime")
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "pending_orders" }, (payload) => {
        const deletedId = (payload.old as any).id as string;
        if (!deletedId) return;
        // Remove from the visible queue
        setOrders(prev => prev.filter(o => o.id !== deletedId));
        // Permanently dismiss so it doesn't re-appear from the next poll
        const next = new Set(dismissedIdsRef.current);
        next.add(deletedId);
        dismissedIdsRef.current = next;
        setDismissedOrderIds(next);
        saveDismissedIds(next);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pending_orders" }, (payload) => {
        const row = payload.new as any;
        if (!row?.id) return;
        if (dismissedIdsRef.current.has(row.id)) return;
        const newOrder: IFoodOrder = {
          id: row.id,
          displayId: row.display_id ?? row.id.slice(0, 8),
          localizador: row.localizador ?? "",
          customerName: row.customer_name ?? "Cliente",
          customerPhone: row.customer_phone ?? "",
          address: row.customer_address ?? "Endereço não disponível",
          lat: row.lat ?? 0,
          lng: row.lng ?? 0,
          total: row.total ?? 0,
          deliveryFee: (() => {
            const raw = row.raw_data as any || {};
            const safeTotal = raw.total || raw.TOTAL || {};
            const safeDelivery = raw.delivery || raw.DELIVERY || {};
            const rawFeeNum = Number(safeTotal.deliveryFee || safeTotal.DELIVERYFEE || raw.deliveryFee || raw.DELIVERYFEE || safeDelivery.fee || safeDelivery.FEE || 0);
            if (rawFeeNum > 0) {
              return Math.round(rawFeeNum * 100);
            }
            const distKm = haversineKm(storeLat, storeLng, row.lat ?? 0, row.lng ?? 0) * 2;
            return 300 + Math.round(distKm * 150);
          })(),
          paymentMethod: row.payment_method ?? "ONLINE",
          items: row.items ?? "",
          status: row.status ?? "ACCEPTED",
          createdAt: row.created_at ?? new Date().toISOString(),
          deliveryCode: row.delivery_code ?? "",
          selected: false,
          confirmed: false,
          confirmationCode: "",
        };
        setOrders(prev => {
          if (prev.some(o => o.id === newOrder.id)) return prev;
          return [...prev, newOrder];
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(pendingChannel); };
  }, [needsAuth, checkingAuth]);

  // ── Load courier routes from DB on mount (new clients see current state) ────
  useEffect(() => {
    if (needsAuth || checkingAuth) return;
    (supabase as any).from("courier_routes").select("*").order("created_at", { ascending: true })
      .then(({ data }: { data: any[] | null }) => {
        isRemoteRouteUpdateRef.current = true;
        if (!data || data.length === 0) {
          setCourierRoutes([]);
          saveRoutesToStorage([]);
          return;
        }
        const loaded: CourierRoute[] = data.map((r: any) => ({
          id: r.id, name: r.name, orders: r.orders || [],
          startLat: r.start_lat, startLng: r.start_lng, createdAt: r.created_at,
        }));
        setCourierRoutes(loaded);
        saveRoutesToStorage(loaded);
      });
  }, [needsAuth, checkingAuth]);

  // ── Realtime: sync courier_routes across all connected clients ──────────────
  // When any client creates/updates/deletes a route, all others see it instantly.
  useEffect(() => {
    if (needsAuth || checkingAuth) return;

    const routesChannel = supabase
      .channel("courier-routes-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "courier_routes" }, (payload) => {
        const r = payload.new as any;
        isRemoteRouteUpdateRef.current = true;
        setCourierRoutes(prev => {
          if (prev.some(x => x.id === r.id)) return prev;
          return [...prev, { id: r.id, name: r.name, orders: r.orders || [], startLat: r.start_lat, startLng: r.start_lng, createdAt: r.created_at }];
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "courier_routes" }, (payload) => {
        const r = payload.new as any;
        isRemoteRouteUpdateRef.current = true;
        setCourierRoutes(prev => {
          const idx = prev.findIndex(x => x.id === r.id);
          if (idx < 0) return [...prev, { id: r.id, name: r.name, orders: r.orders || [], startLat: r.start_lat, startLng: r.start_lng, createdAt: r.created_at }];
          const updated = [...prev];
          updated[idx] = { ...updated[idx], orders: r.orders || [], startLat: r.start_lat ?? updated[idx].startLat, startLng: r.start_lng ?? updated[idx].startLng };
          return updated;
        });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "courier_routes" }, (payload) => {
        const id = (payload.old as any).id;
        isRemoteRouteUpdateRef.current = true;
        setCourierRoutes(prev => prev.filter(r => r.id !== id));
      })
      .subscribe();

    return () => { supabase.removeChannel(routesChannel); };
  }, [needsAuth, checkingAuth]);

  // ── Realtime: react to order status events from iFood polling ───────────────
  // The edge function publishes concluded/cancelled events to order_status_events.
  // This ensures ALL clients (not just the one that polled) handle status changes
  // the moment ANY client triggers a poll.
  useEffect(() => {
    if (needsAuth || checkingAuth) return;
    const processedEvents = new Set<string>(); // prevent double-processing on reconnect

    const eventsChannel = supabase
      .channel("order-status-events-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_status_events" }, (payload) => {
        const ev = payload.new as any;
        if (!ev?.order_id || processedEvents.has(ev.id)) return;
        processedEvents.add(ev.id);

        if (ev.status === "concluded") {
          // ── Concluded externally by iFood (customer confirmed or auto) ──
          const cInfo = ev.order_data as any;
          setCourierRoutes(prev => {
            const updated = prev.map(route => {
              const inRoute = route.orders.find(o => o.id === ev.order_id && !o.confirmed);
              if (!inRoute) return route;
              // Save to confirmed_orders for driver stats
              const distKm = haversineKm(storeLat, storeLng, cInfo?.lat || inRoute.lat, cInfo?.lng || inRoute.lng) * 2;
              supabase.from("confirmed_orders").upsert({
                ifood_order_id: inRoute.id,
                customer_name: inRoute.customerName,
                customer_address: inRoute.address,
                motoboy_name: route.name,
                status: "confirmed",
                distance_km: Math.round(distKm * 10) / 10,
                order_total_cents: inRoute.deliveryFee || 0,
                order_code: String(Math.round(Number(inRoute.total || 0) * 100)),
                delivery_lat: inRoute.lat || storeLat,
                delivery_lng: inRoute.lng || storeLng,
              }, { onConflict: "ifood_order_id" }).then(() => { });
              supabase.from("pending_orders").delete().eq("id", inRoute.id).then(() => { });
              return { ...route, orders: route.orders.map(o => o.id === ev.order_id ? { ...o, confirmed: true } : o) };
            });
            const cleaned = cleanupEmptyRoutes(updated);
            // Delete empty routes from DB
            prev.filter(r => !cleaned.some(c => c.id === r.id))
              .forEach(r => (supabase as any).from("courier_routes").delete().eq("id", r.id).then(() => { }));
            return cleaned;
          });
          // Also remove from pending queue if not yet assigned
          setOrders(prev => prev.filter(o => o.id !== ev.order_id));
          toast.info(`Pedido finalizado pelo iFood.`, { duration: 5000 });
          addNotification("success", "Pedido Finalizado", `O iFood concluiu automaticamente a entrega do pedido #${ev.order_id.slice(-4)}`);

        } else if (ev.status === "cancelled") {
          // ── Cancelled by iFood ──
          setCourierRoutes(prev => {
            const inAnyRoute = prev.some(r => r.orders.some(o => o.id === ev.order_id));
            if (!inAnyRoute) return prev; // not in route — handled below via setOrders
            // Mark with cancelled badge (no stats)
            const updated = prev.map(r => ({
              ...r,
              orders: r.orders.map(o =>
                o.id === ev.order_id && !o.confirmed ? { ...o, confirmed: true, cancelled: true } : o
              ),
            }));
            const cleaned = cleanupEmptyRoutes(updated);
            // Delete empty routes from DB
            prev.filter(r => !cleaned.some(c => c.id === r.id))
              .forEach(r => (supabase as any).from("courier_routes").delete().eq("id", r.id).then(() => { }));
            return cleaned;
          });
          // Remove from pending queue + dismiss permanently
          setOrders(prev => prev.filter(o => o.id !== ev.order_id));
          const nextDismissed = new Set(dismissedIdsRef.current);
          nextDismissed.add(ev.order_id);
          dismissedIdsRef.current = nextDismissed;
          setDismissedOrderIds(nextDismissed);
          saveDismissedIds(nextDismissed);
          // Delete from pending_orders DB
          supabase.from("pending_orders").delete().eq("id", ev.order_id).then(() => { });
          toast.warning(`Pedido cancelado pelo iFood.`, { duration: 5000 });
          addNotification("error", "Pedido Cancelado", `O pedido #${ev.order_id.slice(-4)} foi cancelado pelo iFood ou cliente.`);
        }

        // Delete event after processing (cleanup — no need to keep it)
        (supabase as any).from("order_status_events").delete().eq("id", ev.id).then(() => { });
      })
      .subscribe();

    return () => { supabase.removeChannel(eventsChannel); };
  }, [needsAuth, checkingAuth, storeLat, storeLng, cleanupEmptyRoutes]);

  // Keep courierRoutesRef in sync with state
  useEffect(() => { courierRoutesRef.current = courierRoutes; }, [courierRoutes]);

  // ── Direct status polling for in-route orders ─────────────────────────────
  // Clean async function — reads from ref, single setCourierRoutes call, no nesting.
  const checkRouteOrdersStatus = useCallback(async () => {
    const snapshot = courierRoutesRef.current;

    // Ignore TEST- orders because they don't exist in iFood API 
    // and would be mistakenly marked as CONCLUDED.
    const inRouteOrders = snapshot.flatMap(r =>
      r.orders.filter(o => !o.confirmed && !o.id.startsWith("TEST-")).map(o => ({ routeId: r.id, routeName: r.name, order: o }))
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
                order_total_cents: o.deliveryFee || 0,
                delivery_lat: o.lat || storeLat, delivery_lng: o.lng || storeLng,
                confirmed_at: new Date().toISOString(),
              }, { onConflict: "ifood_order_id" }).then(({ error }) => {
                if (error) console.error("[Index] Error upserting confirmed_order (automatic):", error);
              });
              supabase.from("pending_orders").delete().eq("id", o.id).then(() => { });
              return { ...o, confirmed: true };
            }
            if (cancelled.has(o.id) && !o.confirmed) {
              supabase.from("pending_orders").delete().eq("id", o.id).then(() => { });
              return { ...o, confirmed: true, cancelled: true };
            }
            return o;
          }),
        }));
        const cleaned = cleanupEmptyRoutes(updated);
        routes.filter(r => !cleaned.some(c => c.id === r.id))
          .forEach(r => (supabase).from("courier_routes").delete().eq("id", r.id).then(() => { }));
        if (concluded.size > 0) toast.info(`${concluded.size} pedido(s) finalizado(s) pelo iFood.`, { duration: 5000 });
        if (cancelled.size > 0) toast.warning(`${cancelled.size} pedido(s) cancelado(s) pelo iFood.`, { duration: 5000 });
        return cleaned;
      });
    } catch { /* silent */ }
  }, [storeLat, storeLng, cleanupEmptyRoutes]);

  // Initial load + polling
  useEffect(() => {
    if (needsAuth || checkingAuth) return;
    loadPersistedOrders();
    fetchOrders(false);
    // Main poll: iFood events + new orders (15s)
    pollingRef.current = setInterval(() => fetchOrders(true), POLL_INTERVAL);
    // Route status poll: check in-route order statuses directly (10s, faster)
    const routeStatusInterval = setInterval(() => checkRouteOrdersStatus(), 10_000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      clearInterval(routeStatusInterval);
    };
  }, [needsAuth, checkingAuth, fetchOrders, loadPersistedOrders, checkRouteOrdersStatus]);

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
          id: generateId(),
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

    // Delete from pending_orders — orders are now in a route, no longer pending
    supabase.from("pending_orders")
      .delete()
      .in("id", [...assignedIds])
      .then(() => { });

    setOrders((prev) => prev.filter((o) => !assignedIds.has(o.id)));
    setSelectedIds(new Set());
    setAssigning(false);
    if (assignedRouteId) setActiveTab(assignedRouteId);
    toast.success(`${ordersToAssign.length} pedido(s) atribuído(s) para ${courierName}!`);
    addNotification("info", "Rota Atribuída", `${ordersToAssign.length} pedido(s) despachado(s) para ${courierName}.`);
  };


  // ── No-Contact handler ─────────────────────────────────────────────────────

  // Called when a driver or admin marks an order as "No Contact".
  // Removes order from the driver's route (auto-closes route if now empty),
  // and inserts into no_contact_orders so any driver can retry.
  const handleNoContact = async (routeId: string, order: IFoodOrder) => {
    const callerName = isDriver ? (driver?.name ?? "Admin") : "Admin";

    // ── 1. Optimistic local update AND DB persistence ──
    setCourierRoutes(prev => {
      const next = prev.map(r =>
        r.id === routeId
          ? { ...r, orders: r.orders.filter(o => o.id !== order.id) }
          : r
      );
      const cleaned = cleanupEmptyRoutes(next);

      // Persist the modified active route back to DB
      const activeRoute = cleaned.find(r => r.id === routeId);
      if (activeRoute) {
        (supabase as any).from("courier_routes").update({ orders: activeRoute.orders, updated_at: new Date().toISOString() }).eq("id", routeId).then(() => { });
      } else {
        // Route became empty, delete it
        (supabase as any).from("courier_routes").delete().eq("id", routeId).then(() => { });
      }

      if (!activeRoute) {
        setTimeout(() => setActiveTab("queue"), 0);
      }
      return cleaned;
    });
    // Optimistic no-contact entry (Realtime will confirm/replace)
    const tempNc: NoContactOrder = {
      id: `temp-${order.id}`,
      order_id: order.id,
      order_data: order,
      marked_by: callerName,
      attempt_count: 1,
      marked_at: new Date().toISOString(),
    };
    setNoContactOrders(prev => {
      const existing = prev.find(x => x.order_id === order.id);
      if (existing) return prev.map(x => x.order_id === order.id ? { ...x, attempt_count: x.attempt_count + 1 } : x);
      return [tempNc, ...prev];
    });
    toast.info(`Pedido #${order.displayId} movido para Retentativas.`);

    // ── 2. Persist to Supabase in background ──
    const { data: existing } = await (supabase as any)
      .from("no_contact_orders")
      .select("id, attempt_count")
      .eq("order_id", order.id)
      .limit(1);
    if (existing && existing.length > 0) {
      await (supabase as any)
        .from("no_contact_orders")
        .update({ attempt_count: (existing[0].attempt_count ?? 1) + 1, marked_by: callerName, marked_at: new Date().toISOString(), order_data: order as any })
        .eq("id", existing[0].id);
    } else {
      await (supabase as any).from("no_contact_orders").insert({
        order_id: order.id,
        order_data: order as any,
        marked_by: callerName,
        attempt_count: 1,
      });
    }
  };

  // ── Claim a no-contact order for a retry ───────────────────────────────────
  const handleClaimNoContact = async (nc: NoContactOrder) => {
    const currentDriver = driverRef.current;
    if (!currentDriver && !isAdmin) return;
    const driverName = currentDriver?.name ?? "Admin";

    // Delete from no_contact_orders (Realtime will update other clients)
    await (supabase as any).from("no_contact_orders").delete().eq("id", nc.id);

    // Add order to the claiming driver's route
    const orderToAdd = { ...nc.order_data, confirmed: false };
    setCourierRoutes(prev => {
      const destIdx = prev.findIndex(r => r.name.toLowerCase() === driverName.toLowerCase());
      if (destIdx >= 0) {
        const updated = [...prev];
        updated[destIdx] = { ...updated[destIdx], orders: [...updated[destIdx].orders, orderToAdd] };
        (supabase as any).from("courier_routes").update({ orders: updated[destIdx].orders }).eq("id", updated[destIdx].id).then(() => { });
        return updated;
      }
      const newRoute: CourierRoute = { id: generateId(), name: driverName, orders: [orderToAdd], startLat: storeLat, startLng: storeLng, createdAt: new Date().toISOString() };
      (supabase as any).from("courier_routes").insert({
        id: newRoute.id, name: newRoute.name, orders: newRoute.orders, start_lat: newRoute.startLat, start_lng: newRoute.startLng
      }).then(() => { });
      return [...prev, newRoute];
    });
    setNoContactOrders(prev => prev.filter(x => x.id !== nc.id));
    toast.success(`Pedido #${nc.order_data.displayId} adicionado à sua rota!`);
    // Switch to claiming driver's tab
    setTimeout(() => {
      setCourierRoutes(prev => {
        const ownRoute = prev.find(r => r.name.toLowerCase() === driverName.toLowerCase());
        if (ownRoute) setActiveTab(ownRoute.id);
        return prev;
      });
    }, 100);
  };

  // ── handleCloseCourierRoute removed — routes now close automatically ──────

  const handleOrderConfirmed = (routeId: string, orderId: string, code: string) => {
    setCourierRoutes((prev) => {
      const updated = prev.map((r) =>
        r.id === routeId
          ? { ...r, orders: r.orders.map((o) => o.id === orderId ? { ...o, confirmed: true, confirmationCode: code } : o) }
          : r
      );
      // Persist confirmed delivery to DB for driver analytics
      const route = prev.find(r => r.id === routeId);
      const order = route?.orders.find(o => o.id === orderId);
      if (route && order) {
        const distKm = haversineKm(storeLat, storeLng, order.lat || storeLat, order.lng || storeLng) * 2;
        // upsert prevents duplicate rows if iFood also concludes the order via event polling
        supabase.from("confirmed_orders").upsert({
          ifood_order_id: order.id,
          customer_name: order.customerName,
          customer_address: order.address,
          motoboy_name: route.name,
          status: "confirmed",
          distance_km: Math.round(distKm * 10) / 10,
          order_total_cents: order.deliveryFee || 0,
          order_code: String(Math.round(Number(order.total || 0) * 100)),
          delivery_lat: order.lat || storeLat,
          delivery_lng: order.lng || storeLng,
          confirmed_at: new Date().toISOString(),
        }, { onConflict: "ifood_order_id" }).then(({ error }) => {
          if (error) console.error("[Index] Error upserting confirmed_order (manual):", error);
        });
        // Delete from pending_orders — order is confirmed, no longer pending
        supabase.from("pending_orders").delete().eq("id", order.id).then(() => { });
      }
      const cleaned = cleanupEmptyRoutes(updated);
      // If the route became empty, delete it from courier_routes DB
      const routeStillExists = cleaned.some(r => r.id === routeId);
      if (!routeStillExists) {
        (supabase as any).from("courier_routes").delete().eq("id", routeId).then(() => { });
      } else {
        // Route still has orders — update it so others see the confirmed state
        const updatedRoute = cleaned.find(r => r.id === routeId);
        if (updatedRoute) {
          (supabase as any).from("courier_routes").update({
            orders: updatedRoute.orders,
            updated_at: new Date().toISOString(),
          }).eq("id", routeId).then(() => { });
        }
      }
      return cleaned;
    });
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
          id: generateId(),
          name: driver.name,
          orders: [order],
          startLat,
          startLng,
          createdAt: new Date().toISOString(),
        };
        return [...withoutOrder, newRoute];
      }
    });

    // Delete from pending_orders just in case it was still there
    supabase.from("pending_orders").delete().eq("id", orderId).then(() => { });
    setOrders((prev) => prev.filter((o) => o.id !== orderId));

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
      return [...withoutOrder, { id: generateId(), name: toDriver, orders: [order], createdAt: new Date().toISOString() }];
    });

    // Delete from pending_orders just in case it was still there
    supabase.from("pending_orders").delete().eq("id", orderId).then(() => { });
    setOrders((prev) => prev.filter((o) => o.id !== orderId));

    toast.success(`Pedido reatribuído para ${toDriver}.`);
  };

  const handleConfirmOrderInQueue = (orderId: string, code: string) => {
    setOrders((prev) =>
      prev.map((o) => o.id === orderId ? { ...o, confirmed: true, confirmationCode: code } : o)
    );
  };


  // Gather all order IDs that are currently in any active route
  const assignedOrderIds = new Set<string>();
  courierRoutes.forEach(r => r.orders.forEach(o => assignedOrderIds.add(o.id)));

  // Filter queue to show only orders that are NOT confirmed AND NOT assigned to a route
  let unconfirmedOrders = orders.filter((o) => !o.confirmed && !assignedOrderIds.has(o.id));
  
  // Apply delay sorting if toggled
  if (sortByDelay) {
    unconfirmedOrders = [...unconfirmedOrders].sort((a, b) => getOrderDelay(b) - getOrderDelay(a));
  }
  
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
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header - Dark Theme Pill Style */}
      <header className={`pt-12 pb-4 px-4 sticky top-0 z-40 bg-background ${activeTab === 'map' ? 'hidden sm:block' : ''}`}>
        <div className="container max-w-lg mx-auto flex items-center justify-between">
          
          {/* Left: Current Store Pill */}
          <div className="flex items-center gap-3 bg-[#1C1C1E] border border-white/5 rounded-full pl-2 pr-4 py-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
              <Store size={14} className="text-white" />
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Loja Atual</span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-white truncate max-w-[130px] sm:max-w-[200px]">
                  {storeAddress ? storeAddress.split(",")[0] : 'Sem Loja'}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => { haptic(); fetchOrders(false); }}
              disabled={loading || polling}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-[#1C1C1E] border border-white/5 text-muted-foreground hover:text-white transition-all outline-none"
            >
              {loading ? <Loader2 size={16} className="animate-spin text-white" /> : <RefreshCw size={16} />}
            </button>
            <div className="relative">
              <button
                onClick={() => { haptic(); setShowNotifications(true); }}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-[#1C1C1E] border border-white/5 text-muted-foreground hover:text-white transition-all outline-none"
              >
                <Bell size={16} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-sm ring-2 ring-background">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            </div>
            <ProfileMenu 
              backgroundMode={backgroundMode}
              setBackgroundMode={setBackgroundMode}
              driverLocationName={driverLocation?.address}
            />
          </div>

        </div>
      </header>

      <main className={`container py-6 pb-40 space-y-6 max-w-lg mx-auto ${activeTab === 'map' ? 'hidden' : ''}`}>
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

        {/* ── Driver map view is now outside main ── */}
        {/* ── Courier tab view ── */}
        {!needsAuth && !checkingAuth && activeTab !== "queue" && activeTab !== "retentativas" && activeTab !== "map" && activeTab !== "dev_panel" && activeTab !== "ranking" && (
          activeRouteData ? (
            <CourierTab
              route={activeRouteData}
              storeLat={storeLat}
              storeLng={storeLng}
              currentDriverName={isDriver ? driver?.name ?? null : null}
              isAdmin={isAdmin}
              outgoingPending={outgoingPending}
              onOrderConfirmed={handleOrderConfirmed}
              onNoContact={(routeId, order) => handleNoContact(routeId, order)}
              onRequestTransfer={(order, ownerName) => { requestTransfer(order, ownerName); triggerPoll(); }}
              onAdminReassign={(fromRouteId, orderId, toDriver) => handleAdminReassign(fromRouteId, orderId, toDriver)}
            />
          ) : activeTab === "minha_rota" ? (
            <div className="text-center py-20 px-4">
              <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-6 shadow-inner">
                <Bike size={36} className="text-primary opacity-60" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Sem Rotas Ativas</h2>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto mb-6 leading-relaxed">
                Você não possui nenhuma rota ou entrega em andamento no momento.
              </p>
              <button
                onClick={() => { haptic(); setActiveTab("queue"); }}
                className="bg-primary text-primary-foreground font-semibold px-6 py-3 rounded-full hover:bg-primary/90 transition-all ios-btn shadow-lg shadow-primary/20"
              >
                Ver Fila de Pedidos
              </button>
            </div>
          ) : null
        )}

        {/* ── Retentativas (No-Contact) section ── */}
        {!needsAuth && !checkingAuth && activeTab === "retentativas" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <UserX size={18} className="text-orange-400" />
              <h2 className="font-semibold text-foreground">Retentativas de Entrega</h2>
              <span className="ml-auto text-xs text-muted-foreground">{noContactOrders.length} pedido(s)</span>
            </div>
            {noContactOrders.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">Nenhuma retentativa no momento.</div>
            ) : (
              <div className="space-y-3">
                {noContactOrders.map(nc => (
                  <NoContactCard
                    key={nc.id}
                    nc={nc}
                    isAdmin={isAdmin}
                    onClaim={() => handleClaimNoContact(nc)}
                    onAdminAssign={async (driverName) => {
                      // Admin assigns directly to a specific driver
                      await (supabase as any).from("no_contact_orders").delete().eq("id", nc.id);
                      const orderToAdd = { ...nc.order_data, confirmed: false };
                      setCourierRoutes(prev => {
                        const idx = prev.findIndex(r => r.name.toLowerCase() === driverName.toLowerCase());
                        if (idx >= 0) {
                          const updated = [...prev];
                          updated[idx] = { ...updated[idx], orders: [...updated[idx].orders, orderToAdd] };
                          (supabase as any).from("courier_routes").update({ orders: updated[idx].orders }).eq("id", updated[idx].id).then(() => { });
                          return updated;
                        }
                        const newRoute: CourierRoute = { id: generateId(), name: driverName, orders: [orderToAdd], startLat: storeLat, startLng: storeLng, createdAt: new Date().toISOString() };
                        (supabase as any).from("courier_routes").insert({
                          id: newRoute.id, name: newRoute.name, orders: newRoute.orders, start_lat: newRoute.startLat, start_lng: newRoute.startLng
                        }).then(() => { });
                        return [...prev, newRoute];
                      });
                      setNoContactOrders(prev => prev.filter(x => x.id !== nc.id));
                      toast.success(`Pedido #${nc.order_data.displayId} reatribuído para ${driverName}.`);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}



        {/* ── Dev / Test Panel (Admin Only) ── */}
        {!needsAuth && !checkingAuth && activeTab === "dev_panel" && isAdmin && (
          <div className="space-y-6 max-w-2xl mx-auto bg-card p-6 rounded-xl border border-border">
            <div className="flex items-center gap-2 mb-4">
              <FlaskConical size={20} className="text-purple-500" />
              <h2 className="font-semibold text-foreground text-lg">Ambiente de Testes</h2>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-sm text-foreground">🌍 Localização da Loja (Manual/Coords)</h3>
              <p className="text-xs text-muted-foreground">Mude a coordenada base da loja para simular as entregas a partir de outro local geográfico exato.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground">Latitude</label>
                  <input type="number" step="any" value={storeLat} onChange={e => {
                    const v = parseFloat(e.target.value);
                    setStoreLat(v);
                    storeLocationOverriddenRef.current = true;
                    localStorage.setItem(LS_STORE_KEY, JSON.stringify({ lat: v, lng: storeLng }));
                  }} className="w-full bg-input text-sm text-foreground rounded-md px-3 py-2 outline-none border border-border focus:border-purple-500 mt-1" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Longitude</label>
                  <input type="number" step="any" value={storeLng} onChange={e => {
                    const v = parseFloat(e.target.value);
                    setStoreLng(v);
                    storeLocationOverriddenRef.current = true;
                    localStorage.setItem(LS_STORE_KEY, JSON.stringify({ lat: storeLat, lng: v }));
                  }} className="w-full bg-input text-sm text-foreground rounded-md px-3 py-2 outline-none border border-border focus:border-purple-500 mt-1" />
                </div>
              </div>
            </div>

            <div className="space-y-4 mt-8 pt-8 border-t border-border">
              <h3 className="font-medium text-sm text-foreground">📦 Gerador de Pedidos Fictícios</h3>
              <p className="text-xs text-muted-foreground">Cria 3 pedidos aleatórios num raio de ~2km ao redor das coordenadas atuais da loja para testar as rotas no mapa.</p>
              <div className="flex flex-wrap gap-3 mt-2">
                <button onClick={handleGenerateTestOrders} disabled={isGeneratingTestOrders} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm disabled:opacity-50 transition-colors">
                  {isGeneratingTestOrders ? <Loader2 size={16} className="animate-spin" /> : <PackagePlus size={16} />}
                  Gerar 3 Pedidos Teste
                </button>
                <button onClick={handleClearTestOrders} className="bg-red-500/10 text-red-500 hover:bg-red-500/20 px-4 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors">
                  <Trash2 size={16} /> Limpar Testes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Main queue view ── */}
        {!needsAuth && !checkingAuth && activeTab === "queue" && (
          <>
            {/* ── Today's Earnings (Motoboy) - ALWAYS VISIBLE AT TOP ── */}
            <div className="relative rounded-[1.25rem] p-4 flex items-center justify-between shadow-xl shadow-black/20 border border-white/5 bg-[#1C1C1E] mb-4 overflow-hidden">
              {/* Subtle blue accent background glow */}
              <div className="absolute left-0 top-0 bottom-0 w-20 bg-blue-500/5 blur-xl pointer-events-none" />
              
              <div className="flex items-center gap-4 relative z-10">
                <div className="w-10 h-8 rounded-[8px] flex items-center justify-center text-[#1E90FF] bg-[#1E90FF]/10 shadow-inner ring-1 ring-[#1E90FF]/20">
                  <Wallet size={18} fill="currentColor" strokeWidth={0} />
                </div>
                <div>
                  <h2 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1">
                    {isAdmin ? "Faturamento de Hoje" : "Ganhos de Hoje"}
                  </h2>
                  <p className="text-xl font-bold text-white tracking-tight leading-none">
                    R$ {(driverTodayStats.earningsCents / 100).toFixed(2).replace(".", ",")}
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-end relative z-10">
                <span className="text-[11px] font-semibold text-muted-foreground mb-1 leading-none">
                  Entregas
                </span>
                <span className="text-xl font-bold text-white tracking-tight leading-none">
                  {driverTodayStats.deliveries}
                </span>
              </div>
            </div>



            {/* ── Retentativas (No Contact) ── */}
            {noContactOrders.length > 0 && (
              <button
                onClick={() => { haptic(); setActiveTab("retentativas"); }}
                className="w-full glass-card rounded-xl p-4 flex items-center justify-between bg-orange-500/10 border-orange-500/20 active:scale-[0.98] transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center text-orange-500">
                    <UserX size={20} />
                  </div>
                  <div className="text-left">
                    <h2 className="font-bold text-orange-500 text-sm">Retentativas ({noContactOrders.length})</h2>
                    <p className="text-[11px] text-orange-500/80">Pedidos sem contato com o cliente</p>
                  </div>
                </div>
                <ChevronRight size={18} className="text-orange-500" />
              </button>
            )}

            {/* ── Active Routes (Motoboys) ── */}
            {(() => {
              const visibleRoutes = courierRoutes.filter(r =>
                r.orders.some(o => !o.confirmed) &&
                (!isDriver || r.name.toLowerCase() !== driver?.name.toLowerCase())
              );

              if (visibleRoutes.length === 0) return null;

              return (
                <div className="mt-4">
                  <div className="pl-2 mb-2">
                    <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Motoboys em Rota</h2>
                  </div>
                  {/* Horizontal Scroll wrapper */}
                  <div className="flex overflow-x-auto gap-3 pb-3 px-1 scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {visibleRoutes.map(r => {
                      const activeCount = r.orders.filter(o => !o.confirmed).length;
                      return (
                        <button key={r.id} onClick={() => { haptic(); setActiveTab(r.id); }} className="flex-shrink-0 w-[240px] flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 active:bg-white/15 active:scale-95 transition-all rounded-[1.25rem] border border-white/5 text-left outline-none">
                          <div className="w-12 h-12 rounded-[14px] bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-inner">
                            {driverEmojis[r.name] ? <AppleEmoji name={driverEmojis[r.name]} size={28} /> : <Bike size={20} className="text-primary" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-white text-[15px] truncate">{r.name}</p>
                            <p className="text-xs text-white/50 truncate mt-0.5">{activeCount} pedido(s) em rota</p>
                          </div>
                          <ChevronRight size={16} className="text-white/30 flex-shrink-0" />
                        </button>
                      )
                    })}
                  </div>
                </div>
              );
            })()}

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
                <div className="flex items-center justify-between mb-4 mt-2 px-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#1E90FF]" style={{ boxShadow: '0 0 10px rgba(30,144,255,0.8)' }} />
                    <h2 className="text-[17px] font-bold text-white tracking-tight">Fila de Pedidos</h2>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[13px] font-medium text-muted-foreground mr-1">
                      {unconfirmedOrders.length} novos
                    </span>
                    <button
                      onClick={() => setSortByDelay(!sortByDelay)}
                      className={`text-[11px] font-semibold uppercase tracking-wider transition-colors border px-2 py-1 rounded ${sortByDelay ? 'text-white bg-red-500/20 border-red-500/50' : 'text-muted-foreground border-white/10 hover:text-white'}`}
                      title="Ordenar do mais atrasado para o mais recente"
                    >
                      {sortByDelay ? "🔥 Atrasados" : "⏳ Por Atraso"}
                    </button>
                    <button
                      onClick={selectAll}
                      className="text-[11px] font-semibold text-[#1E90FF] uppercase tracking-wider hover:text-white transition-colors ml-1"
                    >
                      {selectedIds.size === unconfirmedOrders.length ? "Desmarcar" : "Selecionar"}
                    </button>
                  </div>
                </div>

                <div className={`space-y-3 ${selectedOrders.length > 0 ? "pb-40" : ""}`}>
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

        {/* Modal: Edit Store Address */}
        {editingStoreAddr && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#1C1C1E] border border-white/10 p-5 rounded-[1.75rem] w-full max-w-sm shadow-2xl animate-scale-in">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <Store size={20} className="text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white leading-tight">Endereço da Loja</h3>
                  <p className="text-xs text-muted-foreground">Ponto de partida das entregas</p>
                </div>
              </div>
              
              <input
                autoFocus
                value={storeAddrInput}
                onChange={e => setStoreAddrInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { saveStoreAddress(storeAddrInput); setEditingStoreAddr(false); } if (e.key === "Escape") setEditingStoreAddr(false); }}
                placeholder="Ex: Rua das Flores, 123 – Centro"
                className="w-full bg-black/40 text-sm text-white placeholder-white/30 rounded-xl px-4 py-3.5 outline-none border border-white/10 focus:border-primary transition-colors mb-5"
              />
              
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setEditingStoreAddr(false)}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => { saveStoreAddress(storeAddrInput); setEditingStoreAddr(false); }}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        )}

            {/* Route / Assign actions */}
            {selectedOrders.length > 0 && (
              <div className="fixed bottom-28 inset-x-4 z-40 space-y-2 pointer-events-auto">
                <div className="glass-card rounded-lg p-3 space-y-2 shadow-2xl border border-white/20 bg-background/80 backdrop-blur-xl max-w-md mx-auto relative">
                  <p className="text-xs text-muted-foreground">
                    <Route size={11} className="inline mr-1" />
                    Loja → {optimizedRoute.map((o) => o.customerName).join(" → ")} → Loja
                  </p>
                  <div className="space-y-1.5">
                    {/* Admin: full dispatch modal | Driver: assign to self only */}
                    {isAdmin ? (
                      <button
                        onClick={() => setShowAssignModal(true)}
                        className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all glow-primary flex items-center justify-center gap-2 ios-btn"
                      >
                        <Bike size={16} /> Enviar para Motoboy ({selectedOrders.length})
                      </button>
                    ) : (
                      <button
                        onClick={() => driver && handleAssignCourier(driver.name)}
                        disabled={assigning || !driver}
                        className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all glow-primary flex items-center justify-center gap-2 disabled:opacity-50 ios-btn"
                      >
                        {assigning ? <Loader2 size={16} className="animate-spin" /> : <Bike size={16} />}
                        {assigning ? "Atribuindo..." : `Atribuir a Mim (${selectedOrders.length})`}
                      </button>
                    )}
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

        {/* ── Ranking View ── */}
        {!needsAuth && !checkingAuth && activeTab === "ranking" && (
          <RankingTab />
        )}
      </main>

      {/* ── Driver Map View (Outside Main Container) ── */}
      {!needsAuth && !checkingAuth && activeTab === "map" && isAdmin && (
        <div className="fixed inset-0 z-30 pt-[72px] sm:pt-[72px]">
          <TrackingMap storeLat={storeLat} storeLng={storeLng} routes={courierRoutes} />
        </div>
      )}

      {/* ── Dark Theme Floating Bottom Nav ── */}
      {!needsAuth && !checkingAuth && (
        <div className="fixed bottom-6 inset-x-0 z-50 px-4 flex justify-center pointer-events-none">
          <div className="bg-[#111111] backdrop-blur-xl rounded-[2rem] flex items-center justify-between px-2 py-2 shadow-2xl overflow-x-auto max-w-sm w-full pointer-events-auto hide-scrollbar border border-white/5 relative">

            <button
              onClick={() => { haptic(); setActiveTab("queue"); }}
              className={`flex items-center justify-center w-12 h-12 rounded-full transition-all outline-none border-none relative ${activeTab === "queue" ? "bg-[#2D2D2D] text-white" : "text-muted-foreground hover:text-white/80"}`}
            >
              <div className="relative flex items-center justify-center w-full h-full">
                <Package size={20} />
                {unconfirmedOrders.length > 0 && (
                  <span className="absolute top-2 right-2 w-3.5 h-3.5 rounded-full bg-[#FF7F00] text-white text-[9px] font-bold flex items-center justify-center shadow-md border-2 border-[#111111]">
                    {unconfirmedOrders.length > 9 ? '9+' : unconfirmedOrders.length}
                  </span>
                )}
              </div>
            </button>

            {isDriver && driver && (
              <button
                onClick={() => {
                  haptic();
                  const myRoute = courierRoutes.find(r => r.name === driver.name && r.orders.some(o => !o.confirmed));
                  setActiveTab(myRoute ? myRoute.id : "minha_rota");
                }}
                className={`flex items-center justify-center w-12 h-12 rounded-full transition-all outline-none border-none relative ${(courierRoutes.some(r => r.name === driver.name && r.id === activeTab) || activeTab === "minha_rota") ? "bg-[#2D2D2D] text-white" : "text-muted-foreground hover:text-white/80"}`}
              >
                <div className="relative flex items-center justify-center w-full h-full">
                  {driverEmojis[driver.name] ? (
                    <AppleEmoji name={driverEmojis[driver.name]} size={20} />
                  ) : (
                    <Bike size={20} />
                  )}
                  {(() => {
                    const myRoute = courierRoutes.find(r => r.name === driver.name && r.orders.some(o => !o.confirmed));
                    const badgeCount = myRoute ? myRoute.orders.filter(o => !o.confirmed).length : 0;
                    return badgeCount > 0 ? (
                      <span className="absolute top-2 right-2 w-3.5 h-3.5 rounded-full bg-[#34C759] text-white text-[9px] font-bold flex items-center justify-center shadow-md border-2 border-[#111111]">
                        {badgeCount > 9 ? '9+' : badgeCount}
                      </span>
                    ) : null;
                  })()}
                </div>
              </button>
            )}

            <button
              onClick={() => { haptic(); setActiveTab("ranking"); }}
              className={`flex items-center justify-center w-12 h-12 rounded-full transition-all outline-none border-none relative ${activeTab === "ranking" ? "bg-[#2D2D2D] text-white" : "text-muted-foreground hover:text-white/80"}`}
            >
              <div className="relative flex items-center justify-center w-full h-full">
                <Trophy size={20} />
              </div>
            </button>

            {isAdmin && (
              <button
                onClick={() => { haptic(); setActiveTab("map"); }}
                className={`flex items-center justify-center w-12 h-12 rounded-full transition-all outline-none border-none relative ${activeTab === "map" ? "bg-[#2D2D2D] text-white" : "text-muted-foreground hover:text-white/80"}`}
              >
                <div className="relative flex items-center justify-center w-full h-full">
                  <MapPin size={20} />
                </div>
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => { haptic(); setActiveTab("dev_panel"); }}
                className={`flex items-center justify-center w-12 h-12 rounded-full transition-all outline-none border-none relative ${activeTab === "dev_panel" ? "bg-[#2D2D2D] text-white" : "text-muted-foreground hover:text-white/80"}`}
              >
                <div className="relative flex items-center justify-center w-full h-full">
                  <FlaskConical size={20} />
                </div>
              </button>
            )}
          </div>
        </div>
      )}

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
          key={incomingRequest.id}
          order={incomingRequest.order_data}
          fromDriverName={incomingRequest.current_owner_name}
          toDriverName={incomingRequest.requester_name}
          onCancel={rejectIncoming}
          onApprove={() => {
            // Remove order from my local route then switch to queue
            setCourierRoutes(prev =>
              prev.map(r =>
                r.orders.some(o => o.id === incomingRequest.order_id)
                  ? { ...r, orders: r.orders.filter(o => o.id !== incomingRequest.order_id) }
                  : r
              ).filter(r => r.orders.length > 0)
            );
            setActiveTab("queue");
            approveIncoming();
          }}
        />
      )}

      {showNotifications && (
        <NotificationCenter onClose={() => setShowNotifications(false)} />
      )}
    </div>
  );
};

export default Index;

/* ─────────────────────────── NoContactCard ─────────────────────────────── */
interface NoContactCardProps {
  nc: import("@/lib/types").NoContactOrder;
  isAdmin: boolean;
  onClaim: () => void;
  onAdminAssign: (driverName: string) => Promise<void>;
}

function NoContactCard({ nc, isAdmin, onClaim, onAdminAssign }: NoContactCardProps) {
  const [showAssign, setShowAssign] = useState(false);
  const [drivers, setDrivers] = useState<string[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const openAssign = async () => {
    setShowAssign(true);
    if (drivers.length > 0) return;
    setLoadingDrivers(true);
    const { data } = await supabase.from("drivers").select("name").eq("status", "active");
    setDrivers((data || []).map((d: { name: string }) => d.name));
    setLoadingDrivers(false);
  };

  return (
    <div className="glass-card rounded-xl p-4 space-y-3 border-l-4 border-l-orange-500/60">
      {/* Order info */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">#{nc.order_data.displayId}</span>
            {nc.attempt_count > 1 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
                {nc.attempt_count}ª tentativa
              </span>
            )}
          </div>
          <p className="font-semibold text-foreground mt-1">{nc.order_data.customerName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{nc.order_data.address}</p>
        </div>
        <span className="text-sm font-semibold text-foreground whitespace-nowrap">
          R$ {(nc.order_data.total / 100).toFixed(2)}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <UserX size={11} className="text-orange-400" /> Marcado por {nc.marked_by}
        </span>
        {nc.order_data.customerPhone && (
          <a href={`tel:${nc.order_data.customerPhone}`} className="text-primary hover:underline">
            {nc.order_data.customerPhone}
          </a>
        )}
      </div>

      {/* Driver: retry button */}
      {!isAdmin && (
        <button
          onClick={onClaim}
          className="w-full py-2.5 rounded-lg bg-orange-500/15 border border-orange-500/30 text-sm text-orange-400 font-medium hover:bg-orange-500/25 hover:border-orange-500/50 transition-all flex items-center justify-center gap-2"
        >
          <RotateCcw size={14} /> Tentar novamente
        </button>
      )}

      {/* Admin: reassign to driver dropdown */}
      {isAdmin && !showAssign && (
        <button
          onClick={openAssign}
          className="w-full py-2.5 rounded-lg bg-secondary border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all flex items-center justify-center gap-2"
        >
          <RefreshCw size={14} /> Reatribuir para motorista
        </button>
      )}
      {isAdmin && showAssign && (
        <div className="space-y-2 animate-slide-up">
          <p className="text-xs text-muted-foreground">Selecionar motorista:</p>
          {loadingDrivers ? (
            <div className="flex items-center justify-center py-2"><Loader2 size={16} className="animate-spin text-primary" /></div>
          ) : drivers.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-1">Nenhum motorista ativo.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {drivers.map(name => (
                <button key={name}
                  disabled={assigning}
                  onClick={async () => { setAssigning(true); await onAdminAssign(name); setAssigning(false); setShowAssign(false); }}
                  className="w-full py-2 px-3 rounded-lg bg-primary/10 text-sm text-primary font-medium hover:bg-primary/20 transition-all text-left disabled:opacity-50"
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => setShowAssign(false)} className="text-xs text-muted-foreground hover:text-foreground w-full text-center py-1">Cancelar</button>
        </div>
      )}
    </div>
  );
}
