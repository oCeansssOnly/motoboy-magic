import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, LayoutDashboard, Package, Bike, ChevronDown, Shield, User, TrendingUp } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

function getMonthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

interface DriverStats {
  total: number;
  thisMonth: number;
}

interface ProfileMenuProps {
  driverStats?: DriverStats;
}

export function ProfileMenu({ driverStats }: ProfileMenuProps) {
  const { user, profile, driver, isAdmin, isDriver, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const displayName = driver?.name || user?.email?.split("@")[0] || "Usuário";
  const initials = displayName.slice(0, 2).toUpperCase();

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
  };

  return (
    <div className="relative" ref={ref}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-secondary/60 hover:bg-secondary border border-border/50 transition-all"
      >
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${
          isAdmin ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary"
        }`}>
          {initials}
        </div>
        <span className="text-sm font-medium text-foreground hidden sm:block max-w-[100px] truncate">
          {displayName}
        </span>
        {isAdmin && (
          <Shield size={11} className="text-primary flex-shrink-0" />
        )}
        <ChevronDown size={13} className={`text-muted-foreground transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-64 glass-card rounded-xl shadow-2xl border border-border z-50 overflow-hidden animate-slide-up">
          {/* User info */}
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                isAdmin ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary"
              }`}>
                {initials}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-foreground text-sm truncate">{displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </div>
            <div className={`mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${
              isAdmin ? "bg-primary/20 text-primary" : 
              driver?.status === "active" ? "bg-emerald-500/20 text-emerald-400" :
              driver?.status === "pending" ? "bg-amber-500/20 text-amber-500" :
              "bg-secondary text-muted-foreground"
            }`}>
              {isAdmin ? <><Shield size={10} /> Administrador</> :
               driver?.status === "active"  ? <><Bike size={10} /> Motorista Ativo</> :
               driver?.status === "pending" ? <><Bike size={10} /> Aguardando Aprovação</> :
               <><Bike size={10} /> Motorista</>}
            </div>
          </div>

          {/* Admin actions */}
          {isAdmin && (
            <div className="p-2 border-b border-border">
              <button
                onClick={() => { setOpen(false); navigate("/admin/motoristas"); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-secondary transition-all text-left"
              >
                <LayoutDashboard size={15} className="text-primary flex-shrink-0" />
                Painel de Motoristas
              </button>
            </div>
          )}

          {/* Driver actions */}
          {isDriver && (
            <div className="p-2 border-b border-border">
              <button
                onClick={() => { setOpen(false); navigate("/perfil"); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-secondary transition-all text-left"
              >
                <TrendingUp size={15} className="text-primary flex-shrink-0" />
                Ver meu Perfil &amp; Métricas
              </button>
            </div>
          )}

          {/* Driver stats summary (quick glance) */}
          {isDriver && driverStats !== undefined && (
            <div className="p-3 border-b border-border">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2 px-1">Minhas Entregas</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                    <Package size={11} />
                    <span className="text-[10px]">Total</span>
                  </div>
                  <p className="text-lg font-bold text-foreground">{driverStats.total}</p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                    <Package size={11} />
                    <span className="text-[10px]">Este Mês</span>
                  </div>
                  <p className="text-lg font-bold text-foreground">{driverStats.thisMonth}</p>
                </div>
              </div>
            </div>
          )}

          {/* Sign out */}
          <div className="p-2">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-all text-left"
            >
              <LogOut size={15} className="flex-shrink-0" />
              Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
