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
  /** Logged-in driver name (null for admins — hook is no-op) */
  myName: string | null;
  /** Called when a request I sent gets approved — I should add the order to my route */
  onOrderApproved: (order: IFoodOrder, startLat: number, startLng: number) => void;
  storeLat: number;
  storeLng: number;
}

export function useTransferRequests({
  myName,
  onOrderApproved,
  storeLat,
  storeLng,
}: UseTransferRequestsOptions) {
  const [incomingRequest, setIncomingRequest] = useState<TransferRequest | null>(null);
  /** Order IDs that I (as requester) have sent a pending request for */
  const [outgoingPending, setOutgoingPending] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!myName) return;

    const channel = supabase
      .channel(`xfer-${encodeURIComponent(myName)}`)
      // Incoming: someone wants an order I currently hold
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "transfer_requests",
      }, (payload) => {
        const req = payload.new as TransferRequest;
        if (req.current_owner_name.toLowerCase() === myName.toLowerCase() && req.status === "pending") {
          setIncomingRequest(req);
        }
      })
      // Outgoing: my request status changed
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "transfer_requests",
      }, async (payload) => {
        const req = payload.new as TransferRequest;
        if (req.requester_name.toLowerCase() !== myName.toLowerCase()) return;

        if (req.status === "approved") {
          // Get current GPS or fall back to store
          let lat = storeLat, lng = storeLng;
          try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
              navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
            );
            lat = pos.coords.latitude;
            lng = pos.coords.longitude;
          } catch { /* use store as fallback */ }

          onOrderApproved(req.order_data, lat, lng);
          setOutgoingPending(prev => { const n = new Set(prev); n.delete(req.order_id); return n; });
          // Mark completed
          await supabase.from("transfer_requests").update({ status: "completed" }).eq("id", req.id);
        } else if (req.status === "rejected") {
          setOutgoingPending(prev => { const n = new Set(prev); n.delete(req.order_id); return n; });
        }
      })
      .subscribe();

    // Restore any existing pending outgoing
    supabase.from("transfer_requests")
      .select("order_id")
      .eq("requester_name", myName)
      .eq("status", "pending")
      .then(({ data }) => {
        if (data?.length) setOutgoingPending(new Set(data.map(r => r.order_id)));
      });

    return () => { supabase.removeChannel(channel); };
  }, [myName, storeLat, storeLng, onOrderApproved]);

  /** Driver A calls this to request an order from Driver B */
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

  /** Driver B (owner) approves — marks DB approved; caller must remove order from their own local route */
  const approveIncoming = useCallback(async () => {
    if (!incomingRequest) return;
    await supabase.from("transfer_requests").update({ status: "approved" }).eq("id", incomingRequest.id);
    setIncomingRequest(null);
  }, [incomingRequest]);

  /** Driver B rejects the request */
  const rejectIncoming = useCallback(async () => {
    if (!incomingRequest) return;
    await supabase.from("transfer_requests").update({ status: "rejected" }).eq("id", incomingRequest.id);
    setIncomingRequest(null);
  }, [incomingRequest]);

  return { incomingRequest, outgoingPending, requestTransfer, approveIncoming, rejectIncoming };
}
