import { useState } from "react";
import { X, Bike } from "lucide-react";

interface AssignCourierModalProps {
  orderCount: number;
  onConfirm: (name: string) => void | Promise<void>;
  onCancel: () => void;
}

export function AssignCourierModal({ orderCount, onConfirm, onCancel }: AssignCourierModalProps) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      await onConfirm(trimmed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="glass-card rounded-xl p-6 w-full max-w-sm space-y-4 animate-slide-up shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
              <Bike size={16} className="text-primary" />
            </div>
            <h2 className="font-semibold text-foreground">Atribuir Motoboy</h2>
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          Atribuindo <span className="font-semibold text-foreground">{orderCount}</span> pedido(s) a um motoboy.
        </p>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">Nome do Motoboy</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
            placeholder="Ex: João, Carlos..."
            autoFocus
            className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-all border border-border"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!name.trim() || loading}
            className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {loading ? (
              <><span className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />Despachando...</>
            ) : "Confirmar Rota"}
          </button>
        </div>
      </div>
    </div>
  );
}
