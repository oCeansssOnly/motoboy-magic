import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Package, MapPin, DollarSign, Search, Calendar,
  Bike, Clock, ChevronLeft, ChevronRight, Loader2, TrendingUp,
  ExternalLink
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { haptic } from "@/lib/utils";
import { AppleEmoji } from "@/components/AppleEmoji";

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
  const { driverId, driverName } = useParams<{ driverId?: string, driverName?: string }>();
  const { driver: myDriver, isAdmin } = useAuth();

  const [orders, setOrders] = useState<ConfirmedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("month");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;

  // Which driver are we viewing?
  const [targetDriver, setTargetDriver] = useState<{ id: string; name: string; status: string; created_at: string; notes: string | null } | null>(null);

  const [isEditingEmoji, setIsEditingEmoji] = useState(false);
  const [updatingEmoji, setUpdatingEmoji] = useState(false);

  useEffect(() => {
    const loadDriver = async () => {
      if (driverId) {
        // Admin viewing a specific driver by ID
        const { data } = await supabase.from("drivers").select("id,name,status,created_at,notes").eq("id", driverId).single();
        setTargetDriver(data);
      } else if (driverName) {
        // Viewing a driver by Name (e.g. from Ranking)
        const { data } = await supabase.from("drivers").select("id,name,status,created_at,notes").ilike("name", driverName).maybeSingle();
        if (data) {
          setTargetDriver(data);
        } else {
          // If driver not in drivers table, fallback to just showing the name for stats
          setTargetDriver({ id: "unknown", name: driverName, status: "inactive", created_at: new Date().toISOString(), notes: null });
        }
      } else if (myDriver) {
        // Viewing my own profile
        setTargetDriver({ id: myDriver.id, name: myDriver.name, status: myDriver.status, created_at: myDriver.created_at, notes: myDriver.notes ?? null });
      }
    };
    loadDriver();
  }, [driverId, driverName, myDriver]);

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
  const kpis = useMemo(() => {
    const PRECO_BASE_CENTS = 300;
    const PRECO_KM_CENTS = 150;

    const count = orders.length;
    const totalKm = orders.reduce((s, o) => s + (o.distance_km ?? 0), 0);
    
    // Calcula ganho usando o valor real que está na tabela `confirmed_orders`.
    // Isso garante que se iFood enviou a taxa X, ela que aparecerá,
    // e caso fosse zero, o fallback do painel Index.js já a salvou com o cálculo de km.
    const totalEarningsCents = orders.reduce((s, o) => s + (o.order_total_cents || 0), 0);

    return { count, totalKm, totalEarningsCents };
  }, [orders]);

  /* ─── Bar chart data ─── */
  const chartData = useMemo(() => {
    const buckets: { label: string; value: number }[] = [];
    const now = new Date();
    
    if (period === "week") {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const label = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"][d.getDay()];
        const value = orders.filter(o => o.confirmed_at?.slice(0, 10) === key).length;
        buckets.push({ label, value });
      }
    } else if (period === "month") {
      const year = now.getFullYear();
      const month = now.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(year, month, i, 12, 0, 0, 0);
        const key = d.toISOString().slice(0, 10);
        const label = i.toString();
        const value = orders.filter(o => o.confirmed_at?.slice(0, 10) === key).length;
        buckets.push({ label, value });
      }
    } else {
      // 14 days fallback
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const label = d.getDate().toString();
        const value = orders.filter(o => o.confirmed_at?.slice(0, 10) === key).length;
        buckets.push({ label, value });
      }
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

  const avatar = targetDriver?.notes ? targetDriver.notes : (targetDriver?.name?.slice(0, 2).toUpperCase() ?? "??");

  const handleUpdateEmoji = async (emoji: string) => {
    if (!targetDriver) return;
    setUpdatingEmoji(true);
    const { error } = await supabase.from("drivers").update({ notes: emoji }).eq("id", targetDriver.id);
    if (!error) {
      setTargetDriver({ ...targetDriver, notes: emoji });
      setIsEditingEmoji(false);
    }
    setUpdatingEmoji(false);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border sticky top-0 z-40 bg-background/90 backdrop-blur">
        <div className="container py-3">
          <div className="flex items-center gap-3">
            <button onClick={() => { haptic(); navigate(-1); }} className="text-muted-foreground hover:text-foreground p-1 ios-btn">
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
          <div className="glass-card rounded-2xl p-6 flex flex-col sm:flex-row items-center sm:items-start gap-4 animate-slide-up shadow-xl relative z-10">
            <button 
              onClick={() => (myDriver?.id === targetDriver?.id) && (haptic(), setIsEditingEmoji(!isEditingEmoji))}
              className={`relative w-20 h-20 rounded-[1.25rem] bg-secondary/50 flex items-center justify-center text-4xl shadow-inner border border-border transition-transform overflow-hidden ${myDriver?.id === targetDriver?.id ? 'active:scale-95 hover:bg-secondary/70' : ''}`}
              disabled={updatingEmoji || (myDriver?.id !== targetDriver?.id)}
              title={myDriver?.id === targetDriver?.id ? "Mudar Avatar" : ""}
            >
              {updatingEmoji ? <Loader2 size={24} className="animate-spin text-primary" /> : (
                targetDriver?.notes ? <AppleEmoji name={targetDriver.notes} size={48} /> : 
                <span className="drop-shadow-md font-bold text-muted-foreground">{avatar}</span>
              )}
              {(myDriver?.id === targetDriver?.id) && (
                <div className="absolute inset-x-0 bottom-0 bg-black/40 py-0.5 text-[8px] text-white opacity-0 hover:opacity-100 transition-opacity flex justify-center">EDITAR</div>
              )}
            </button>
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <h2 className="font-bold text-foreground text-2xl tracking-tight">{targetDriver.name}</h2>
              <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-2">
                <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider ${
                  targetDriver.status === "active" ? "bg-emerald-500/20 text-emerald-400" : "bg-secondary text-muted-foreground"
                }`}>
                  {targetDriver.status === "active" ? "Ativo" : "Inativo"}
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium bg-secondary px-2.5 py-1 rounded-full">
                  <Clock size={12} /> {formatDate(targetDriver.created_at)}
                </span>
              </div>
            </div>

            {/* Emoji Picker Popup */}
            {isEditingEmoji && (
              <div className="absolute top-28 left-6 z-[100] bg-transparent shadow-2xl rounded-2xl animate-slide-up border border-border overflow-hidden">
                <EmojiPicker 
                  theme={Theme.DARK} 
                  onEmojiClick={(e) => { 
                    haptic(); 
                    handleUpdateEmoji(e.emoji); 
                  }} 
                  searchDisabled
                  skinTonesDisabled
                  width={320}
                  height={400}
                />
              </div>
            )}
          </div>
        )}

        {/* Estimated Earnings Card */}
        <div className="bg-primary/5 rounded-2xl p-4 flex items-center justify-between border border-primary/10">
          <div>
            <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><TrendingUp size={14} className="text-primary"/> Ganhos Estimados</p>
            <p className="text-2xl font-bold text-foreground tracking-tight mt-1">{formatCurrency(kpis.totalEarningsCents)}</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <DollarSign size={24} className="text-emerald-500" />
          </div>
        </div>

        {/* Period filter */}
        <div className="flex gap-1 bg-secondary rounded-xl p-1 relative z-0">
          {([["week","Semana"],["month","Este Mês"],["all","Histórico Total"]] as [Period,string][]).map(([p, l]) => (
            <button key={p} onClick={() => { haptic(); setPeriod(p); setPage(0); }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ios-btn ${
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
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-[1]"><KpiCard icon={<Package size={18} className="text-primary"/>} label="Entregas" value={kpis.count.toString()} sub="Total concluídas" /></div>
              <div className="flex-[1]"><KpiCard icon={<MapPin size={18} className="text-blue-500"/>} label="Distância" value={formatKm(kpis.totalKm)} sub="Rodados na data" /></div>
              <div className="flex-[1]"><KpiCard icon={<DollarSign size={18} className="text-emerald-500"/>} label="Ganhos(Est.)" value={formatCurrency(kpis.totalEarningsCents)} sub="Taxas calculadas" /></div>
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
                  ) : paginated.map(order => (
                    <div key={order.id} className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 items-center hover:bg-secondary/20 transition-colors">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-foreground truncate">{order.customer_name || "Cliente sem Nome"}</p>
                          {isAdmin && (
                            <a 
                              href={`https://portal.ifood.com.br/orders?orderId=${order.ifood_order_id}`} 
                              target="_blank" 
                              rel="noreferrer"
                              title="Ver Pedido no iFood"
                              className="text-primary hover:text-primary/80 transition-colors"
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                haptic(); 
                              }}
                            >
                              <ExternalLink size={14} />
                            </a>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1"><Clock size={11} /> {new Date(order.confirmed_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                          <span className="flex items-center gap-1"><MapPin size={11} /> {formatKm(order.distance_km || 0)}</span>
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-emerald-500 whitespace-nowrap">
                        {order.order_total_cents != null ? formatCurrency(order.order_total_cents) : "—"}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(order.confirmed_at)}</span>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                    <button onClick={() => { haptic(); setPage(p => Math.max(0, p - 1)); }} disabled={page === 0}
                      className="p-1.5 rounded-lg bg-secondary disabled:opacity-30 hover:bg-secondary/80 transition-all ios-btn">
                      <ChevronLeft size={14} />
                    </button>
                    <span className="text-xs text-muted-foreground font-medium">
                      {page + 1} / {totalPages} · {filtered.length} entregas
                    </span>
                    <button onClick={() => { haptic(); setPage(p => Math.min(totalPages - 1, p + 1)); }} disabled={page >= totalPages - 1}
                      className="p-1.5 rounded-lg bg-secondary disabled:opacity-30 hover:bg-secondary/80 transition-all ios-btn">
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
