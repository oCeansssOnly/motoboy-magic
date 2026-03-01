import { useState, useEffect, useCallback } from "react";
import { OrderCard } from "@/components/OrderCard";
import { IFoodSetup } from "@/components/IFoodSetup";
import { IFoodOrder, optimizeRoute, generateGoogleMapsUrl } from "@/lib/types";
import {
  Navigation,
  RefreshCw,
  Route,
  MapPin,
  Copy,
  Check,
  Loader2,
  Package,
  AlertCircle,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const [orders, setOrders] = useState<IFoodOrder[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [storeLat, setStoreLat] = useState<number>(-23.55052);
  const [storeLng, setStoreLng] = useState<number>(-46.633308);
  const [storeAddress, setStoreAddress] = useState('');
  const [showStoreConfig, setShowStoreConfig] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('ifood-orders');
      
      if (fnError) throw fnError;

      if (data?.orders && Array.isArray(data.orders)) {
        setOrders(data.orders.map((o: any) => ({
          ...o,
          selected: false,
          confirmed: false,
          confirmationCode: '',
        })));
        if (data.orders.length > 0) {
          toast.success(`${data.orders.length} pedido(s) carregado(s) do iFood`);
        } else {
          toast.info("Nenhum pedido novo encontrado. Tente novamente em breve.");
        }
      } else if (data?.error) {
        setError(data.error);
        toast.error("Erro ao buscar pedidos", { description: data.error });
      }
    } catch (err: any) {
      const msg = err?.message || 'Erro desconhecido';
      setError(msg);
      toast.error("Erro ao conectar com iFood", { description: msg });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Get store location from browser
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setStoreLat(pos.coords.latitude);
          setStoreLng(pos.coords.longitude);
        },
        () => {} // Use default coords
      );
    }
  }, []);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const unconfirmed = orders.filter((o) => !o.confirmed);
    if (selectedIds.size === unconfirmed.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(unconfirmed.map((o) => o.id)));
    }
  };

  const selectedOrders = orders.filter((o) => selectedIds.has(o.id));
  const optimizedRoute = optimizeRoute(selectedOrders, storeLat, storeLng);

  const openRoute = () => {
    if (selectedOrders.length === 0) {
      toast.error("Selecione pelo menos um pedido");
      return;
    }
    const url = generateGoogleMapsUrl(optimizedRoute, storeLat, storeLng);
    window.open(url, '_blank');
  };

  const copyRoute = () => {
    if (selectedOrders.length === 0) return;
    const url = generateGoogleMapsUrl(optimizedRoute, storeLat, storeLng);
    const desc = optimizedRoute
      .map((o, i) => `${i + 1}. ${o.customerName} - ${o.address}`)
      .join('\n');
    const text = `ROTA DE ENTREGAS (${optimizedRoute.length} paradas)\n${'─'.repeat(40)}\n${desc}\n${'─'.repeat(40)}\n🗺️ Rota: ${url}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Rota copiada!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfirmOrder = (orderId: string, code: string) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, confirmed: true, confirmationCode: code } : o
      )
    );
  };

  const unconfirmedOrders = orders.filter((o) => !o.confirmed);
  const confirmedOrders = orders.filter((o) => o.confirmed);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center glow-primary">
                <Navigation size={20} className="text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">RotaFácil</h1>
                <p className="text-xs text-muted-foreground">Pedidos iFood • Rota Otimizada</p>
              </div>
            </div>
            <button
              onClick={fetchOrders}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all text-sm"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              Atualizar
            </button>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-4 max-w-lg mx-auto">
        {/* Store location config */}
        <button
          onClick={() => setShowStoreConfig(!showStoreConfig)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          <MapPin size={12} />
          Local da loja: {storeLat.toFixed(4)}, {storeLng.toFixed(4)}
        </button>

        {showStoreConfig && (
          <div className="glass-card rounded-lg p-3 space-y-2 animate-slide-up">
            <label className="text-xs text-muted-foreground">Coordenadas da loja (ponto de partida e retorno)</label>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.0001"
                value={storeLat}
                onChange={(e) => setStoreLat(parseFloat(e.target.value) || 0)}
                className="flex-1 bg-input border border-border rounded px-2 py-1.5 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                placeholder="Latitude"
              />
              <input
                type="number"
                step="0.0001"
                value={storeLng}
                onChange={(e) => setStoreLng(parseFloat(e.target.value) || 0)}
                className="flex-1 bg-input border border-border rounded px-2 py-1.5 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                placeholder="Longitude"
              />
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="glass-card rounded-lg p-4 border-l-2 border-l-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="text-destructive mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Erro ao carregar pedidos</p>
                <p className="text-xs text-muted-foreground mt-1">{error}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Verifique as credenciais da API iFood nas configurações.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && orders.length === 0 && (
          <div className="text-center py-12">
            <Loader2 size={32} className="text-primary animate-spin mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Buscando pedidos do iFood...</p>
          </div>
        )}

        {/* Orders list */}
        {!loading && orders.length === 0 && !error && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Package size={28} className="text-primary animate-pulse-glow" />
            </div>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              Nenhum pedido disponível no momento. Os pedidos aceitos na sua loja aparecerão aqui automaticamente.
            </p>
            <button
              onClick={fetchOrders}
              className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-all"
            >
              Buscar Pedidos
            </button>
          </div>
        )}

        {unconfirmedOrders.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package size={18} className="text-primary" />
                <h2 className="font-semibold text-foreground">
                  {unconfirmedOrders.length} pedido(s) disponível(is)
                </h2>
              </div>
              <button
                onClick={selectAll}
                className="text-xs px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all"
              >
                {selectedIds.size === unconfirmedOrders.length ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
            </div>

            <div className="space-y-3">
              {unconfirmedOrders.map((order, i) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  index={i}
                  selectable
                  selected={selectedIds.has(order.id)}
                  onToggleSelect={toggleSelect}
                  onConfirm={handleConfirmOrder}
                />
              ))}
            </div>
          </>
        )}

        {/* Route actions */}
        {selectedOrders.length > 0 && (
          <div className="space-y-2 pt-2 sticky bottom-4">
            <div className="glass-card rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-2">
                <Route size={12} className="inline mr-1" />
                Rota otimizada: Loja → {optimizedRoute.map((o) => o.customerName).join(' → ')} → Loja
              </p>
              <div className="space-y-2">
                <button
                  onClick={openRoute}
                  className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all glow-primary flex items-center justify-center gap-2"
                >
                  <Navigation size={16} />
                  Abrir Rota ({selectedOrders.length} paradas)
                </button>
                <button
                  onClick={copyRoute}
                  className="w-full py-2.5 rounded-lg bg-secondary text-secondary-foreground font-medium text-sm hover:bg-secondary/80 transition-all border border-border flex items-center justify-center gap-2"
                >
                  {copied ? <Check size={16} className="text-primary" /> : <Copy size={16} />}
                  {copied ? 'Copiado!' : 'Copiar Rota'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmed orders */}
        {confirmedOrders.length > 0 && (
          <>
            <div className="flex items-center gap-2 pt-4">
              <Check size={18} className="text-accent-foreground" />
              <h2 className="font-semibold text-foreground">Confirmados ({confirmedOrders.length})</h2>
            </div>
            <div className="space-y-3">
              {confirmedOrders.map((order, i) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  index={i}
                  onConfirm={handleConfirmOrder}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default Index;
