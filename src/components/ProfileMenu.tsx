import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, LayoutDashboard, Bike, Shield, TrendingUp, Radio, MapPin } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useDriverEmojis } from "@/hooks/useDriverEmojis";
import { AppleEmoji } from "@/components/AppleEmoji";
import { haptic } from "@/lib/utils";

function getMonthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

interface ProfileMenuProps {
  backgroundMode?: boolean;
  setBackgroundMode?: (val: boolean) => void;
  driverLocationName?: string;
}

export function ProfileMenu({ backgroundMode, setBackgroundMode, driverLocationName }: ProfileMenuProps) {
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
  const driverEmojis = useDriverEmojis();
  const emojiName = driverEmojis[displayName] || (isAdmin ? "👨‍💻" : "🏍️");

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
  };

  return (
    <div className="relative" ref={ref}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="relative flex items-center justify-center w-10 h-10 rounded-full bg-[#1C1C1E] border border-white/5 transition-all outline-none"
      >
        <div className="flex items-center justify-center text-foreground opacity-90">
          <AppleEmoji name={emojiName} size={22} />
        </div>
        {/* Online Indicator */}
        <span className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-[#34C759] border-2 border-background" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-64 glass-card rounded-xl shadow-2xl border border-border z-50 overflow-hidden animate-slide-up">
          {/* User info */}
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 relative overflow-hidden ${
                isAdmin ? "bg-primary text-primary-foreground" : "bg-primary/20 text-primary"
              }`}>
                <AppleEmoji name={emojiName} size={26} />
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
              {/* Background Tracking Toggle */}
              {setBackgroundMode && backgroundMode !== undefined && (
                <div className="flex flex-col gap-2 p-2 mb-2 bg-white/5 rounded-lg border border-white/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <Radio size={14} className={backgroundMode ? "text-emerald-500 animate-pulse" : "text-muted-foreground"} />
                       <span className="text-xs font-semibold text-foreground">Modo Background</span>
                    </div>
                    <button
                      onClick={() => { haptic(); setBackgroundMode(!backgroundMode); }}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${backgroundMode ? 'bg-emerald-500' : 'bg-white/10'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${backgroundMode ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
                    </button>
                  </div>
                  {/* Location display inside profile menu */}
                  <div className="flex items-start gap-1.5 mt-1 border-t border-white/5 pt-2">
                    <MapPin size={12} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                    <span className="text-[10px] text-muted-foreground leading-tight line-clamp-2">
                      {driverLocationName || "Buscando localização..."}
                    </span>
                  </div>
                </div>
              )}
              
              <button
                onClick={() => { setOpen(false); navigate("/perfil"); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-secondary transition-all text-left"
              >
                <TrendingUp size={15} className="text-primary flex-shrink-0" />
                Ver meu Perfil &amp; Métricas
              </button>
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
