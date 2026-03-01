import { useState } from "react";
import { IFoodOrder, getPaymentLabel } from "@/lib/types";
import { MapPin, Phone, ChevronDown, ChevronUp, Package, Check, Loader2, Clock, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface OrderCardProps {
  order: IFoodOrder;
  index: number;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onConfirm?: (orderId: string, code: string) => void;
}

export function OrderCard({ order, index, selectable, selected, onToggleSelect, onConfirm }: OrderCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirmCode, setConfirmCode] = useState(order.confirmationCode || '');
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    if (!confirmCode.trim()) {
      toast.error("Informe o código de confirmação!");
      return;
    }

    setConfirming(true);
    try {
      const { data, error } = await supabase.functions.invoke('ifood-confirm', {
        body: {
          orderId: order.id,
          confirmationCode: confirmCode.trim(),
          motoboyName: 'Motoboy',
        },
      });

      if (error) throw error;

      if (data?.apiConfirmed) {
        toast.success(`✅ Pedido ${order.displayId} confirmado via API!`);
      } else {
        toast.success(`Pedido ${order.displayId} salvo como confirmado.`, {
          description: data?.message || 'Confirme manualmente no painel iFood.',
        });
      }
      onConfirm?.(order.id, confirmCode.trim());
    } catch (err) {
      toast.error("Erro ao confirmar. Tente novamente.");
      console.error(err);
    } finally {
      setConfirming(false);
    }
  };

  const timeAgo = order.createdAt ? getTimeAgo(order.createdAt) : '';

  return (
    <div
      className={`glass-card rounded-lg p-4 animate-slide-up transition-all ${
        selected ? 'border-l-2 border-l-primary ring-1 ring-primary/20' : ''
      } ${order.confirmed ? 'opacity-70' : ''}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start gap-3">
        {selectable && (
          <button
            onClick={() => onToggleSelect?.(order.id)}
            className={`flex-shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center mt-0.5 transition-all ${
              selected
                ? 'bg-primary border-primary text-primary-foreground'
                : 'border-border hover:border-primary/50'
            }`}
          >
            {selected && <Check size={14} />}
          </button>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="font-semibold text-foreground truncate">{order.customerName}</h3>
              <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                #{order.displayId}
              </span>
              {order.confirmed && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-accent text-accent-foreground">✅</span>
              )}
            </div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>

          <div className="flex items-start gap-1.5 mt-1">
            <MapPin size={14} className="text-primary mt-0.5 flex-shrink-0" />
            <p className="text-sm text-muted-foreground leading-snug">{order.address}</p>
          </div>

          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            {timeAgo && (
              <span className="flex items-center gap-1">
                <Clock size={12} /> {timeAgo}
              </span>
            )}
            <span className="flex items-center gap-1">
              <ShoppingBag size={12} /> R$ {(order.total / 100).toFixed(2)}
            </span>
            <span>{getPaymentLabel(order.paymentMethod)}</span>
          </div>

          {expanded && (
            <div className="mt-3 pt-3 border-t border-border space-y-3">
              {order.items && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Itens</label>
                  <p className="text-sm text-foreground">{order.items}</p>
                </div>
              )}

              {order.customerPhone && (
                <div className="flex items-center gap-1.5">
                  <Phone size={13} className="text-info" />
                  <span className="text-sm text-muted-foreground">{order.customerPhone}</span>
                </div>
              )}

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Localizador</label>
                <span className="text-sm font-mono text-foreground">{order.displayId}</span>
              </div>

              {/* Confirmation section */}
              {order.raw && (
                <details className="text-xs text-muted-foreground bg-black/5 p-2 rounded mb-2 overflow-auto max-h-48">
                  <summary className="cursor-pointer font-medium text-foreground">Ver Payload Original do iFood (Debug)</summary>
                  <pre className="mt-2 text-[10px] break-all whitespace-pre-wrap font-mono uppercase">
                    {JSON.stringify(order.raw, null, 2)}
                  </pre>
                </details>
              )}
              
              <div>
                <div className="flex justify-between items-end mb-1">
                  <label className="text-xs text-muted-foreground block">
                    Código de Confirmação
                  </label>
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
                    className="bg-input border border-border rounded px-3 py-1.5 text-sm text-foreground flex-1 focus:ring-1 focus:ring-primary outline-none font-mono"
                    placeholder="Código..."
                    disabled={order.confirmed}
                  />
                  <button
                    onClick={handleConfirm}
                    disabled={confirming || order.confirmed}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
                      order.confirmed
                        ? 'bg-accent text-accent-foreground'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                    } disabled:opacity-50`}
                  >
                    {confirming ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : order.confirmed ? (
                      <Check size={12} />
                    ) : (
                      <Package size={12} />
                    )}
                    {confirming ? '...' : order.confirmed ? 'Confirmado' : 'Confirmar'}
                  </button>
                </div>
              </div>

              {order.lat !== 0 && (
                <a
                  href={`https://maps.google.com/?q=${order.lat},${order.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  <MapPin size={12} />
                  Abrir no Google Maps
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  return `${hours}h`;
}
