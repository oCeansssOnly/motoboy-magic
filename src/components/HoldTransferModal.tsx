import { useState, useRef, useCallback, useEffect } from "react";
import { X, ArrowRightLeft, MapPin, User, AlertCircle } from "lucide-react";
import { IFoodOrder } from "@/lib/types";

const HOLD_DURATION_MS = 3000; // 3 seconds

interface HoldTransferModalProps {
  order: IFoodOrder;
  /** In 'request' mode: shown to the owner asking them to confirm the transfer */
  fromDriverName: string;
  toDriverName: string; // requester's name
  onCancel: () => void;
  onApprove: () => void;
}

export function HoldTransferModal({
  order, fromDriverName, toDriverName, onCancel, onApprove,
}: HoldTransferModalProps) {
  const [progress, setProgress] = useState(0);
  const [approved, setApproved] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const startHold = useCallback(() => {
    if (approved) return;
    startTimeRef.current = Date.now() - (progress / 100) * HOLD_DURATION_MS;
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - (startTimeRef.current ?? Date.now());
      const pct = Math.min((elapsed / HOLD_DURATION_MS) * 100, 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        setApproved(true);
        setTimeout(onApprove, 400);
      }
    }, 16);
  }, [approved, progress, onApprove]);

  const stopHold = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setProgress(0);
    startTimeRef.current = null;
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.70)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="glass-card rounded-2xl w-full max-w-sm overflow-hidden animate-slide-up shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center">
              <ArrowRightLeft size={16} className="text-amber-400" />
            </div>
            <span className="font-semibold text-foreground text-sm">Solicitação de Transferência</span>
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Who wants it */}
        <div className="px-5 pb-2">
          <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
            <AlertCircle size={15} className="text-amber-400 flex-shrink-0" />
            <p className="text-sm text-foreground">
              <strong className="text-amber-400">{toDriverName}</strong> quer transferir este pedido para si.
            </p>
          </div>
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
        </div>

        {/* Hold-to-approve bar */}
        <div className="px-5 pb-5 space-y-3">
          <p className="text-xs text-center text-muted-foreground">
            {approved ? "✅ Transferência aprovada!" : "Segure para confirmar a transferência (3s)"}
          </p>

          <div className="relative h-14 rounded-2xl overflow-hidden select-none">
            <div className="absolute inset-0 bg-secondary border border-border rounded-2xl" />
            <div
              className="absolute inset-y-0 left-0 rounded-2xl"
              style={{
                width: `${progress}%`,
                background: approved
                  ? "linear-gradient(90deg, hsl(142 71% 45%) 0%, hsl(142 71% 55%) 100%)"
                  : "linear-gradient(90deg, hsl(38 92% 50%/0.8) 0%, hsl(38 92% 50%) 100%)",
                boxShadow: progress > 0 ? "0 0 20px hsl(38 92% 50%/0.4)" : "none",
                transition: progress === 0 ? "width 0.3s ease-out" : "none",
              }}
            />
            {progress > 0 && !approved && (
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
              style={{ cursor: approved ? "default" : "pointer" }}
            >
              <ArrowRightLeft
                size={16}
                className={`transition-colors ${progress > 50 ? "text-white" : "text-muted-foreground"}`}
              />
              <span className={`text-sm font-semibold transition-colors ${progress > 50 ? "text-white" : "text-muted-foreground"}`}>
                {approved ? "Aprovado!" : progress > 0 ? `${Math.ceil(3 - (progress / 100) * 3)}s...` : "Segure para aprovar"}
              </span>
            </div>
          </div>

          <button
            onClick={onCancel}
            className="w-full py-2 rounded-xl text-muted-foreground text-xs hover:text-destructive transition-colors"
          >
            Recusar transferência
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
