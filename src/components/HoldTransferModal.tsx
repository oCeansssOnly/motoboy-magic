import { useState, useRef, useCallback, useEffect } from "react";
import { X, ArrowRightLeft, MapPin, User } from "lucide-react";
import { IFoodOrder } from "@/lib/types";

const HOLD_DURATION_MS = 5000;

interface HoldTransferModalProps {
  order: IFoodOrder;
  fromDriverName: string;
  onCancel: () => void;
  onTransfer: () => void;
}

export function HoldTransferModal({ order, fromDriverName, onCancel, onTransfer }: HoldTransferModalProps) {
  const [progress, setProgress] = useState(0); // 0–100
  const [transferred, setTransferred] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Clean up on unmount
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const startHold = useCallback(() => {
    if (transferred) return;
    startTimeRef.current = Date.now() - (progress / 100) * HOLD_DURATION_MS;
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - (startTimeRef.current ?? Date.now());
      const pct = Math.min((elapsed / HOLD_DURATION_MS) * 100, 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        setTransferred(true);
        setTimeout(onTransfer, 400); // brief flash before closing
      }
    }, 16);
  }, [transferred, progress, onTransfer]);

  const stopHold = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    // Reset to 0 smoothly
    setProgress(0);
    startTimeRef.current = null;
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="glass-card rounded-2xl w-full max-w-sm overflow-hidden animate-slide-up shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center">
              <ArrowRightLeft size={16} className="text-primary" />
            </div>
            <span className="font-semibold text-foreground text-sm">Transferir Pedido</span>
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Order summary */}
        <div className="px-5 pb-4 space-y-2">
          <div className="bg-secondary/40 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-muted-foreground">#{order.displayId}</span>
              <span className="text-sm font-semibold text-foreground">R$ {(order.total / 100).toFixed(2)}</span>
            </div>
            <p className="font-medium text-foreground text-sm">{order.customerName}</p>
            <div className="flex items-start gap-1.5">
              <MapPin size={12} className="text-primary mt-0.5 flex-shrink-0" />
              <p className="text-xs text-muted-foreground leading-snug">{order.address}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <User size={12} />
            <span>Atualmente com: <strong className="text-foreground">{fromDriverName}</strong></span>
          </div>
        </div>

        {/* Hold-to-confirm section */}
        <div className="px-5 pb-5 space-y-3">
          <p className="text-xs text-center text-muted-foreground">
            {transferred ? "✅ Pedido transferido!" : "Segure o botão por 5 segundos para confirmar a transferência"}
          </p>

          {/* Hold button */}
          <div className="relative h-14 rounded-2xl overflow-hidden select-none">
            {/* Background track */}
            <div className="absolute inset-0 bg-secondary border border-border rounded-2xl" />

            {/* Animated fill */}
            <div
              className="absolute inset-y-0 left-0 rounded-2xl transition-none"
              style={{
                width: `${progress}%`,
                background: transferred
                  ? "linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(142 71% 45%) 100%)"
                  : "linear-gradient(90deg, hsl(var(--primary)/0.8) 0%, hsl(var(--primary)) 100%)",
                boxShadow: progress > 0 ? "0 0 20px hsl(var(--primary)/0.4)" : "none",
                transition: progress === 0 ? "width 0.3s ease-out" : "none",
              }}
            />

            {/* Shimmer overlay while holding */}
            {progress > 0 && !transferred && (
              <div
                className="absolute inset-y-0 left-0 rounded-2xl pointer-events-none"
                style={{
                  width: `${progress}%`,
                  background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)",
                  backgroundSize: "200% 100%",
                  animation: "shimmer 1.2s infinite linear",
                }}
              />
            )}

            {/* Label */}
            <div
              className="absolute inset-0 flex items-center justify-center gap-2"
              onMouseDown={startHold}
              onMouseUp={stopHold}
              onMouseLeave={stopHold}
              onTouchStart={(e) => { e.preventDefault(); startHold(); }}
              onTouchEnd={stopHold}
              style={{ cursor: transferred ? "default" : "pointer" }}
            >
              <ArrowRightLeft
                size={16}
                className={`transition-colors ${progress > 50 ? "text-primary-foreground" : "text-muted-foreground"}`}
              />
              <span
                className={`text-sm font-semibold transition-colors ${progress > 50 ? "text-primary-foreground" : "text-muted-foreground"}`}
              >
                {transferred ? "Transferido!" : progress > 0 ? `${Math.round((progress / 100) * 5)}s...` : "Segure para confirmar"}
              </span>
            </div>
          </div>

          <button
            onClick={onCancel}
            className="w-full py-2.5 rounded-xl bg-transparent text-muted-foreground text-xs hover:text-foreground transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>

      {/* Shimmer keyframe */}
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
