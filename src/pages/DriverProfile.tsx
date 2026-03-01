import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Package, MapPin, DollarSign, Search, Calendar,
  Bike, Clock, ChevronLeft, ChevronRight, Loader2, TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface ConfirmedOrder {
  id: string;
  ifood_order_id: string;
  customer_name: string | null;
  customer_address: string | null;
  motoboy_name: string | null;
  confirmed_at: string;
  order_total_cents: number | null;
  distance_km: number | null;
  status: string;
}

type Period = "week" | "month" | "all";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function formatCurrency(cents: number) {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}
function formatKm(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function getPeriodStart(period: Period) {
  const now = new Date();
  if (period === "week") { const d = new Date(now); d.setDate(d.getDate() - 7); return d.toISOString(); }
  if (period === "month") { return new Date(now.getFullYear(), now.getMonth(), 1).toISOString(); }
  return null;
}

/* ─── Simple inline SVG bar chart ─── */
function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map(d => d.value), 1);
  const W = 280, H = 80, barW = Math.floor((W - data.length * 2) / data.length);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 20}`} className="overflow-visible">
      {data.map((d, i) => {
        const barH = Math.max((d.value / max) * H, 2);
        const x = i * (barW + 2);
        const y = H - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx={2}
              fill={d.value > 0 ? "hsl(var(--primary))" : "hsl(var(--secondary))"}
              opacity={d.value > 0 ? 0.9 : 0.3} />
            {d.value > 0 && (
              <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize={8}
                fill="hsl(var(--primary))" fontWeight="600">{d.value}</text>
            )}
            <text x={x + barW / 2} y={H + 14} textAnchor="middle" fontSize={7}
              fill="hsl(var(--muted-foreground))">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ─── KPI Card ─── */
function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="glass-card rounded-xl p-4 space-y-1 text-center">
      <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center mx-auto mb-2">{icon}</div>
      <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground/70">{sub}</p>}
    </div>
  );
}

/* ─────────────────────────── Main Component ─────────────────────────── */
export default function DriverProfile() {
  const navigate = useNavigate();
  const { driverId } = useParams<{ driverId?: string }>();
  const { driver: myDriver, isAdmin } = useAuth();

  const [orders, setOrders] = useState<ConfirmedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("month");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;

  // Which driver are we viewing?
  const [targetDriver, setTargetDriver] = useState<{ id: string; name: string; status: string; created_at: string } | null>(null);

  useEffect(() => {
    const loadDriver = async () => {
      if (driverId) {
        // Admin viewing a specific driver
        const { data } = await supabase.from("drivers").select("id,name,status,created_at").eq("id", driverId).single();
        setTargetDriver(data);
      } else if (myDriver) {
        setTargetDriver({ id: myDriver.id, name: myDriver.name, status: myDriver.status, created_at: myDriver.created_at });
      }
    };
    loadDriver();
  }, [driverId, myDriver]);

  useEffect(() => {
    if (!targetDriver) return;
    const load = async () => {
      setLoading(true);
      const periodStart = getPeriodStart(period);
      let q = supabase.from("confirmed_orders")
        .select("id,ifood_order_id,customer_name,customer_address,motoboy_name,confirmed_at,order_total_cents,distance_km,status")
        .eq("motoboy_name", targetDriver.name)
        .order("confirmed_at", { ascending: false });
      if (periodStart) q = q.gte("confirmed_at", periodStart);
      const { data } = await q;
      setOrders(data || []);
      setLoading(false);
    };
    load();
  }, [targetDriver, period]);

  /* ─── KPI calculations ─── */
  const kpis = useMemo(() => ({
    count: orders.length,
    totalKm: orders.reduce((s, o) => s + (o.distance_km ?? 0), 0),
    totalCents: orders.reduce((s, o) => s + (o.order_total_cents ?? 0), 0),
  }), [orders]);

  /* ─── Bar chart data ─── */
  const chartData = useMemo(() => {
    const days = period === "week" ? 7 : period === "month" ? 30 : 14;
    const buckets: { label: string; value: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = period === "week"
        ? ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"][d.getDay()]
        : d.getDate().toString();
      const value = orders.filter(o => o.confirmed_at?.slice(0, 10) === key).length;
      buckets.push({ label, value });
    }
    return period === "all" ? [] : buckets;
  }, [orders, period]);

  /* ─── Filtered + paginated history ─── */
  const filtered = useMemo(() =>
    orders.filter(o =>
      !search ||
      (o.customer_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (o.customer_address ?? "").toLowerCase().includes(search.toLowerCase())
    ), [orders, search]);

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const initials = targetDriver?.name?.slice(0, 2).toUpperCase() ?? "??";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border sticky top-0 z-40 bg-background/90 backdrop-blur">
        <div className="container py-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground p-1">
              <ArrowLeft size={18} />
            </button>
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
              <Bike size={16} className="text-primary" />
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground">
                {targetDriver ? targetDriver.name : "Perfil do Motorista"}
              </h1>
              <p className="text-xs text-muted-foreground">Métricas e histórico de entregas</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-5 max-w-2xl mx-auto space-y-5">
        {/* Driver avatar card */}
        {targetDriver && (
          <div className="glass-card rounded-xl p-5 flex items-center gap-4 animate-slide-up">
            <div className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center text-2xl font-bold text-primary flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-foreground text-lg">{targetDriver.name}</h2>
              <div className="flex flex-wrap gap-2 mt-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  targetDriver.status === "active" ? "bg-emerald-500/20 text-emerald-400" : "bg-secondary text-muted-foreground"
                }`}>
                  {targetDriver.status === "active" ? "Ativo" : "Inativo"}
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock size={11} /> Desde {formatDate(targetDriver.created_at)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Period filter */}
        <div className="flex gap-1 bg-secondary rounded-xl p-1">
          {([["week","Semana"],["month","Este Mês"],["all","Histórico Total"]] as [Period,string][]).map(([p, l]) => (
            <button key={p} onClick={() => { setPeriod(p); setPage(0); }}
              className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
                period === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}>
              {l}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12">
            <Loader2 size={28} className="animate-spin text-primary mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Carregando métricas…</p>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-3 gap-3">
              <KpiCard
                icon={<Package size={16} className="text-primary" />}
                label="Entregas"
                value={kpis.count.toString()}
                sub={period === "week" ? "últimos 7 dias" : period === "month" ? "este mês" : "total"}
              />
              <KpiCard
                icon={<MapPin size={16} className="text-primary" />}
                label="Quilômetros"
                value={formatKm(kpis.totalKm)}
                sub="distância total"
              />
              <KpiCard
                icon={<DollarSign size={16} className="text-primary" />}
                label="Valor Total"
                value={formatCurrency(kpis.totalCents)}
                sub="soma dos pedidos"
              />
            </div>

            {/* Bar chart */}
            {chartData.length > 0 && kpis.count > 0 && (
              <div className="glass-card rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <TrendingUp size={14} className="text-primary" />
                  <p className="text-xs font-medium text-foreground">
                    Entregas — {period === "week" ? "últimos 7 dias" : "este mês"}
                  </p>
                </div>
                <div className="pt-2">
                  <BarChart data={chartData} />
                </div>
              </div>
            )}

            {/* Empty chart state */}
            {kpis.count === 0 && (
              <div className="text-center py-8">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <Package size={24} className="text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Nenhuma entrega no período selecionado.
                </p>
              </div>
            )}

            {/* Delivery history */}
            {kpis.count > 0 && (
              <div className="glass-card rounded-xl overflow-hidden">
                {/* Search */}
                <div className="p-3 border-b border-border">
                  <div className="flex items-center gap-2 bg-input rounded-lg px-3 py-2">
                    <Search size={14} className="text-muted-foreground flex-shrink-0" />
                    <input
                      type="text"
                      value={search}
                      onChange={e => { setSearch(e.target.value); setPage(0); }}
                      placeholder="Buscar por cliente ou endereço…"
                      className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
                    />
                  </div>
                </div>

                {/* Table header */}
                <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2 bg-secondary/30 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  <span>Cliente / Endereço</span>
                  <span className="text-right">Valor</span>
                  <span className="text-right">Data</span>
                </div>

                {/* Rows */}
                <div className="divide-y divide-border">
                  {paginated.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-6">Nenhum resultado encontrado.</p>
                  ) : paginated.map(o => (
                    <div key={o.id} className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 items-center hover:bg-secondary/20 transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{o.customer_name ?? "Cliente"}</p>
                        <p className="text-xs text-muted-foreground truncate">{o.customer_address ?? "—"}</p>
                        {(o.distance_km ?? 0) > 0 && (
                          <p className="text-[10px] text-primary mt-0.5">{formatKm(o.distance_km ?? 0)}</p>
                        )}
                      </div>
                      <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                        {o.order_total_cents ? formatCurrency(o.order_total_cents) : "—"}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(o.confirmed_at)}</span>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                    <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                      className="p-1.5 rounded-lg bg-secondary disabled:opacity-30 hover:bg-secondary/80 transition-all">
                      <ChevronLeft size={14} />
                    </button>
                    <span className="text-xs text-muted-foreground">
                      {page + 1} / {totalPages} · {filtered.length} entregas
                    </span>
                    <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                      className="p-1.5 rounded-lg bg-secondary disabled:opacity-30 hover:bg-secondary/80 transition-all">
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
