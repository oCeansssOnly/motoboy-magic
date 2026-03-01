import { useState } from "react";
import { IFoodOrder, CourierRoute, optimizeRoute, generateGoogleMapsUrl, getPaymentLabel } from "@/lib/types";
import {
  Navigation, MapPin, Phone, Package, Check, Loader2, ChevronDown, ChevronUp,
  Clock, ShoppingBag, Copy, Bike, ArrowRightLeft, RefreshCw, UserX,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface CourierTabProps {
  route: CourierRoute;
  storeLat: number;
  storeLng: number;
  /** Name of logged-in driver (null = admin) */
  currentDriverName: string | null;
  isAdmin: boolean;
  /** Order IDs that this driver has already sent a transfer request for */
  outgoingPending: Set<string>;
  onOrderConfirmed: (routeId: string, orderId: string, code: string) => void;
  /** Driver (or admin) marks order as no-contact — move to Retentativas */
  onNoContact: (routeId: string, order: IFoodOrder) => void;
  /** Driver requests a transfer — only for non-owners */
  onRequestTransfer: (order: IFoodOrder, ownerName: string) => void;
  /** Admin directly reassigns an order to another driver */
  onAdminReassign: (fromRouteId: string, orderId: string, toDriver: string) => void;
}

export function CourierTab({
  route, storeLat, storeLng, currentDriverName, isAdmin,
  outgoingPending, onOrderConfirmed, onNoContact, onRequestTransfer, onAdminReassign,
}: CourierTabProps) {
  const [completedOpen, setCompletedOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const activeOrders = route.orders.filter(o => !o.confirmed);
  const completedOrders = route.orders.filter(o => o.confirmed);
  const startLat = route.startLat ?? storeLat;
  const startLng = route.startLng ?? storeLng;
  const optimized = optimizeRoute(activeOrders, startLat, startLng);
  const isOwnRoute = !!currentDriverName && currentDriverName.toLowerCase() === route.name.toLowerCase();

  const openRoute = () => {
    if (activeOrders.length === 0) { toast.info("Todas as entregas concluídas!"); return; }
    window.open(generateGoogleMapsUrl(optimized, storeLat, storeLng, startLat, startLng), "_blank");
  };

  const copyRoute = () => {
    if (activeOrders.length === 0) return;
    const url = generateGoogleMapsUrl(optimized, storeLat, storeLng, startLat, startLng);
    const desc = optimized.map((o, i) => `${i + 1}. ${o.customerName} – ${o.address}`).join("\n");
    navigator.clipboard.writeText(`ROTA – ${route.name}\n${"─".repeat(38)}\n${desc}\n🗺️ ${url}`);
    setCopied(true); toast.success("Rota copiada!"); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="glass-card rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center"><Bike size={18} className="text-primary" /></div>
            <div>
              <p className="font-semibold text-foreground">{route.name}</p>
              <p className="text-xs text-muted-foreground">
                {activeOrders.length} ativa(s) · {completedOrders.length} entregue(s)
                {route.startLat && route.startLat !== storeLat && <span className="ml-1.5 text-primary">· 📍 GPS</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Route actions */}
        {activeOrders.length > 0 && (
          <div className="glass-card rounded-lg p-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              <Navigation size={11} className="inline mr-1" />
              {route.startLat && route.startLat !== storeLat ? "Posição atual" : "Loja"} → {optimized.map(o => o.customerName).join(" → ")} → Loja
            </p>
            <div className="flex gap-2">
              <button onClick={openRoute} className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all flex items-center justify-center gap-2 glow-primary">
                <Navigation size={14} /> Abrir Rota
              </button>
              <button onClick={copyRoute} className="flex-1 py-2.5 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-all border border-border flex items-center justify-center gap-2">
                {copied ? <Check size={14} className="text-primary" /> : <Copy size={14} />}
                {copied ? "Copiado!" : "Copiar"}
              </button>
            </div>
          </div>
        )}

        {activeOrders.length === 0 && completedOrders.length > 0 && (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center mx-auto mb-3"><Check size={22} className="text-accent-foreground" /></div>
            <p className="text-sm font-medium text-foreground">Todas as entregas concluídas! 🎉</p>
          </div>
        )}

        <div className="space-y-3">
          {optimized.map((order, i) => (
            <DeliveryCard
              key={order.id}
              order={order}
              index={i}
              routeId={route.id}
              isOwnRoute={isOwnRoute}
              isAdmin={isAdmin}
              ownerName={route.name}
              isPendingTransfer={outgoingPending.has(order.id)}
              onConfirmed={onOrderConfirmed}
              onNoContact={() => onNoContact(route.id, order)}
              onRequestTransfer={() => onRequestTransfer(order, route.name)}
              onAdminReassign={(toDriver) => onAdminReassign(route.id, order.id, toDriver)}
            />
          ))}
        </div>

        {completedOrders.length > 0 && (
          <div className="mt-2">
            <button onClick={() => setCompletedOpen(!completedOpen)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/50 border border-border text-sm text-muted-foreground hover:text-foreground transition-all">
              <span className="flex items-center gap-2"><Check size={14} />Entregues ({completedOrders.length})</span>
              {completedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {completedOpen && (
              <div className="mt-2 space-y-2 opacity-70">
                {completedOrders.map((order, i) => (
                  <DeliveryCard key={order.id} order={order} index={i} routeId={route.id}
                    isOwnRoute={isOwnRoute} isAdmin={isAdmin} ownerName={route.name}
                    isPendingTransfer={false}
                    onConfirmed={onOrderConfirmed}
                    onNoContact={() => {}}
                    onRequestTransfer={() => {}}
                    onAdminReassign={() => {}}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/* ─────────── DeliveryCard ─────────── */
interface DeliveryCardProps {
  order: IFoodOrder;
  index: number;
  routeId: string;
  isOwnRoute: boolean;
  isAdmin: boolean;
  ownerName: string;
  isPendingTransfer: boolean;
  onConfirmed: (routeId: string, orderId: string, code: string) => void;
  onNoContact: () => void;
  onRequestTransfer: () => void;
  onAdminReassign: (toDriver: string) => void;
}

function DeliveryCard({
  order, index, routeId, isOwnRoute, isAdmin, ownerName,
  isPendingTransfer, onConfirmed, onNoContact, onRequestTransfer, onAdminReassign,
}: DeliveryCardProps) {
  const [confirmCode, setConfirmCode] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [showReassign, setShowReassign] = useState(false);
  const [activeDrivers, setActiveDrivers] = useState<string[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [markingNoContact, setMarkingNoContact] = useState(false);

  const timeAgo = order.createdAt ? getTimeAgo(order.createdAt) : "";

  const handleConfirm = async () => {
    if (!confirmCode.trim()) { toast.error("Informe o código de confirmação!"); return; }
    setConfirming(true);
    try {
      const { data, error } = await supabase.functions.invoke("ifood-confirm", {
        body: { orderId: order.id, confirmationCode: confirmCode.trim(), motoboyName: "Motoboy" },
      });
      if (error) throw error;
      if (!data?.success) {
        toast.error(data?.invalidCode ? "Código inválido!" : "Erro ao confirmar.", {
          description: data?.invalidCode ? "O código não confere com o iFood." : data?.error,
        });
        return;
      }
      toast.success(`✅ Pedido ${order.displayId} confirmado!`);
      onConfirmed(routeId, order.id, confirmCode.trim());
    } catch { toast.error("Erro ao confirmar. Tente novamente."); }
    finally { setConfirming(false); }
  };

  const handleNoContact = async () => {
    setMarkingNoContact(true);
    try {
      onNoContact();
    } finally {
      setMarkingNoContact(false);
    }
  };

  const openReassignDropdown = async () => {
    setShowReassign(true);
    if (activeDrivers.length > 0) return;
    setLoadingDrivers(true);
    const { data } = await supabase.from("drivers").select("name").eq("status", "active");
    setActiveDrivers((data || []).map(d => d.name).filter(n => n.toLowerCase() !== ownerName.toLowerCase()));
    setLoadingDrivers(false);
  };

  return (
    <div
      className={`glass-card rounded-lg p-4 animate-slide-up space-y-3 transition-all ${order.confirmed ? "opacity-60 border-l-2 border-l-accent" : "border-l-2 border-l-primary"}`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">#{order.displayId}</span>
            <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock size={11} />{timeAgo}</span>
            {order.confirmed && <span className="text-xs px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">✅ Entregue</span>}
          </div>
          <h3 className="font-semibold text-foreground mt-1">{order.customerName}</h3>
        </div>
        <span className="text-sm font-semibold text-foreground whitespace-nowrap">R$ {(order.total / 100).toFixed(2)}</span>
      </div>

      <div className="flex items-start gap-1.5">
        <MapPin size={13} className="text-primary mt-0.5 flex-shrink-0" />
        <p className="text-sm text-muted-foreground leading-snug">{order.address}</p>
      </div>
      {order.customerPhone && (
        <div className="flex items-center gap-1.5">
          <Phone size={13} className="text-info flex-shrink-0" />
          <a href={`tel:${order.customerPhone}`} className="text-sm text-muted-foreground hover:text-primary transition-colors">{order.customerPhone}</a>
        </div>
      )}
      {order.items && (
        <div className="flex items-start gap-1.5">
          <ShoppingBag size={13} className="text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground">{order.items}</p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{getPaymentLabel(order.paymentMethod)}</span>
        {order.lat !== 0 && (
          <a href={`https://maps.google.com/?q=${order.lat},${order.lng}`} target="_blank" rel="noopener noreferrer"
            className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
            <MapPin size={11} /> Ver no mapa
          </a>
        )}
      </div>

      {/* ── "Não encontrei o cliente" — own driver OR admin, only on active orders ── */}
      {(isOwnRoute || isAdmin) && !order.confirmed && (
        <div className="pt-2 border-t border-border">
          <button
            onClick={handleNoContact}
            disabled={markingNoContact}
            className="w-full py-2 rounded-lg bg-orange-500/10 border border-orange-500/25 text-sm text-orange-400 hover:bg-orange-500/20 hover:border-orange-500/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {markingNoContact ? <Loader2 size={14} className="animate-spin" /> : <UserX size={14} />}
            {markingNoContact ? "Movendo..." : "Não encontrei o cliente"}
          </button>
        </div>
      )}

      {/* ── Admin: Reassign button ── */}
      {isAdmin && !order.confirmed && (
        <div className="pt-2 border-t border-border">
          {!showReassign ? (
            <button onClick={openReassignDropdown}
              className="w-full py-2 rounded-lg bg-secondary border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all flex items-center justify-center gap-2">
              <RefreshCw size={13} /> Reatribuir para outro motorista
            </button>
          ) : (
            <div className="space-y-2 animate-slide-up">
              <p className="text-xs text-muted-foreground">Selecionar motorista:</p>
              {loadingDrivers ? (
                <div className="flex items-center justify-center py-2"><Loader2 size={16} className="animate-spin text-primary" /></div>
              ) : activeDrivers.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-1">Nenhum outro motorista ativo.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {activeDrivers.map(name => (
                    <button key={name}
                      onClick={() => { onAdminReassign(name); setShowReassign(false); }}
                      className="w-full py-2 px-3 rounded-lg bg-primary/10 text-sm text-primary font-medium hover:bg-primary/20 transition-all text-left">
                      {name}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setShowReassign(false)} className="text-xs text-muted-foreground hover:text-foreground w-full text-center py-1">Cancelar</button>
            </div>
          )}
        </div>
      )}

      {/* ── Driver (not owner): Request Transfer ── */}
      {!isAdmin && !isOwnRoute && !order.confirmed && (
        <div className="pt-2 border-t border-border">
          {isPendingTransfer ? (
            <div className="w-full py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 flex items-center justify-center gap-2">
              <Clock size={12} className="animate-pulse" /> Aguardando aprovação do motorista atual…
            </div>
          ) : (
            <button onClick={onRequestTransfer}
              className="w-full py-2 rounded-lg bg-secondary border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all flex items-center justify-center gap-2">
              <ArrowRightLeft size={14} /> Solicitar transferência
            </button>
          )}
        </div>
      )}

      {/* ── Own route + dispatched: Confirmation ── */}
      {isOwnRoute && !order.confirmed && order.status === "DISPATCHED" && (
        <div className="pt-2 border-t border-border">
          <label className="text-xs text-muted-foreground mb-1.5 block">🔒 Código de confirmação do cliente:</label>
          <div className="flex gap-2">
            <input type="text" inputMode="numeric" value={confirmCode}
              onChange={e => setConfirmCode(e.target.value)}
              placeholder="Digite o código..."
              className="flex-1 bg-input border border-border rounded px-3 py-1.5 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none font-mono" />
            <button onClick={handleConfirm} disabled={confirming}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all flex items-center gap-1.5 disabled:opacity-50">
              {confirming ? <Loader2 size={12} className="animate-spin" /> : <Package size={12} />}
              {confirming ? "..." : "Confirmar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min`;
  return `${Math.floor(mins / 60)}h`;
}
