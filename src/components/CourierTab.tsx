import { useState } from "react";
import { IFoodOrder, CourierRoute, optimizeRoute, generateGoogleMapsUrl, getPaymentLabel } from "@/lib/types";
import {
  Navigation, MapPin, Phone, Package, Check, Loader2, ChevronDown, ChevronUp,
  Clock, ShoppingBag, Copy, X, Bike
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface CourierTabProps {
  route: CourierRoute;
  storeLat: number;
  storeLng: number;
  onClose: () => void;
  onOrderConfirmed: (routeId: string, orderId: string, code: string) => void;
}

export function CourierTab({ route, storeLat, storeLng, onClose, onOrderConfirmed }: CourierTabProps) {
  const [completedOpen, setCompletedOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const activeOrders = route.orders.filter((o) => !o.confirmed);
  const completedOrders = route.orders.filter((o) => o.confirmed);
  const optimized = optimizeRoute(activeOrders, storeLat, storeLng);

  const openRoute = () => {
    if (activeOrders.length === 0) { toast.info("Todas as entregas concluídas!"); return; }
    window.open(generateGoogleMapsUrl(optimized, storeLat, storeLng), "_blank");
  };

  const copyRoute = () => {
    if (activeOrders.length === 0) return;
    const url = generateGoogleMapsUrl(optimized, storeLat, storeLng);
    const desc = optimized.map((o, i) => `${i + 1}. ${o.customerName} – ${o.address}`).join("\n");
    navigator.clipboard.writeText(`ROTA – ${route.name} (${optimized.length} paradas)\n${"─".repeat(38)}\n${desc}\n${"─".repeat(38)}\n🗺️ ${url}`);
    setCopied(true);
    toast.success("Rota copiada!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="glass-card rounded-lg p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center">
            <Bike size={18} className="text-primary" />
          </div>
          <div>
            <p className="font-semibold text-foreground">{route.name}</p>
            <p className="text-xs text-muted-foreground">
              {activeOrders.length} ativa(s) · {completedOrders.length} entregue(s)
            </p>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-destructive transition-colors p-1" title="Encerrar rota">
          <X size={18} />
        </button>
      </div>

      {/* Route actions */}
      {activeOrders.length > 0 && (
        <div className="glass-card rounded-lg p-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            <Navigation size={11} className="inline mr-1" />
            Loja → {optimized.map((o) => o.customerName).join(" → ")} → Loja
          </p>
          <div className="flex gap-2">
            <button
              onClick={openRoute}
              className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all flex items-center justify-center gap-2 glow-primary"
            >
              <Navigation size={14} /> Abrir Rota
            </button>
            <button
              onClick={copyRoute}
              className="flex-1 py-2.5 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-all border border-border flex items-center justify-center gap-2"
            >
              {copied ? <Check size={14} className="text-primary" /> : <Copy size={14} />}
              {copied ? "Copiado!" : "Copiar"}
            </button>
          </div>
        </div>
      )}

      {/* Active orders */}
      {activeOrders.length === 0 && completedOrders.length > 0 && (
        <div className="text-center py-6">
          <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center mx-auto mb-3">
            <Check size={22} className="text-accent-foreground" />
          </div>
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
            onConfirmed={onOrderConfirmed}
          />
        ))}
      </div>

      {/* Completed orders */}
      {completedOrders.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setCompletedOpen(!completedOpen)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/50 border border-border text-sm text-muted-foreground hover:text-foreground transition-all"
          >
            <span className="flex items-center gap-2">
              <Check size={14} />
              Entregues ({completedOrders.length})
            </span>
            {completedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {completedOpen && (
            <div className="mt-2 space-y-2 opacity-70">
              {completedOrders.map((order, i) => (
                <DeliveryCard
                  key={order.id}
                  order={order}
                  index={i}
                  routeId={route.id}
                  onConfirmed={onOrderConfirmed}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────── DeliveryCard ─────────── */
interface DeliveryCardProps {
  order: IFoodOrder;
  index: number;
  routeId: string;
  onConfirmed: (routeId: string, orderId: string, code: string) => void;
}

function DeliveryCard({ order, index, routeId, onConfirmed }: DeliveryCardProps) {
  const [confirmCode, setConfirmCode] = useState(order.confirmationCode || "");
  const [confirming, setConfirming] = useState(false);

  const timeAgo = order.createdAt ? getTimeAgo(order.createdAt) : "";

  const handleConfirm = async () => {
    if (!confirmCode.trim()) { toast.error("Informe o código de confirmação!"); return; }

    // Strict validation: if iFood provided a delivery code, the entered code must match
    if (order.deliveryCode && confirmCode.trim() !== order.deliveryCode) {
      toast.error("Código inválido!", { description: "Verifique o código com o cliente." });
      return;
    }

    setConfirming(true);
    try {
      const { data, error } = await supabase.functions.invoke("ifood-confirm", {
        body: { orderId: order.id, confirmationCode: confirmCode.trim(), motoboyName: "Motoboy" },
      });
      if (error) throw error;
      if (data?.apiConfirmed) {
        toast.success(`✅ Pedido ${order.displayId} confirmado via API!`);
      } else {
        toast.success(`Pedido ${order.displayId} salvo como entregue.`, { description: data?.message });
      }
      onConfirmed(routeId, order.id, confirmCode.trim());
    } catch {
      toast.error("Erro ao confirmar. Tente novamente.");
    } finally {
      setConfirming(false);
    }
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
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
              #{order.displayId}
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock size={11} /> {timeAgo}
            </span>
            {order.confirmed && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">✅ Entregue</span>
            )}
          </div>
          <h3 className="font-semibold text-foreground mt-1">{order.customerName}</h3>
        </div>
        <span className="text-sm font-semibold text-foreground whitespace-nowrap">
          R$ {(order.total / 100).toFixed(2)}
        </span>
      </div>

      {/* Address */}
      <div className="flex items-start gap-1.5">
        <MapPin size={13} className="text-primary mt-0.5 flex-shrink-0" />
        <p className="text-sm text-muted-foreground leading-snug">{order.address}</p>
      </div>

      {/* Phone */}
      {order.customerPhone && (
        <div className="flex items-center gap-1.5">
          <Phone size={13} className="text-info flex-shrink-0" />
          <a href={`tel:${order.customerPhone}`} className="text-sm text-muted-foreground hover:text-primary transition-colors">
            {order.customerPhone}
          </a>
        </div>
      )}

      {/* Items */}
      {order.items && (
        <div className="flex items-start gap-1.5">
          <ShoppingBag size={13} className="text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground">{order.items}</p>
        </div>
      )}

      {/* Payment + maps */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{getPaymentLabel(order.paymentMethod)}</span>
        {order.lat !== 0 && (
          <a
            href={`https://maps.google.com/?q=${order.lat},${order.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
          >
            <MapPin size={11} /> Ver no mapa
          </a>
        )}
      </div>

      {/* Confirmation */}
      {!order.confirmed && (
        <div className="pt-2 border-t border-border">
          <div className="flex justify-between items-end mb-1">
            <label className="text-xs text-muted-foreground block">Código de Confirmação</label>
            {order.deliveryCode && (
              <span className="text-xs font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                Código iFood: <b>{order.deliveryCode}</b>
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value)}
              placeholder="Código do cliente..."
              className="flex-1 bg-input border border-border rounded px-3 py-1.5 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none font-mono"
            />
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
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
