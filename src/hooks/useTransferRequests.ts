import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { IFoodOrder, CourierRoute } from "@/lib/types";

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

/** Request browser notification permission once on mount */
function requestNotificationPermission() {
  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function sendBrowserNotification(title: string, body: string, tag: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  const n = new Notification(title, {
    body,
    tag, // prevents duplicate notifications with same tag
    icon: "/favicon.ico",
    requireInteraction: true, // stays until dismissed
  });
  n.onclick = () => { window.focus(); n.close(); };
}

export function useTransferRequests({
  myName, onOrderApproved, storeLat, storeLng,
}: UseTransferRequestsOptions) {
  const [incomingRequest, setIncomingRequest] = useState<TransferRequest | null>(null);
  const [outgoingPending, setOutgoingPending] = useState<Set<string>>(new Set());

  // Request notification permission on mount
  useEffect(() => { requestNotificationPermission(); }, []);

  useEffect(() => {
    if (!myName) return;

    const channel = supabase
      .channel(`xfer-${encodeURIComponent(myName)}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "transfer_requests",
      }, (payload) => {
        const req = payload.new as TransferRequest;
        if (req.current_owner_name.toLowerCase() === myName.toLowerCase() && req.status === "pending") {
          setIncomingRequest(req);
          // 🔔 Browser notification — works even when this tab is in background
          sendBrowserNotification(
            "🛵 Solicitação de Transferência",
            `${req.requester_name} quer o pedido #${req.order_data?.displayId} de ${req.order_data?.customerName ?? ""}`,
            `transfer-${req.id}`
          );
        }
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "transfer_requests",
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
          onOrderApproved(req.order_data, lat, lng);
          setOutgoingPending(prev => { const n = new Set(prev); n.delete(req.order_id); return n; });
          await supabase.from("transfer_requests").update({ status: "completed" }).eq("id", req.id);
          sendBrowserNotification("✅ Transferência aprovada!", `Pedido #${req.order_data?.displayId} está na sua rota.`, `approved-${req.id}`);
        } else if (req.status === "rejected") {
          setOutgoingPending(prev => { const n = new Set(prev); n.delete(req.order_id); return n; });
          sendBrowserNotification("❌ Transferência recusada", `${req.current_owner_name} recusou a transferência do pedido #${req.order_data?.displayId}.`, `rejected-${req.id}`);
        }
      })
      .subscribe();

    supabase.from("transfer_requests")
      .select("order_id").eq("requester_name", myName).eq("status", "pending")
      .then(({ data }) => {
        if (data?.length) setOutgoingPending(new Set(data.map(r => r.order_id)));
      });

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
    setIncomingRequest(null);
  }, [incomingRequest]);

  const rejectIncoming = useCallback(async () => {
    if (!incomingRequest) return;
    await supabase.from("transfer_requests").update({ status: "rejected" }).eq("id", incomingRequest.id);
    setIncomingRequest(null);
  }, [incomingRequest]);

  return { incomingRequest, outgoingPending, requestTransfer, approveIncoming, rejectIncoming };
}
