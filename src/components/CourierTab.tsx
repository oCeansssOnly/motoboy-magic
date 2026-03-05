import { useState } from "react";
import { IFoodOrder, CourierRoute, optimizeRoute, generateGoogleMapsUrl, getPaymentLabel } from "@/lib/types";
import {
  Navigation, MapPin, Phone, Package, Check, Loader2, ChevronDown, ChevronUp,
  Clock, ShoppingBag, Copy, Bike, ArrowRightLeft, RefreshCw, UserX, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { haptic } from "@/lib/utils";
import { useDriverEmojis } from "@/hooks/useDriverEmojis";
import { AppleEmoji } from "@/components/AppleEmoji";

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
  const driverEmojis = useDriverEmojis();

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
        <div className="glass-card rounded-2xl p-5 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-[1rem] bg-secondary/50 border border-border flex items-center justify-center shadow-inner overflow-hidden">
              {driverEmojis[route.name] ? (
                <AppleEmoji name={driverEmojis[route.name]} size={34} />
              ) : (
                <Bike size={20} className="text-primary" />
              )}
            </div>
            <div>
              <p className="font-bold text-foreground text-xl tracking-tight leading-tight">{route.name}</p>
              <p className="text-xs text-muted-foreground">
                {activeOrders.length} ativa(s) · {completedOrders.length} entregue(s)
                {route.startLat && route.startLat !== storeLat && <span className="ml-1.5 text-primary">· 📍 GPS</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Route actions */}
        {activeOrders.length > 0 && (
          <div className="glass-card rounded-2xl p-4 space-y-3 shadow-lg">
            <p className="text-xs text-muted-foreground">
              <Navigation size={11} className="inline mr-1" />
              {route.startLat && route.startLat !== storeLat ? "Posição atual" : "Loja"} → {optimized.map(o => o.customerName).join(" → ")} → Loja
            </p>
            <div className="flex gap-2">
              <button onClick={openRoute} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all flex items-center justify-center gap-2 glow-primary">
                <Navigation size={14} /> Abrir Rota
              </button>
              <button onClick={copyRoute} className="flex-1 py-3 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-all border border-border flex items-center justify-center gap-2">
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

        <div className="bg-secondary/20 rounded-[1.25rem] border border-border shadow-sm overflow-hidden mt-4">
          {optimized.map((order, i) => (
            <DeliveryRow
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
              <span className="flex items-center gap-2">
                <Check size={14} />
                Entregues/Cancelados ({completedOrders.length})
                {completedOrders.some(o => o.cancelled) && (
                  <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] border border-red-500/30">
                    {completedOrders.filter(o => o.cancelled).length} cancelado(s)
                  </span>
                )}
              </span>
              {completedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {completedOpen && (
              <div className="mt-3 bg-secondary/20 rounded-[1.25rem] border border-border shadow-sm overflow-hidden">
                {completedOrders.map((order, i) => (
                  <div key={order.id} className="p-4 border-b border-border/50 last:border-0 bg-secondary/10">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 bg-background rounded-md text-muted-foreground border border-border/50 shadow-sm">#{order.displayId}</span>
                          {order.cancelled
                            ? <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-500 font-bold tracking-wide uppercase">Cancelado</span>
                            : <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-accent/20 text-accent-foreground font-bold tracking-wide uppercase">Entregue</span>
                          }
                        </div>
                        <p className="text-[13px] font-semibold text-foreground truncate mt-1">{order.customerName}</p>
                      </div>
                      <span className="text-[13px] text-muted-foreground whitespace-nowrap font-medium">R$ {(order.total / 100).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/* ─────────── DeliveryRow (Inset Grouped item) ─────────── */
interface DeliveryRowProps {
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

function DeliveryRow({
  order, index, routeId, isOwnRoute, isAdmin, ownerName,
  isPendingTransfer, onConfirmed, onNoContact, onRequestTransfer, onAdminReassign,
}: DeliveryRowProps) {
  const [confirmCode, setConfirmCode] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [showReassign, setShowReassign] = useState(false);
  const [activeDrivers, setActiveDrivers] = useState<string[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [markingNoContact, setMarkingNoContact] = useState(false);

  const timeAgo = order.createdAt ? getTimeAgo(order.createdAt) : "";

  const handleConfirm = async () => {
    if (!confirmCode.trim()) { toast.error("Informe o código de confirmação!"); return; }

    // Bypass iFood API for locally-generated test orders
    if (order.id.startsWith("TEST-")) {
      if (confirmCode.trim() !== order.deliveryCode) {
        toast.error("Código inválido!", { description: `Para testes, use o código ${order.deliveryCode}` });
        return;
      }
      onConfirmed(routeId, order.id, confirmCode.trim());
      toast.success("Pedido Teste entregue com sucesso!");
      return;
    }

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
      onConfirmed(routeId, order.id, confirmCode.trim());
      toast.success("Pedido entregue com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao validar código.", { description: err.message });
    } finally {
      setConfirming(false);
    }
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
      className={`p-4 transition-all border-b border-border/50 last:border-0 ${order.confirmed ? "opacity-50" : "bg-transparent"} relative overflow-hidden`}
    >
      {/* iOS List arrow indicator 
      <ChevronRight size={16} className="absolute right-4 top-5 text-muted-foreground/30" /> */}

      {/* Top row */}
      <div className="flex items-start justify-between gap-2 pr-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-background border border-border/50 shadow-sm rounded-md text-muted-foreground">#{order.displayId}</span>
            <span className="text-[10px] font-medium text-muted-foreground">{timeAgo}</span>
            {order.confirmed && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-accent/20 text-accent-foreground font-bold tracking-wide uppercase">Entregue</span>}
          </div>
          <h3 className="font-semibold text-foreground text-[15px] mt-1.5 leading-none">{order.customerName}</h3>
        </div>
        <span className="text-[15px] font-semibold text-foreground whitespace-nowrap mt-1">R$ {(order.total / 100).toFixed(2)}</span>
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex items-start gap-2">
          <MapPin size={14} className="text-primary mt-0.5 flex-shrink-0" />
          <p className="text-[13px] text-muted-foreground leading-snug pr-4">{order.address}</p>
        </div>
        {order.customerPhone && (
          <div className="flex items-center gap-2">
            <Phone size={14} className="text-[#34C759] flex-shrink-0" /> {/* iOS Green */}
            <a href={`tel:${order.customerPhone}`} onClick={() => haptic()} className="text-[13px] text-foreground hover:text-primary transition-colors font-medium">{order.customerPhone}</a>
          </div>
        )}
        {order.items && (
          <div className="flex items-start gap-2">
            <ShoppingBag size={14} className="text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-[12px] text-muted-foreground leading-snug break-words">{order.items}</p>
          </div>
        )}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">{getPaymentLabel(order.paymentMethod)}</span>
          {order.lat !== 0 && (
            <a href={`https://maps.google.com/?q=${order.lat},${order.lng}`} target="_blank" rel="noopener noreferrer" onClick={() => haptic()}
              className="text-[11px] font-semibold text-primary hover:text-primary/80 flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-md transition-all active:scale-95">
              Abrir no GPS
            </a>
          )}
        </div>
      </div>

      {/* ── "Não encontrei o cliente" — own driver OR admin, only on active orders ── */}
      {(isOwnRoute || isAdmin) && !order.confirmed && (
        <div className="pt-3 mt-3 border-t border-border/50">
          <button
            onClick={() => { haptic(); handleNoContact(); }}
            disabled={markingNoContact}
            className="w-full py-2.5 rounded-xl bg-orange-500/10 text-[13px] font-semibold text-orange-400 hover:bg-orange-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 ios-btn"
          >
            {markingNoContact ? <Loader2 size={16} className="animate-spin" /> : <UserX size={16} />}
            {markingNoContact ? "Movendo..." : "Não encontrei"}
          </button>
        </div>
      )}

      {/* ── Admin: Reassign button ── */}
      {isAdmin && !order.confirmed && (
        <div className="pt-3 mt-3 border-t border-border/50">
          {!showReassign ? (
            <button onClick={() => { haptic(); openReassignDropdown(); }}
              className="w-full py-2.5 rounded-xl bg-secondary text-[13px] font-semibold text-muted-foreground hover:text-foreground transition-all flex items-center justify-center gap-2 ios-btn">
              <RefreshCw size={14} /> Reatribuir
            </button>
          ) : (
            <div className="space-y-2 animate-slide-up bg-background p-3 rounded-xl border border-border mt-2 shadow-lg">
              <p className="text-[11px] font-semibold text-muted-foreground tracking-widest uppercase">Selecionar motorista:</p>
              {loadingDrivers ? (
                <div className="flex items-center justify-center py-2"><Loader2 size={16} className="animate-spin text-primary" /></div>
              ) : activeDrivers.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-1">Nenhum outro ativo.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {activeDrivers.map(name => (
                    <button key={name}
                      onClick={() => { haptic(); onAdminReassign(name); setShowReassign(false); }}
                      className="w-full py-2.5 px-3 rounded-lg bg-secondary/50 text-[13px] font-semibold text-foreground hover:bg-secondary transition-all text-left ios-btn">
                      {name}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => { haptic(); setShowReassign(false); }}
                className="text-xs font-semibold text-red-500 hover:text-red-400 w-full text-center py-2 mt-1 ios-btn">
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Driver (not owner): Request Transfer ── */}
      {!isAdmin && !isOwnRoute && !order.confirmed && (
        <div className="pt-3 mt-3 border-t border-border/50">
          {isPendingTransfer ? (
            <div className="w-full py-2.5 rounded-xl bg-amber-500/10 text-[13px] font-semibold text-amber-500 flex items-center justify-center gap-2">
              <Clock size={14} className="animate-pulse" /> Aguardando aprovação...
            </div>
          ) : (
            <button onClick={() => { haptic(); onRequestTransfer(); }}
              className="w-full py-2.5 rounded-xl bg-secondary text-[13px] font-semibold text-muted-foreground hover:text-foreground transition-all flex items-center justify-center gap-2 ios-btn">
              <ArrowRightLeft size={14} /> Solicitar transferência
            </button>
          )}
        </div>
      )}

      {/* ── Own route + dispatched: Confirmation ── */}
      {isOwnRoute && !order.confirmed && order.status === "DISPATCHED" && (
        <div className="pt-4 mt-4 border-t border-border/50">
          <label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-2 block ml-1 text-center sm:text-left">CÓDIGO IFOOD</label>
          <div className="relative flex items-center">
            <input type="text" inputMode="numeric" value={confirmCode}
              onChange={e => setConfirmCode(e.target.value)}
              placeholder="Ex: 5819"
              className="w-full bg-input/50 border border-border rounded-2xl pl-4 pr-24 py-3 text-lg font-semibold text-foreground tracking-widest focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all shadow-inner" />
            <button onClick={() => { haptic(); handleConfirm(); }} disabled={confirming}
              className="absolute right-1.5 px-4 py-2 rounded-xl text-[13px] font-bold tracking-wide bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 disabled:opacity-50 ios-btn shadow-md">
              {confirming ? <Loader2 size={16} className="animate-spin" /> : <Package size={16} />}
              {confirming ? "..." : "OK"}
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
