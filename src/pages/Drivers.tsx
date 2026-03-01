import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bike, Check, X, Loader2, ArrowLeft, Trash2, UserCheck,
  UserX, Clock, Package, Phone, User, RefreshCw, ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Driver {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  notes: string | null;
  approved_at: string | null;
  created_at: string;
}

interface DriverMetrics {
  totalDeliveries: number;
  thisMonth: number;
}

function getMetrics(name: string, orders: any[]): DriverMetrics {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const mine = orders.filter(o => o.motoboy_name === name);
  return {
    totalDeliveries: mine.length,
    thisMonth: mine.filter(o => o.confirmed_at >= monthStart).length,
  };
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `${days} dias atrás`;
  const months = Math.floor(days / 30);
  return `${months} mês(es) atrás`;
}

export default function Drivers() {
  const navigate = useNavigate();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "active" | "inactive">("pending");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: driversData }, { data: ordersData }] = await Promise.all([
        supabase.from("drivers").select("*").order("created_at", { ascending: false }),
        supabase.from("confirmed_orders").select("motoboy_name, confirmed_at"),
      ]);
      setDrivers(driversData || []);
      setOrders(ordersData || []);
    } catch {
      toast.error("Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, status: string) => {
    const patch: any = { status };
    if (status === "active") patch.approved_at = new Date().toISOString();
    const { error } = await supabase.from("drivers").update(patch).eq("id", id);
    if (error) { toast.error("Erro ao atualizar status."); return; }
    setDrivers(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
    toast.success(status === "active" ? "Motorista aprovado!" : status === "inactive" ? "Motorista desativado." : "Status atualizado.");
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Remover ${name} permanentemente?`)) return;
    const { error } = await supabase.from("drivers").delete().eq("id", id);
    if (error) { toast.error("Erro ao remover motorista."); return; }
    setDrivers(prev => prev.filter(d => d.id !== id));
    toast.success("Motorista removido.");
  };

  const pending = drivers.filter(d => d.status === "pending");
  const active = drivers.filter(d => d.status === "active");
  const inactive = drivers.filter(d => d.status === "inactive");

  const tabs = [
    { key: "pending", label: "Pendentes", count: pending.length, icon: Clock },
    { key: "active",  label: "Ativos",    count: active.length,  icon: UserCheck },
    { key: "inactive",label: "Inativos",  count: inactive.length, icon: UserX },
  ] as const;

  const currentList = tab === "pending" ? pending : tab === "active" ? active : inactive;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border sticky top-0 z-40 bg-background/90 backdrop-blur">
        <div className="container py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground transition-colors p-1">
                <ArrowLeft size={18} />
              </button>
              <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                <Bike size={16} className="text-primary" />
              </div>
              <div>
                <h1 className="text-base font-bold text-foreground">Motoristas</h1>
                <p className="text-xs text-muted-foreground">Painel administrativo</p>
              </div>
            </div>
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all text-sm"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Atualizar
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="container pb-0">
          <div className="flex gap-1">
            {tabs.map(({ key, label, count, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-all whitespace-nowrap ${
                  tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon size={12} />
                {label}
                {count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${key === "pending" ? "bg-amber-500/20 text-amber-400" : "bg-primary/20 text-primary"}`}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="container py-5 max-w-2xl mx-auto space-y-4">
        {/* Signup link banner */}
        <div className="glass-card rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User size={14} />
            Link de cadastro para motoristas:
          </div>
          <button
            onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/motorista`); toast.success("Link copiado!"); }}
            className="text-xs font-mono text-primary hover:underline truncate max-w-[180px]"
          >
            {window.location.origin}/motorista
          </button>
        </div>

        {loading && (
          <div className="text-center py-12">
            <Loader2 size={28} className="text-primary animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Carregando motoristas...</p>
          </div>
        )}

        {!loading && currentList.length === 0 && (
          <div className="text-center py-12">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              {tab === "pending" ? <Clock size={24} className="text-primary" /> :
               tab === "active"  ? <Bike size={24} className="text-primary" /> :
               <ShieldAlert size={24} className="text-primary" />}
            </div>
            <p className="text-sm text-muted-foreground">
              {tab === "pending" ? "Nenhuma solicitação pendente." :
               tab === "active"  ? "Nenhum motorista ativo." :
               "Nenhum motorista inativo."}
            </p>
          </div>
        )}

        {!loading && currentList.map(driver => {
          const metrics = getMetrics(driver.name, orders);
          return (
            <div key={driver.id} className="glass-card rounded-lg p-4 space-y-3 animate-slide-up">
              {/* Top row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                    driver.status === "active" ? "bg-primary/15 text-primary" :
                    driver.status === "pending" ? "bg-amber-500/15 text-amber-400" :
                    "bg-secondary text-muted-foreground"
                  }`}>
                    {driver.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{driver.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      {driver.phone && (
                        <span className="flex items-center gap-1"><Phone size={11} />{driver.phone}</span>
                      )}
                      <span>Cadastro: {timeAgo(driver.created_at)}</span>
                    </div>
                  </div>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                  driver.status === "active"   ? "bg-emerald-500/20 text-emerald-400" :
                  driver.status === "pending"  ? "bg-amber-500/20 text-amber-400" :
                  "bg-secondary text-muted-foreground"
                }`}>
                  {driver.status === "active" ? "Ativo" : driver.status === "pending" ? "Pendente" : "Inativo"}
                </span>
              </div>

              {/* Metrics — only for active/inactive */}
              {driver.status !== "pending" && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-secondary/40 rounded-lg p-2.5 text-center">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                      <Package size={12} />
                      <span className="text-[10px]">Total de Entregas</span>
                    </div>
                    <p className="text-lg font-bold text-foreground">{metrics.totalDeliveries}</p>
                  </div>
                  <div className="bg-secondary/40 rounded-lg p-2.5 text-center">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                      <Package size={12} />
                      <span className="text-[10px]">Este Mês</span>
                    </div>
                    <p className="text-lg font-bold text-foreground">{metrics.thisMonth}</p>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                {driver.status === "pending" && (
                  <>
                    <button
                      onClick={() => updateStatus(driver.id, "active")}
                      className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Check size={13} /> Aprovar
                    </button>
                    <button
                      onClick={() => remove(driver.id, driver.name)}
                      className="px-3 py-2 rounded-lg bg-destructive/15 text-destructive text-xs font-medium hover:bg-destructive/25 transition-all flex items-center gap-1.5"
                    >
                      <X size={13} /> Recusar
                    </button>
                  </>
                )}
                {driver.status === "active" && (
                  <>
                    <button
                      onClick={() => updateStatus(driver.id, "inactive")}
                      className="flex-1 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-all border border-border flex items-center justify-center gap-1.5"
                    >
                      <UserX size={13} /> Desativar
                    </button>
                    <button
                      onClick={() => remove(driver.id, driver.name)}
                      className="px-3 py-2 rounded-lg bg-destructive/15 text-destructive text-xs hover:bg-destructive/25 transition-all flex items-center gap-1"
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
                {driver.status === "inactive" && (
                  <>
                    <button
                      onClick={() => updateStatus(driver.id, "active")}
                      className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5"
                    >
                      <UserCheck size={13} /> Reativar
                    </button>
                    <button
                      onClick={() => remove(driver.id, driver.name)}
                      className="px-3 py-2 rounded-lg bg-destructive/15 text-destructive text-xs hover:bg-destructive/25 transition-all flex items-center gap-1"
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}
