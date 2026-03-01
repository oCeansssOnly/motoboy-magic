import { useState } from "react";
import { Bike, Mail, Lock, Loader2, Eye, EyeOff, User, Clock, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type AuthView = "signin" | "signup" | "pending" | "inactive" | "check_email";

export function AuthGate() {
  const { user, profile, driver, refreshProfile } = useAuth();
  const [view, setView] = useState<AuthView>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  // ── Determine which screen to show ──────────────────────────────────────────
  // After auth loads, show status screens instead of login form
  if (user && profile) {
    if (profile.role === "admin") return null; // Happy path — Index renders main UI
    if (profile.role === "driver") {
      if (driver?.status === "active") return null; // Happy path
      if (driver?.status === "inactive") {
        return <StatusScreen
          icon={<ShieldAlert size={32} className="text-destructive" />}
          title="Conta desativada"
          message="Sua conta foi desativada pelo administrador. Entre em contato para mais informações."
          color="destructive"
          onSignOut={() => supabase.auth.signOut()}
        />;
      }
      // pending (or no driver yet)
      return <StatusScreen
        icon={<Clock size={32} className="text-amber-400" />}
        title="Aguardando aprovação"
        message="Sua conta está pendente de aprovação pelo administrador. Você será notificado quando tiver acesso liberado."
        color="amber"
        onSignOut={() => supabase.auth.signOut()}
      />;
    }
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) toast.error("Erro ao entrar", { description: error.message });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Informe seu nome."); return; }
    setLoading(true);

    try {
      // 1. Create the auth user
      const { data: authData, error: authErr } = await supabase.auth.signUp({ email, password });
      if (authErr) { toast.error("Erro ao cadastrar", { description: authErr.message }); return; }

      const authUserId = authData.user?.id;
      if (!authUserId) { setView("check_email"); return; }

      // 2. Create the drivers row (pending)
      const { data: driverRow, error: driverErr } = await supabase
        .from("drivers")
        .insert({ name: name.trim(), status: "pending" })
        .select("id")
        .single();

      if (driverErr) { console.error("driver insert error:", driverErr); }

      // 3. Create the user_profiles row linking to the driver
      const { error: profileErr } = await supabase
        .from("user_profiles")
        .insert({ auth_user_id: authUserId, role: "driver", driver_id: driverRow?.id ?? null });

      if (profileErr) { console.error("profile insert error:", profileErr); }

      // 4. Refresh AuthContext so it picks up the new profile
      await refreshProfile();

      // If email confirmation is needed (user not confirmed yet)
      if (!authData.session) {
        setView("check_email");
      }
    } finally {
      setLoading(false);
    }
  };

  if (view === "check_email") {
    return <StatusScreen
      icon={<Mail size={32} className="text-primary" />}
      title="Confirme seu e-mail"
      message={`Enviamos um link de confirmação para ${email}. Após confirmar, faça login para continuar.`}
      color="primary"
      actionLabel="Voltar ao login"
      onAction={() => { setView("signin"); }}
    />;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto glow-primary">
            <Bike size={32} className="text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">RotaFácil</h1>
          <p className="text-sm text-muted-foreground">Gerenciamento de entregas</p>
        </div>

        <div className="glass-card rounded-xl p-6 space-y-4 animate-slide-up">
          {/* Tabs */}
          <div className="flex gap-1 bg-secondary rounded-lg p-1">
            {(["signin", "signup"] as const).map(t => (
              <button
                key={t}
                onClick={() => setView(t)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                  view === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "signin" ? "Entrar" : "Criar Conta"}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={view === "signin" ? handleSignIn : handleSignUp} className="space-y-3">
            {view === "signup" && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Nome completo *</label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
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
            )}

            <div>
              <label className="text-xs text-muted-foreground block mb-1">E-mail</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="seu@email.com"
                  className="w-full bg-input border border-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">Senha</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full bg-input border border-border rounded-lg pl-9 pr-10 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email || password.length < 6 || (view === "signup" && !name.trim())}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-40 flex items-center justify-center gap-2 mt-1"
            >
              {loading
                ? <><Loader2 size={15} className="animate-spin" /> Aguarde...</>
                : view === "signin" ? "Entrar" : "Criar Conta"}
            </button>
          </form>

          {view === "signup" && (
            <p className="text-xs text-muted-foreground text-center">
              Novas contas aguardam aprovação do administrador antes de ter acesso.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Reusable status/error screen ──────────────────────────────────────────────
function StatusScreen({ icon, title, message, color, onSignOut, onAction, actionLabel }: {
  icon: React.ReactNode;
  title: string;
  message: string;
  color: "primary" | "amber" | "destructive";
  onSignOut?: () => void;
  onAction?: () => void;
  actionLabel?: string;
}) {
  const colorMap = {
    primary: "bg-primary/15",
    amber: "bg-amber-500/15",
    destructive: "bg-destructive/15",
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto ${colorMap[color]}`}>
          {icon}
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground mb-2">{title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
        </div>
        <div className="flex flex-col gap-2">
          {onAction && actionLabel && (
            <button onClick={onAction} className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all">
              {actionLabel}
            </button>
          )}
          {onSignOut && (
            <button onClick={onSignOut} className="w-full py-2.5 rounded-lg bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-all border border-border">
              Sair
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
