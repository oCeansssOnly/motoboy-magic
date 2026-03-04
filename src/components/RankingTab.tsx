import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp, ArrowDown, Activity, Clock, PackageCheck, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { haptic } from "@/lib/utils";
import { AppleEmoji } from "@/components/AppleEmoji";
import { useDriverEmojis } from "@/hooks/useDriverEmojis";
import { Trophy } from "lucide-react";

interface RankStats {
  name: string;
  totalOrders: number;
  totalDistance: number;
}

export function RankingTab() {
  const [stats, setStats] = useState<RankStats[]>([]);
  const [filter, setFilter] = useState<"hoje" | "semana" | "mes">("hoje");
  const [loading, setLoading] = useState(true);
  const driverEmojis = useDriverEmojis();
  const navigate = useNavigate();

  useEffect(() => {
    fetchStats();

    // Subscribe to real-time changes on confirmed_orders
    const channel = supabase
      .channel("ranking-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "confirmed_orders" },
        () => {
          fetchStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filter]);

  const fetchStats = async () => {
    setLoading(true);
    const now = new Date();
    let startDate = new Date();
    
    if (filter === "hoje") {
      startDate.setHours(0, 0, 0, 0);
    } else if (filter === "semana") {
      startDate.setDate(now.getDate() - 7);
    } else if (filter === "mes") {
      startDate.setDate(now.getDate() - 30);
    }

    const { data, error } = await supabase
      .from("confirmed_orders")
      .select("motoboy_name, distance_km, confirmed_at")
      .gte("confirmed_at", startDate.toISOString());

    if (error) {
      console.error("[RankingTab] Error fetching stats:", error);
      setLoading(false);
      return;
    }

    const aggregated: Record<string, RankStats> = {};
    for (const order of data || []) {
      const name = order.motoboy_name?.trim() || "Desconhecido";
      
      // Relaxed filters: only ignore explicitly "Desconhecido" 
      // or very generic placeholders if needed.
      if (name === "Desconhecido") {
        continue;
      }

      if (!aggregated[name]) {
        aggregated[name] = { name, totalOrders: 0, totalDistance: 0 };
      }
      aggregated[name].totalOrders += 1;
      aggregated[name].totalDistance += Number(order.distance_km || 0);
    }

    const sorted = Object.values(aggregated).sort((a, b) => {
      const scoreA = (a.totalOrders * 10) + a.totalDistance;
      const scoreB = (b.totalOrders * 10) + b.totalDistance;
      return scoreB - scoreA;
    });

    setStats(sorted);
    setLoading(false);
  };

  return (
    <div className="space-y-6 pb-24 max-w-lg mx-auto w-full px-4 animate-fade-in pt-4">
      {/* Header */}
      <div className="flex flex-col items-center justify-center space-y-2 mt-4 mb-8">
        <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center shadow-inner mb-2">
          <Trophy size={32} className="text-amber-500" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Ranking Geral</h1>
        <p className="text-sm text-muted-foreground">Os melhores desempenhadores</p>
      </div>

      {/* Segmented Control */}
      <div className="glass-card p-1 rounded-xl flex gap-1">
        {(["hoje", "semana", "mes"] as const).map(f => (
          <button
            key={f}
            onClick={() => { haptic(); setFilter(f); }}
            className={`flex-1 py-1.5 rounded-lg text-[13px] font-semibold capitalize transition-all ${filter === f ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary/50"}`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Leaderboard */}
      <div className="space-y-4 relative">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 opacity-50">
            <Activity className="animate-spin mb-4" />
            <p>Calculando posições...</p>
          </div>
        ) : stats.length === 0 ? (
          <div className="text-center py-12 bg-secondary/30 rounded-2xl border border-white/5">
            <p className="text-muted-foreground text-sm">Nenhum dado para este período.</p>
          </div>
        ) : (
          stats.map((stat, i) => (
            <button
              key={stat.name}
              onClick={() => { haptic(); navigate(`/motorista/${encodeURIComponent(stat.name)}`); }}
              className="w-full text-left glass-card rounded-2xl p-4 flex items-center gap-4 relative overflow-hidden ios-btn"
            >
              {i === 0 && (
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
              )}
              
              <div className={`w-8 h-8 flex items-center justify-center font-bold text-sm rounded-full flex-shrink-0 ${
                i === 0 ? "bg-amber-500 text-white shadow-lg shadow-amber-500/30 scale-110" :
                i === 1 ? "bg-slate-300 text-slate-800" :
                i === 2 ? "bg-amber-700/60 text-amber-100" :
                "bg-secondary text-muted-foreground"
              }`}>
                {i + 1}
              </div>

              <div className="w-12 h-12 rounded-2xl bg-secondary/50 flex items-center justify-center shadow-inner border border-border/50 flex-shrink-0">
                {driverEmojis[stat.name] ? (
                  <AppleEmoji name={driverEmojis[stat.name]} size={32} />
                ) : (
                  <span className="font-bold text-muted-foreground">{stat.name.slice(0, 2).toUpperCase()}</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-bold text-foreground truncate text-lg flex items-center gap-2">
                  {stat.name}
                  {i === 0 && <span className="text-[10px] uppercase font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">Top 1</span>}
                </p>
                <div className="flex items-center gap-3 mt-1 text-[11px] font-medium text-muted-foreground">
                  <span className="flex items-center gap-1.5"><PackageCheck size={13} className="text-emerald-500" /> {stat.totalOrders} Entregas</span>
                  <span className="flex items-center gap-1.5"><Zap size={13} className="text-blue-500" /> {Math.round(stat.totalDistance)} km</span>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
