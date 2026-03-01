import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { IFoodOrder } from "@/lib/types";
import { toast } from "sonner";

export interface TransferRequest {
  id: string;
  order_id: string;
  order_data: IFoodOrder;
  requester_name: string;
  current_owner_name: string;
  status: string;
  created_at: string;
}

interface UseTransferRequestsOptions {
  myName: string | null;
  onOrderApproved: (order: IFoodOrder, startLat: number, startLng: number) => void;
  storeLat: number;
  storeLng: number;
}

// ─── Browser notification helpers ────────────────────────────────────────────
function requestNotificationPermission() {
  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function sendBrowserNotification(title: string, body: string, tag: string) {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
  const n = new Notification(title, { body, tag, icon: "/favicon.ico", requireInteraction: true });
  n.onclick = () => { window.focus(); n.close(); };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useTransferRequests({
  myName, onOrderApproved, storeLat, storeLng,
}: UseTransferRequestsOptions) {
  const [incomingRequest, setIncomingRequest] = useState<TransferRequest | null>(null);
  const [outgoingPending, setOutgoingPending] = useState<Set<string>>(new Set());
  // Notifications saved while offline — shown as persistent badge on mount
  const [pendingNotifications, setPendingNotifications] = useState<TransferRequest[]>([]);
  const handledRef = useRef<Set<string>>(new Set()); // prevent duplicate popups

  // Request browser notification permission on mount
  useEffect(() => { requestNotificationPermission(); }, []);

  // ── On mount: load pending requests saved while driver was offline ──────────
  useEffect(() => {
    if (!myName) return;
    (async () => {
      const { data } = await supabase
        .from("transfer_requests")
        .select("*")
        .eq("current_owner_name", myName)
        .eq("status", "pending")
        .order("created_at", { ascending: true });

      if (!data || data.length === 0) return;

      // Mark all as handled so Realtime doesn't double-fire
      data.forEach(r => handledRef.current.add(r.id));
      setPendingNotifications(data as unknown as TransferRequest[]);

      // Show the first one immediately as a popup
      setIncomingRequest(data[0] as unknown as TransferRequest);

      // Browser notification for each one missed
      data.forEach(r => {
        sendBrowserNotification(
          "🛵 Solicitação de Transferência (pendente)",
          `${r.requester_name} quer o pedido #${(r.order_data as any)?.displayId}`,
          `xfer-${r.id}`
        );
      });
    })();

    // Also load outgoing pending orders for this driver
    supabase.from("transfer_requests")
      .select("order_id").eq("requester_name", myName).eq("status", "pending")
      .then(({ data }) => {
        if (data?.length) setOutgoingPending(new Set(data.map(r => r.order_id)));
      });
  }, [myName]);

  // ── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    if (!myName) return;

    const channel = supabase
      .channel(`xfer-${encodeURIComponent(myName)}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "transfer_requests",
      }, (payload) => {
        const req = payload.new as TransferRequest;
        if (req.current_owner_name.toLowerCase() !== myName.toLowerCase()) return;
        if (req.status !== "pending") return;
        if (handledRef.current.has(req.id)) return; // already shown from mount query
        handledRef.current.add(req.id);

        setIncomingRequest(prev => prev ?? req); // don't replace if already showing one
        setPendingNotifications(prev => [...prev, req]);
        sendBrowserNotification(
          "🛵 Solicitação de Transferência",
          `${req.requester_name} quer o pedido #${req.order_data?.displayId} de ${req.order_data?.customerName ?? ""}`,
          `transfer-${req.id}`
        );
        toast.info(`🛵 ${req.requester_name} quer transferir um pedido!`, {
          duration: 10000,
          action: { label: "Ver", onClick: () => setIncomingRequest(req) },
        });
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "transfer_requests",
      }, async (payload) => {
        const req = payload.new as TransferRequest;
        if (req.requester_name.toLowerCase() !== myName.toLowerCase()) return;
        if (req.status === "approved") {
          let lat = storeLat, lng = storeLng;
          try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
              navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
            );
            lat = pos.coords.latitude; lng = pos.coords.longitude;
          } catch { /* store fallback */ }
          onOrderApproved({ ...req.order_data, confirmed: false }, lat, lng);
          setOutgoingPending(prev => { const n = new Set(prev); n.delete(req.order_id); return n; });
          await supabase.from("transfer_requests").update({ status: "completed" }).eq("id", req.id);
          sendBrowserNotification("✅ Transferência aprovada!", `Pedido #${req.order_data?.displayId} está na sua rota.`, `approved-${req.id}`);
        } else if (req.status === "rejected") {
          setOutgoingPending(prev => { const n = new Set(prev); n.delete(req.order_id); return n; });
          sendBrowserNotification("❌ Transferência recusada", `${req.current_owner_name} recusou o pedido #${req.order_data?.displayId}.`, `rejected-${req.id}`);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [myName, storeLat, storeLng, onOrderApproved]);

  const requestTransfer = useCallback(async (order: IFoodOrder, currentOwnerName: string): Promise<boolean> => {
    if (!myName) return false;
    const { error } = await supabase.from("transfer_requests").insert({
      order_id: order.id,
      order_data: order as any,
      requester_name: myName,
      current_owner_name: currentOwnerName,
    });
    if (!error) setOutgoingPending(prev => new Set([...prev, order.id]));
    return !error;
  }, [myName]);

  const approveIncoming = useCallback(async () => {
    if (!incomingRequest) return;
    await supabase.from("transfer_requests").update({ status: "approved" }).eq("id", incomingRequest.id);
    // Move to next pending notification if any
    setPendingNotifications(prev => {
      const rest = prev.filter(r => r.id !== incomingRequest.id);
      setIncomingRequest(rest[0] ?? null);
      return rest;
    });
  }, [incomingRequest]);

  const rejectIncoming = useCallback(async () => {
    if (!incomingRequest) return;
    await supabase.from("transfer_requests").update({ status: "rejected" }).eq("id", incomingRequest.id);
    setPendingNotifications(prev => {
      const rest = prev.filter(r => r.id !== incomingRequest.id);
      setIncomingRequest(rest[0] ?? null);
      return rest;
    });
  }, [incomingRequest]);

  return {
    incomingRequest,
    outgoingPending,
    pendingNotifications,
    requestTransfer,
    approveIncoming,
    rejectIncoming,
  };
}
