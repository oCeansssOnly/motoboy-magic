import { useState } from "react";
import { Bike, CheckCircle, Loader2, Phone, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function DriverSignup() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const { error: err } = await supabase
        .from("drivers")
        .insert({ name: name.trim(), phone: phone.trim() || null, status: "pending" });
      if (err) throw err;
      setDone(true);
    } catch (err: any) {
      setError(err.message || "Erro ao enviar solicitação. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto glow-primary">
            <Bike size={32} className="text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">RotaFácil</h1>
          <p className="text-sm text-muted-foreground">Cadastro de Motorista</p>
        </div>

        {done ? (
          <div className="glass-card rounded-xl p-8 text-center space-y-4 animate-slide-up">
            <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mx-auto">
              <CheckCircle size={32} className="text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Solicitação Enviada!</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Sua solicitação foi recebida. Aguarde a aprovação do administrador para começar a receber entregas.
            </p>
            <div className="pt-2 text-xs text-muted-foreground flex items-center justify-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Aguardando aprovação
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="glass-card rounded-xl p-6 space-y-4 animate-slide-up">
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Nome completo *</label>
              <div className="relative">
                <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  placeholder="Seu nome"
                  className="w-full bg-input border border-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Telefone (opcional)</label>
              <div className="relative">
                <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="w-full bg-input border border-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>

            {error && (
              <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all disabled:opacity-40 flex items-center justify-center gap-2 glow-primary"
            >
              {submitting ? <><Loader2 size={16} className="animate-spin" /> Enviando...</> : "Solicitar Acesso"}
            </button>

            <p className="text-center text-xs text-muted-foreground">
              Sua solicitação será analisada pelo administrador.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
