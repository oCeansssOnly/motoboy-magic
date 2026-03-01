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
  const [pendingNotifications, setPendingNotifications] = useState<TransferRequest[]>([]);
  const handledRef = useRef<Set<string>>(new Set()); // prevent duplicate popups

  // Keep refs for callbacks/coords so Realtime/polling always use the latest values.
  const onOrderApprovedRef = useRef(onOrderApproved);
  useEffect(() => { onOrderApprovedRef.current = onOrderApproved; }, [onOrderApproved]);
  const storeLatRef = useRef(storeLat);
  const storeLngRef = useRef(storeLng);
  useEffect(() => { storeLatRef.current = storeLat; storeLngRef.current = storeLng; }, [storeLat, storeLng]);

  // Request browser notification permission on mount
  useEffect(() => { requestNotificationPermission(); }, []);

  // ── Dedupe guard: track row IDs already applied ───────────────────────────
  const appliedRef = useRef<Set<string>>(new Set());

  // ── Core: apply an approved transfer immediately using provided row data ──
  // Called from both Realtime (with full payload) and polling (with DB row).
  // Since transfer_requests has REPLICA IDENTITY FULL and is in the publication,
  // the Realtime UPDATE payload always includes complete order_data — no extra fetch needed.
  const applyApproval = useCallback(async (row: TransferRequest) => {
    if (appliedRef.current.has(row.id)) return;
    appliedRef.current.add(row.id);

    // Get current GPS position for the new driver's route start
    let lat = storeLatRef.current, lng = storeLngRef.current;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 })
      );
      lat = pos.coords.latitude; lng = pos.coords.longitude;
    } catch { /* store fallback */ }

    onOrderApprovedRef.current({ ...row.order_data, confirmed: false }, lat, lng);
    setOutgoingPending(prev => { const n = new Set(prev); n.delete(row.order_id); return n; });

    // Mark as completed in DB (fire-and-forget — don't await to avoid blocking)
    supabase.from("transfer_requests").update({ status: "completed" }).eq("id", row.id).then(() => {});
    sendBrowserNotification("✅ Transferência aprovada!", `Pedido #${row.order_data?.displayId} está na sua rota.`, `approved-${row.id}`);
  }, []); // reads only refs

  // ── Fallback: if Realtime is unavailable, fetch full row then apply ────────
  const fetchAndApply = useCallback(async (rowId: string) => {
    if (appliedRef.current.has(rowId)) return;
    const { data: rows } = await supabase
      .from("transfer_requests")
      .select("*")
      .eq("id", rowId)
      .eq("status", "approved")
      .limit(1);
    const row = (rows?.[0] as unknown) as TransferRequest | undefined;
    if (row) await applyApproval(row);
  }, [applyApproval]);

  // ── On mount: load pending requests saved while driver was offline ─────────
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
      data.forEach(r => handledRef.current.add(r.id));
      setPendingNotifications(data as unknown as TransferRequest[]);
      setIncomingRequest(data[0] as unknown as TransferRequest);
      data.forEach(r => {
        sendBrowserNotification(
          "🛵 Solicitação de Transferência (pendente)",
          `${r.requester_name} quer o pedido #${(r.order_data as any)?.displayId}`,
          `xfer-${r.id}`
        );
      });
    })();

    // Also restore outgoing pending badge
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
        if (handledRef.current.has(req.id)) return;
        handledRef.current.add(req.id);

        setIncomingRequest(prev => prev ?? req);
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
          // REPLICA IDENTITY FULL guarantees order_data is in the payload — apply instantly
          if (req.order_data && Object.keys(req.order_data).length > 0) {
            await applyApproval(req);
          } else {
            // Safety fallback: fetch from DB (shouldn't happen with REPLICA IDENTITY FULL)
            await fetchAndApply(req.id);
          }
        } else if (req.status === "rejected") {
          setOutgoingPending(prev => { const n = new Set(prev); n.delete(req.order_id); return n; });
          sendBrowserNotification("❌ Transferência recusada", `${req.current_owner_name} recusou o pedido #${req.order_data?.displayId}.`, `rejected-${req.id}`);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [myName, applyApproval, fetchAndApply]);

  // ── Polling fallback ─────────────────────────────────────────────────────
  // Catches approvals missed while Realtime was disconnected.
  const pollRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    if (!myName) return;

    const pollFn = async () => {
      const { data } = await supabase
        .from("transfer_requests")
        .select("*")                          // fetch full rows — same cost, avoids second trip
        .eq("requester_name", myName)
        .eq("status", "approved");

      if (!data || data.length === 0) return;
      await Promise.all((data as unknown as TransferRequest[]).map(row => applyApproval(row)));
    };

    pollRef.current = pollFn;
    pollFn(); // immediate check on mount
    const interval = setInterval(pollFn, 3_000);
    return () => clearInterval(interval);
  }, [myName, applyApproval]);

  /** Trigger an immediate poll — call right after requestTransfer */
  const triggerPoll = useCallback(() => { void pollRef.current(); }, []);

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
    triggerPoll,
    approveIncoming,
    rejectIncoming,
  };
}
