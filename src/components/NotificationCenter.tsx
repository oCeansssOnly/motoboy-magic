import { Bell, X, Info, CheckCircle2, AlertTriangle, AlertCircle, Trash2 } from "lucide-react";
import { useNotifications, AppNotification } from "@/hooks/useNotifications";
import { haptic } from "@/lib/utils";

interface NotificationCenterProps {
  onClose: () => void;
}

const ICONS = {
  success: <CheckCircle2 size={16} className="text-emerald-500" />,
  warning: <AlertTriangle size={16} className="text-amber-500" />,
  error: <AlertCircle size={16} className="text-red-500" />,
  info: <Info size={16} className="text-blue-500" />
};

export function NotificationCenter({ onClose }: NotificationCenterProps) {
  const { notifications, clearNotifications } = useNotifications();

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-md animate-fade-in pt-16 sm:pt-20">
      <div className="w-full max-w-lg flex flex-col max-h-[85vh] animate-slide-up relative">
        
        {/* Header - Apple Style */}
        <div className="flex items-center justify-between mb-4 px-2">
          <h2 className="font-bold text-white text-2xl tracking-tight drop-shadow-md">Central de Notificações</h2>
          <button onClick={() => { haptic(); onClose(); }} className="p-2.5 rounded-full bg-white/20 backdrop-blur-lg hover:bg-white/30 text-white transition-colors ios-btn shadow-sm">
            <X size={20} />
          </button>
        </div>

        {/* Action bar */}
        {notifications.length > 0 && (
          <div className="flex justify-end mb-3 px-2">
            <button onClick={() => { haptic(); clearNotifications(); }} className="text-[13px] font-semibold text-white/80 hover:text-white flex items-center gap-1.5 transition-colors bg-black/20 px-3 py-1.5 rounded-full backdrop-blur-md">
              <Trash2 size={14} /> Limpar
            </button>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-3 pb-8 hide-scrollbar px-1">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center mt-10">
              <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-lg mb-4">
                <Bell size={32} className="text-white/60" />
              </div>
              <p className="text-lg font-semibold text-white mt-2">Sem Novas Notificações</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className="bg-white/70 dark:bg-[#1c1c1e]/70 backdrop-blur-xl p-4 rounded-3xl shadow-lg border border-white/20 dark:border-white/10 flex flex-col gap-1.5 animate-fade-in pointer-events-none transform transition-all duration-300">
                {/* Top Label (App style) */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {ICONS[n.type]}
                    <span className="text-[11px] font-semibold tracking-wider text-foreground/70 uppercase">RouteOS</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-medium text-foreground/50">
                    <span>{new Date(n.timestamp).toLocaleDateString("pt-BR", { day: '2-digit', month: '2-digit' })}</span>
                    <span>{new Date(n.timestamp).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
                
                {/* Main Content */}
                <div className="mt-1">
                  <p className="font-bold text-[15px] text-foreground tracking-tight leading-tight">{n.title}</p>
                  <p className="text-[14px] text-foreground/80 mt-1 leading-snug font-medium line-clamp-3">{n.message}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
