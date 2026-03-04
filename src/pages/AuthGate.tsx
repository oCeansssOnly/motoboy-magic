import { useState } from "react";
import { Bike, Mail, Lock, Loader2, Eye, EyeOff, User, Clock, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { haptic } from "@/lib/utils";

type AuthView = "signin" | "signup" | "check_email";

export function AuthGate() {
  const { user, profile, driver, refreshProfile } = useAuth();
  const [view, setView] = useState<AuthView>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState("😎");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [loading, setLoading] = useState(false);

  // Local flag: set immediately after signup so we show pending screen
  // without waiting for AuthContext to re-fetch (avoids race condition)
  const [justSignedUp, setJustSignedUp] = useState(false);

  // ── Status screens (post-auth) ───────────────────────────────────────────────
  // Show pending if EITHER we just signed up locally OR the DB says pending
  const isPending = justSignedUp ||
    (user && profile?.role === "driver" && driver?.status !== "active" && driver?.status !== "inactive");
  const isInactive = !justSignedUp &&
    user && profile?.role === "driver" && driver?.status === "inactive";

  if (user && profile?.role === "admin") return null; // Admin → show dashboard
  if (user && profile?.role === "driver" && driver?.status === "active") return null; // Active driver → show dashboard

  if (isInactive) {
    return <StatusScreen
      icon={<ShieldAlert size={32} className="text-destructive" />}
      title="Conta desativada"
      message="Sua conta foi desativada pelo administrador. Entre em contato para mais informações."
      color="destructive"
      onSignOut={() => supabase.auth.signOut()}
    />;
  }

  if (isPending) {
    return <StatusScreen
      icon={<Clock size={32} className="text-amber-400" />}
      title="Aguardando aprovação"
      message="Seu cadastro foi recebido com sucesso! Aguarde a aprovação do administrador para ter acesso ao sistema."
      color="amber"
      onSignOut={() => { setJustSignedUp(false); supabase.auth.signOut(); }}
    />;
  }

  // ── Sign-in handler ──────────────────────────────────────────────────────────
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("invalid login") || msg.includes("invalid credentials")) {
        toast.error("E-mail ou senha incorretos.");
      } else {
        toast.error("Erro ao entrar", { description: error.message });
      }
    }
  };

  // ── Sign-up handler ──────────────────────────────────────────────────────────
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Informe seu nome completo."); return; }
    setLoading(true);
    try {
      // 1. Create auth user (email confirmation is disabled at project level)
      const { data: authData, error: authErr } = await supabase.auth.signUp({ email, password });
      if (authErr) {
        const msg = authErr.message.toLowerCase();
        if (msg.includes("already registered") || msg.includes("user already exists")) {
          toast.error("Este e-mail já está cadastrado. Tente entrar.");
        } else if (msg.includes("rate limit") || msg.includes("too many")) {
          toast.error("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
        } else {
          toast.error("Erro ao cadastrar", { description: authErr.message });
        }
        return;
      }

      const authUserId = authData.user?.id;
      if (!authUserId) {
        // Email confirmation required — shouldn't happen since we disabled it
        setView("check_email");
        return;
      }

      // 2. Create the drivers profile row (pending)
      // We will store the chosen emoji inside the generic "notes" string column
      const { data: driverRow, error: driverErr } = await supabase
        .from("drivers")
        .insert({ name: name.trim(), status: "pending", notes: selectedEmoji })
        .select("id")
        .single();
      if (driverErr) console.error("driver insert:", driverErr);

      // 3. Create user_profiles linking auth user → driver
      const { error: profileErr } = await supabase
        .from("user_profiles")
        .insert({ auth_user_id: authUserId, role: "driver", driver_id: driverRow?.id ?? null });
      if (profileErr) console.error("profile insert:", profileErr);

      // 4. Show pending screen immediately (local flag prevents race condition
      //    where AuthContext fires before rows are committed)
      setJustSignedUp(true);

      // 5. Refresh AuthContext in the background
      await refreshProfile();
    } finally {
      setLoading(false);
    }
  };

  if (view === "check_email") {
    return <StatusScreen
      icon={<Mail size={32} className="text-primary" />}
      title="Confirme seu e-mail"
      message={`Enviamos um link para ${email}. Após confirmar, volte e faça login.`}
      color="primary"
      actionLabel="Voltar ao login"
      onAction={() => setView("signin")}
    />;
  }

  // ── Login / signup form ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
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

          <form onSubmit={view === "signin" ? handleSignIn : handleSignUp} className="space-y-3">
            {view === "signup" && (
              <>
                <div className="flex flex-col items-center justify-center relative">
                  <label className="text-xs text-muted-foreground block mb-2 font-medium">Avatar de Perfil</label>
                  <button
                    type="button"
                    onClick={() => { haptic(); setShowEmojiPicker(!showEmojiPicker); }}
                    className="w-20 h-20 rounded-full bg-secondary/50 flex items-center justify-center text-4xl shadow-inner border border-border transition-transform hover:scale-105 active:scale-95 z-10"
                  >
                    {selectedEmoji}
                  </button>
                  {showEmojiPicker && (
                    <div className="absolute top-24 z-[100] animate-slide-up shadow-2xl rounded-2xl overflow-hidden border border-border">
                      <EmojiPicker 
                        theme={Theme.DARK} 
                        onEmojiClick={(e) => { 
                          haptic(); 
                          setSelectedEmoji(e.emoji); 
                          setShowEmojiPicker(false); 
                        }} 
                        searchDisabled
                        skinTonesDisabled
                        width={300}
                        height={400}
                      />
                    </div>
                  )}
                </div>
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
              </>
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
                  onClick={() => { haptic(); setShowPw(p => !p); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground ios-btn"
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email || password.length < 6 || (view === "signup" && !name.trim())}
              onClick={() => haptic(30)}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 flex items-center justify-center gap-2 mt-2 ios-btn shadow-lg glow-primary"
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> Conectando...</>
                : view === "signin" ? "Entrar" : "Criar Conta"}
            </button>
          </form>

          {view === "signup" && (
            <p className="text-xs text-muted-foreground text-center">
              Novas contas aguardam aprovação do administrador.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Reusable status screen ────────────────────────────────────────────────────
function StatusScreen({ icon, title, message, color, onSignOut, onAction, actionLabel }: {
  icon: React.ReactNode;
  title: string;
  message: string;
  color: "primary" | "amber" | "destructive";
  onSignOut?: () => void;
  onAction?: () => void;
  actionLabel?: string;
}) {
  const colorCls = { primary: "bg-primary/15", amber: "bg-amber-500/15", destructive: "bg-destructive/15" };
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto ${colorCls[color]}`}>
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
