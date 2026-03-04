import { useState, useRef, useCallback, useEffect } from "react";
import { X, AlertTriangle } from "lucide-react";
import { CourierRoute } from "@/lib/types";
import { haptic } from "@/lib/utils";

const HOLD_DURATION_MS = 3000;

interface EndRouteModalProps {
  route: CourierRoute;
  onCancel: () => void;
  onConfirm: () => void;
  cancelling?: boolean;
}

export function EndRouteModal({ route, onCancel, onConfirm, cancelling }: EndRouteModalProps) {
  const [progress, setProgress] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const startHold = useCallback(() => {
    if (confirmed || cancelling) return;
    haptic(); // Vibration on start
    startTimeRef.current = Date.now() - (progress / 100) * HOLD_DURATION_MS;
    
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - (startTimeRef.current ?? Date.now());
      const pct = Math.min((elapsed / HOLD_DURATION_MS) * 100, 100);
      setProgress(pct);
      
      // Add subtle progression haptics at 50% and 75%
      if (Math.round(pct) === 50 || Math.round(pct) === 75) {
        haptic();
      }

      if (pct >= 100) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        setConfirmed(true);
        // Strong completion haptic
        if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
        else haptic();
        setTimeout(onConfirm, 300);
      }
    }, 16);
  }, [confirmed, progress, onConfirm, cancelling]);

  const stopHold = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setProgress(0);
    startTimeRef.current = null;
  }, []);

  const orderCount = route.orders.filter(o => !o.confirmed).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="glass-card rounded-2xl w-full max-w-sm overflow-hidden animate-slide-up shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-destructive/15 flex items-center justify-center">
              <AlertTriangle size={16} className="text-destructive" />
            </div>
            <span className="font-semibold text-foreground text-sm">Encerrar Rota</span>
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Warning */}
        <div className="px-5 pb-3">
          <div className="flex items-start gap-2.5 bg-destructive/10 border border-destructive/25 rounded-xl p-3.5">
            <AlertTriangle size={15} className="text-destructive flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-destructive">Atenção: Ação irreversível</p>
              <p className="text-xs text-foreground leading-relaxed">
                Encerrar a rota de <strong>{route.name}</strong> irá <strong>cancelar {orderCount} pedido(s) ativo(s)</strong> diretamente no iFood. Esta ação não pode ser desfeita.
              </p>
            </div>
          </div>
        </div>

        {/* Order list preview */}
        {orderCount > 0 && (
          <div className="px-5 pb-3">
            <div className="bg-secondary/40 rounded-xl p-3 space-y-1.5 max-h-32 overflow-y-auto">
              {route.orders.filter(o => !o.confirmed).map(o => (
                <div key={o.id} className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-muted-foreground">#{o.displayId}</span>
                  <span className="text-foreground truncate">{o.customerName}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hold-to-confirm bar */}
        <div className="px-5 pb-5 space-y-3">
          <p className="text-xs text-center text-muted-foreground">
            {cancelling
              ? "⏳ Cancelando pedidos no iFood..."
              : confirmed
              ? "✅ Rota encerrada!"
              : "Segure para confirmar e cancelar os pedidos (3s)"}
          </p>

          <div className="relative h-14 rounded-2xl overflow-hidden select-none">
            <div className="absolute inset-0 bg-secondary border border-border rounded-2xl" />
            <div
              className="absolute inset-y-0 left-0 rounded-2xl"
              style={{
                width: cancelling ? "100%" : `${progress}%`,
                background: confirmed || cancelling
                  ? "linear-gradient(90deg, hsl(0 72% 45%) 0%, hsl(0 72% 55%) 100%)"
                  : "linear-gradient(90deg, hsl(0 72% 40%/0.8) 0%, hsl(0 72% 55%) 100%)",
                boxShadow: progress > 0 ? "0 0 20px hsl(0 72% 50%/0.4)" : "none",
                transition: progress === 0 ? "width 0.3s ease-out" : "none",
              }}
            />
            {progress > 0 && !confirmed && (
              <div
                className="absolute inset-y-0 left-0 rounded-2xl pointer-events-none"
                style={{
                  width: `${progress}%`,
                  background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)",
                  backgroundSize: "200% 100%",
                  animation: "shimmer 1s infinite linear",
                }}
              />
            )}
            <div
              className="absolute inset-0 flex items-center justify-center gap-2"
              onMouseDown={startHold}
              onMouseUp={stopHold}
              onMouseLeave={stopHold}
              onTouchStart={(e) => { e.preventDefault(); startHold(); }}
              onTouchEnd={stopHold}
              style={{ cursor: confirmed || cancelling ? "default" : "pointer" }}
            >
              <AlertTriangle
                size={16}
                className={`transition-colors ${progress > 50 || cancelling ? "text-white" : "text-muted-foreground"}`}
              />
              <span className={`text-sm font-semibold transition-colors ${progress > 50 || cancelling ? "text-white" : "text-muted-foreground"}`}>
                {cancelling ? "Cancelando..." : confirmed ? "Confirmado!" : progress > 0 ? `${Math.ceil(3 - (progress / 100) * 3)}s...` : "Segure para encerrar"}
              </span>
            </div>
          </div>

          <button
            onClick={onCancel}
            disabled={cancelling}
            className="w-full py-2 rounded-xl text-muted-foreground text-xs hover:text-foreground transition-colors disabled:opacity-50"
          >
            Cancelar — manter rota ativa
          </button>
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
