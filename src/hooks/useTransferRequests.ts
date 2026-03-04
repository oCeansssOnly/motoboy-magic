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
  /** Called on the APPROVER's side so they remove the transferred order from their own route */
  onOrderTransferred?: (orderId: string) => void;
  storeLat: number;
  storeLng: number;
}

// System push notifications are now handled natively inside useNotifications.ts

export function useTransferRequests({
  myName, onOrderApproved, onOrderTransferred, storeLat, storeLng, addNotification
}: UseTransferRequestsOptions & { addNotification: (type: any, title: string, message: string) => void }) {
  const onOrderTransferredRef = useRef(onOrderTransferred);
  useEffect(() => { onOrderTransferredRef.current = onOrderTransferred; }, [onOrderTransferred]);
  const [incomingRequest, setIncomingRequest] = useState<TransferRequest | null>(null);
  const [outgoingPending, setOutgoingPending] = useState<Set<string>>(new Set());
  const [pendingNotifications, setPendingNotifications] = useState<TransferRequest[]>([]);
  const handledRef = useRef<Set<string>>(new Set());

  const onOrderApprovedRef = useRef(onOrderApproved);
  useEffect(() => { onOrderApprovedRef.current = onOrderApproved; }, [onOrderApproved]);
  const storeLatRef = useRef(storeLat);
  const storeLngRef = useRef(storeLng);
  useEffect(() => { storeLatRef.current = storeLat; storeLngRef.current = storeLng; }, [storeLat, storeLng]);

  const appliedRef = useRef<Set<string>>(new Set());

  // ── Core apply: use the provided row directly (zero extra round-trip) ────────
  const applyApproval = useCallback(async (row: TransferRequest) => {
    if (appliedRef.current.has(row.id)) return;
    appliedRef.current.add(row.id);

    let lat = storeLatRef.current, lng = storeLngRef.current;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 })
      );
      lat = pos.coords.latitude; lng = pos.coords.longitude;
    } catch { /* store fallback */ }

    onOrderApprovedRef.current({ ...row.order_data, confirmed: false }, lat, lng);
    setOutgoingPending(prev => { const n = new Set(prev); n.delete(row.order_id); return n; });
    // Delete the request row — no longer needed (keeps transfer_requests clean)
    supabase.from("transfer_requests").delete().eq("id", row.id).then(() => {});
    addNotification("success", "Transferência aprovada!", `Pedido #${row.order_data?.displayId} está na sua rota.`);
  }, [addNotification]);

  // Fallback: fetch from DB (for polling when no Realtime event)
  const fetchAndApply = useCallback(async (rowId: string) => {
    if (appliedRef.current.has(rowId)) return;
    const { data: rows } = await supabase
      .from("transfer_requests").select("*").eq("id", rowId).eq("status", "approved").limit(1);
    const row = (rows?.[0] as unknown) as TransferRequest | undefined;
    if (row) await applyApproval(row);
  }, [applyApproval]);

  // ── On mount: load pending requests saved while driver was offline ─────────
  useEffect(() => {
    if (!myName) return;
    (async () => {
      const { data } = await supabase
        .from("transfer_requests").select("*")
        .eq("current_owner_name", myName).eq("status", "pending")
        .order("created_at", { ascending: true });
      if (!data || data.length === 0) return;
      data.forEach(r => handledRef.current.add(r.id));
      setPendingNotifications(data as unknown as TransferRequest[]);
      setIncomingRequest(data[0] as unknown as TransferRequest);
      data.forEach(r => addNotification(
        "info", 
        "Transferência pendente",
        `${r.requester_name} quer o pedido #${(r.order_data as any)?.displayId}`
      ));
    })();

    supabase.from("transfer_requests").select("order_id")
      .eq("requester_name", myName).eq("status", "pending")
      .then(({ data }) => { if (data?.length) setOutgoingPending(new Set(data.map(r => r.order_id))); });
  }, [myName]);

  // ── Realtime: postgres_changes (for incoming requests) + Broadcast (for approvals) ──
  useEffect(() => {
    if (!myName) return;

    // Channel 1: listen for incoming transfer requests directed at me (owner)
    const pgChannel = supabase
      .channel(`xfer-incoming-${encodeURIComponent(myName)}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "transfer_requests",
      }, (payload) => {
        const req = payload.new as TransferRequest;
        if (req.current_owner_name.toLowerCase() !== myName.toLowerCase()) return;
        if (req.status !== "pending") return;
        if (handledRef.current.has(req.id)) return;
        handledRef.current.add(req.id);

        setIncomingRequest(prev => prev ?? req);
        setPendingNotifications(prev => [...prev, req]);
        addNotification(
          "info", 
          "Solicitação de Transferência",
          `${req.requester_name} quer transferir o pedido #${req.order_data?.displayId} para a rota dele.`
        );
        toast.info(`🛵 ${req.requester_name} quer transferir um pedido!`, {
          duration: 10000,
          action: { label: "Ver", onClick: () => setIncomingRequest(req) },
        });
      })
      .subscribe();

    // Channel 2: Broadcast channel — owner sends here, requester listens.
    // This BYPASSES RLS so the approval is instant regardless of policies.
    const broadcastChannel = supabase
      .channel(`approval-for-${encodeURIComponent(myName)}`)
      .on("broadcast", { event: "transfer_approved" }, async ({ payload }) => {
        const row = payload as TransferRequest;
        await applyApproval(row);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(pgChannel);
      supabase.removeChannel(broadcastChannel);
    };
  }, [myName, applyApproval]);

  // ── Polling fallback (every 3s) — handles Realtime disconnects ───────────
  const pollRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    if (!myName) return;
    const pollFn = async () => {
      const { data } = await supabase
        .from("transfer_requests").select("*")
        .eq("requester_name", myName).eq("status", "approved");
      if (!data || data.length === 0) return;
      await Promise.all((data as unknown as TransferRequest[]).map(row => applyApproval(row)));
    };
    pollRef.current = pollFn;
    pollFn();
    const interval = setInterval(pollFn, 3_000);
    return () => clearInterval(interval);
  }, [myName, applyApproval]);

  const triggerPoll = useCallback(() => { void pollRef.current(); }, []);

  const requestTransfer = useCallback(async (order: IFoodOrder, currentOwnerName: string): Promise<boolean> => {
    if (!myName) return false;
    const { error } = await supabase.from("transfer_requests").insert({
      order_id: order.id, order_data: order as any,
      requester_name: myName, current_owner_name: currentOwnerName,
    });
    if (!error) setOutgoingPending(prev => new Set([...prev, order.id]));
    return !error;
  }, [myName]);

  const approveIncoming = useCallback(async () => {
    if (!incomingRequest) return;

    // 1. Remove the order from the approver's own route immediately
    onOrderTransferredRef.current?.(incomingRequest.order_id);

    // 2. Update DB
    await supabase.from("transfer_requests").update({ status: "approved" }).eq("id", incomingRequest.id);

    // 3. Broadcast instant notification — bypasses RLS, arrives in ~50ms
    const approvedRow: TransferRequest = { ...incomingRequest, status: "approved" };
    supabase
      .channel(`approval-for-${encodeURIComponent(incomingRequest.requester_name)}`)
      .send({ type: "broadcast", event: "transfer_approved", payload: approvedRow });

    // 4. Advance to next pending notification
    setPendingNotifications(prev => {
      const rest = prev.filter(r => r.id !== incomingRequest.id);
      setIncomingRequest(rest[0] ?? null);
      return rest;
    });
  }, [incomingRequest]);

  const rejectIncoming = useCallback(async () => {
    if (!incomingRequest) return;
    // Delete the row outright — keeps transfer_requests clean
    await supabase.from("transfer_requests").delete().eq("id", incomingRequest.id);
    setPendingNotifications(prev => {
      const rest = prev.filter(r => r.id !== incomingRequest.id);
      setIncomingRequest(rest[0] ?? null);
      return rest;
    });
  }, [incomingRequest]);

  return { incomingRequest, outgoingPending, pendingNotifications, requestTransfer, triggerPoll, approveIncoming, rejectIncoming };
}
