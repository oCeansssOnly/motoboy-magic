import { useState, useEffect } from "react";
import { X, Bike, Loader2, ChevronDown, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Driver {
  id: string;
  name: string;
  phone: string | null;
}

interface AssignCourierModalProps {
  orderCount: number;
  onConfirm: (name: string) => void | Promise<void>;
  onCancel: () => void;
}

export function AssignCourierModal({ orderCount, onConfirm, onCancel }: AssignCourierModalProps) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(true);
  const [selected, setSelected] = useState<string>(""); // driver name or custom
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase
      .from("drivers")
      .select("id, name, phone")
      .eq("status", "active")
      .order("name")
      .then(({ data }) => {
        setDrivers(data || []);
        setLoadingDrivers(false);
      });
  }, []);

  const activeName = selected === "__custom__" ? custom.trim() : selected.trim();
  const canSubmit = !!activeName && !loading;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setLoading(true);
    try {
      await onConfirm(activeName);
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

        {loadingDrivers ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
            <Loader2 size={14} className="animate-spin" /> Carregando motoristas...
          </div>
        ) : drivers.length > 0 ? (
          <div className="space-y-3">
            <label className="text-xs text-muted-foreground block mb-1">Selecionar Motoboy</label>
            <div className="space-y-1.5">
              {drivers.map(d => (
                <button
                  key={d.id}
                  onClick={() => { setSelected(d.name); setCustom(""); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm transition-all ${
                    selected === d.name
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${
                    selected === d.name ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                  }`}>
                    {d.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-foreground">{d.name}</p>
                    {d.phone && <p className="text-[11px] text-muted-foreground">{d.phone}</p>}
                  </div>
                  {selected === d.name && <div className="w-2 h-2 rounded-full bg-primary" />}
                </button>
              ))}
              <button
                onClick={() => setSelected("__custom__")}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm transition-all ${
                  selected === "__custom__"
                    ? "border-primary bg-primary/10"
                    : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                  <User size={13} className="text-muted-foreground" />
                </div>
                <span className="text-muted-foreground">Outro (digitar nome)</span>
              </button>
            </div>

            {selected === "__custom__" && (
              <input
                type="text"
                value={custom}
                onChange={e => setCustom(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleConfirm()}
                placeholder="Nome do motoboy..."
                autoFocus
                className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            )}
          </div>
        ) : (
          // No registered drivers — fall back to free text
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Nome do Motoboy</label>
            <input
              type="text"
              value={custom}
              onChange={e => setCustom(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleConfirm()}
              placeholder="Ex: João, Carlos..."
              autoFocus
              className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              Cadastre motoristas em <span className="text-primary">/admin/motoristas</span> para vê-los aqui.
            </p>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-all border border-border"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canSubmit}
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
