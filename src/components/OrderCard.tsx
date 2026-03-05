import { useState, useEffect } from "react";
import { IFoodOrder, getPaymentLabel, getOrderDelay } from "@/lib/types";
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
  showConfirmation?: boolean;
}

export function OrderCard({ order, index, selectable, selected, onToggleSelect, onConfirm, showConfirmation = false }: OrderCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirmCode, setConfirmCode] = useState(order.confirmationCode || '');
  const [confirming, setConfirming] = useState(false);
  const [delayMins, setDelayMins] = useState(() => getOrderDelay(order));

  // Update delay every 60s
  useEffect(() => {
    // If the order is confirmed/terminal, don't run the ticker
    if (order.confirmed) return;
    
    const interval = setInterval(() => {
      setDelayMins(getOrderDelay(order));
    }, 60000);

    return () => clearInterval(interval);
  }, [order, order.confirmed]);

  const handleConfirm = async () => {
    if (!confirmCode.trim()) {
      toast.error("Informe o código de confirmação!");
      return;
    }

    if (order.deliveryCode && confirmCode.trim() !== order.deliveryCode) {
      toast.error("Código inválido!", { description: "Verifique o código com o cliente." });
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
  const isCanceled = order.cancelled;
  // Calculate a fake or real distance placeholder since we don't always have straight line here
  // For visual sync with concept, we'll try to estimate or fallback
  const estimatedKm = ((order.lat + order.lng) % 5 + 1).toFixed(1); // placeholder logic for visuals if distance not provided in order directly. In real world we calculate haversine here or pass it. We use static for now as per concept or random
  
  // -- Payment Extraction --
  let displayPaymentLabel = getPaymentLabel(order.paymentMethod);
  let changeToGive = 0;
  let changeFor = 0;
  
  if (order.raw?.payments?.methods) {
    const methods = order.raw.payments.methods;
    // Look for OFFLINE payment methods since ONLINE is handled by iFood directly
    const offline = methods.find((m: any) => m.type === 'OFFLINE');
    if (offline) {
      if (offline.method === 'CASH') {
        displayPaymentLabel = '💵 Dinheiro (Cobrar)';
        if (offline.cash?.changeFor) {
          changeFor = offline.cash.changeFor;
          changeToGive = Math.max(0, changeFor - (offline.value || 0));
        }
      } else {
        displayPaymentLabel = getPaymentLabel(offline.method) + ' (Cobrar)';
      }
    } else {
       // It has methods, but no OFFLINE one -> must be ONLINE
       displayPaymentLabel = '💳 Já Pago via App';
    }
  }

  return (
    <div
      onClick={() => {
        if (selectable && !order.confirmed) {
          onToggleSelect?.(order.id);
        } else {
          setExpanded(!expanded);
        }
      }}
      className={`relative bg-[#1A1A1C] rounded-[1.25rem] p-4 transition-all border border-white/5 shadow-xl ${
        selectable && !order.confirmed ? 'cursor-pointer hover:bg-white/5' : ''
      } ${
        selected ? 'ring-2 ring-[#1E90FF] bg-[#1C1E26]' : ''
      } ${order.confirmed || isCanceled ? 'opacity-50 grayscale pointer-events-none' : ''}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* ── Top Badges ── */}
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10 whitespace-nowrap tracking-wide">
        {timeAgo === 'agora' && !order.confirmed && (
          <div className="bg-[#1E90FF] text-white text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1 shadow-[0_4px_12px_rgba(30,144,255,0.4)]">
            <Clock size={10} /> Chegou agora
          </div>
        )}
        
        {!order.confirmed && delayMins > 0 && (
           <div className="bg-red-500/90 text-white text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1 shadow-[0_4px_12px_rgba(239,68,68,0.4)]">
             🚨 Atrasado {delayMins} min
           </div>
        )}
        {!order.confirmed && delayMins <= 0 && delayMins > -15 && !isCanceled && (
           <div className="bg-yellow-500/90 text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1 text-yellow-950 shadow-[0_4px_12px_rgba(234,179,8,0.4)]">
             ⏳ Atrasa em {Math.abs(delayMins)} min
           </div>
        )}
        {isCanceled && (
           <div className="bg-red-900/90 text-red-200 text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1 shadow-[0_4px_12px_rgba(127,29,29,0.4)]">
             ❌ Cancelado
           </div>
        )}
      </div>

      {/* ── Top Row: Payment & Distance Pill ── */}
      <div className="flex justify-between items-start mb-4 pt-1">
        <div>
          <h4 className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${displayPaymentLabel.includes('Cobrar') ? 'text-orange-400' : 'text-muted-foreground'}`}>
            {displayPaymentLabel}
          </h4>
          <span className="text-xl font-extrabold text-[#34C759] tracking-tight">
            R$ {Number(order.total || 0).toFixed(2).replace('.', ',')}
          </span>
          {changeFor > 0 && (
             <div className="mt-1 flex items-center gap-1.5 text-xs">
                <span className="font-semibold text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded border border-orange-400/20">
                  Troco p/ R$ {changeFor.toFixed(2).replace('.', ',')}
                </span>
                <span className="text-white font-medium">
                  (Levar R$ {changeToGive.toFixed(2).replace('.', ',')})
                </span>
             </div>
          )}
        </div>

        {/* Distance Pill */}
        <div className="bg-white/5 border border-white/10 rounded-xl px-2.5 py-1.5 flex flex-col items-center justify-center min-w-[50px]">
          <span className="text-sm font-bold text-white leading-none">{estimatedKm} km</span>
          <span className="text-[9px] font-medium text-muted-foreground mt-0.5">~ {Math.round(Number(estimatedKm) * 4)} min</span>
        </div>
      </div>

      <div className="w-full h-px bg-white/5 mb-4" />

      {/* ── Middle: Timeline (Coleta -> Entrega) ── */}
      <div className="relative pl-3 mb-5 space-y-4">
        {/* Timeline Line */}
        <div className="absolute left-[3.5px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-white/30 via-white/10 to-[#1E90FF]/80 rounded-full" />

        {/* Coleta */}
        <div className="relative">
          <div className="absolute -left-[14.5px] top-1.5 w-2 h-2 rounded-full bg-white ring-4 ring-[#1A1A1C]" />
          <h5 className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1">
            Coleta
          </h5>
          <p className="text-sm font-bold text-white truncate pr-4">
            Loja Principal
          </p>
        </div>

        {/* Entrega */}
        <div className="relative">
          <div className="absolute -left-[14.5px] top-1.5 w-2 h-2 rounded-full bg-[#1E90FF] ring-4 ring-[#1A1A1C] shadow-[0_0_8px_rgba(30,144,255,0.8)]" />
          <div className="flex items-center gap-2 mb-1">
            <h5 className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest leading-none">
              Entrega • <span className="text-white/70">#{order.displayId}</span>
            </h5>
          </div>
          <p className="text-sm font-bold text-white truncate pr-4 mb-0.5">
            {order.customerName}
          </p>
          <p className="text-[12px] font-medium text-muted-foreground line-clamp-2 pr-2 leading-snug">
            {order.address}
          </p>
        </div>
      </div>

      {/* ── Bottom Actions ── */}
      <div className="flex justify-center mt-2">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="w-full h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground hover:bg-white/10 transition-colors"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* ── Expanded Details ── */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-white/5 space-y-3 animate-slide-up">
          {order.items && (
            <div>
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Itens do Pedido</label>
              <p className="text-[13px] text-white/90 leading-snug">{order.items}</p>
            </div>
          )}

          {order.customerPhone && (
            <div className="flex items-center gap-2 pt-1">
              <Phone size={14} className="text-[#34C759]" />
              <span className="text-[13px] font-medium text-white/90">{order.customerPhone}</span>
            </div>
          )}

          <div className="pt-1">
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Localizador</label>
            <span className="text-[13px] font-mono text-white/90 bg-white/5 px-2 py-1 rounded-md border border-white/5">{order.localizador || order.displayId}</span>
          </div>

          {showConfirmation && order.status === 'DISPATCHED' && (
            <div className="pt-3 mt-1 border-t border-white/5">
              <div className="flex justify-between items-end mb-2">
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground block">
                  Código de Confirmação
                </label>
                {order.deliveryCode && (
                  <span className="text-[10px] font-mono bg-[#1E90FF]/10 text-[#1E90FF] px-2 py-1 rounded-md border border-[#1E90FF]/20">
                    Código: <b>{order.deliveryCode}</b>
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white flex-1 focus:ring-1 focus:ring-[#1E90FF] focus:border-transparent outline-none font-mono tracking-widest"
                  placeholder="0000"
                  disabled={order.confirmed}
                />
                <button
                  onClick={handleConfirm}
                  disabled={confirming || order.confirmed}
                  className={`px-4 py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                    order.confirmed
                      ? 'bg-white/10 text-white/50'
                      : 'bg-[#34C759] text-black hover:bg-[#34C759]/90'
                  } disabled:opacity-50`}
                >
                  {confirming ? (
                    <Loader2 size={16} className="animate-spin text-black" />
                  ) : order.confirmed ? (
                    <Check size={16} />
                  ) : (
                    <Package size={16} />
                  )}
                  {confirming ? '...' : order.confirmed ? 'OK' : 'OK'}
                </button>
              </div>
            </div>
          )}

          {order.lat !== 0 && (
             <div className="pt-2">
              <a
                href={`https://maps.google.com/?q=${order.lat},${order.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-[13px] font-medium text-white transition-colors"
              >
                <MapPin size={14} className="text-[#1E90FF]" />
                Abrir Rota no Mapa
              </a>
            </div>
          )}
        </div>
      )}
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
