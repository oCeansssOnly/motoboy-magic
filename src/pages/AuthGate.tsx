import { useState } from "react";
import { Activity, Mail, Lock, Loader2, Eye, EyeOff, User, Clock, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import EmojiPicker, { Theme, EmojiStyle, Emoji } from "emoji-picker-react";
import { haptic } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import mbCenter from "@/assets/mb_up.png"; // Olhando Centro (Default)
import mbPhone from "@/assets/mb_center.png"; // Olhando Celular (Email)
import mbPhoneFace from "@/assets/mb_phone.png"; // Celular Mão na Cara (Senha Vazia)
import mbFaceTurned from "@/assets/mb_face_turned.png"; // Mão na Cara Rosto Virado (Senha Digitada)
import mbUp from "@/assets/mb_phone_face.png"; // Olhando pra Cima (Nome)

type AuthView = "signin" | "signup" | "check_email";

export function AuthGate() {
  const { user, profile, driver, refreshProfile } = useAuth();
  const [view, setView] = useState<AuthView>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState("😎");
  const [selectedUnified, setSelectedUnified] = useState("1f60e");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<"name" | "email" | "password" | null>(null);

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
  const renderForm = (isMobile: boolean = false) => (
    <div className={`w-full ${isMobile ? '' : 'max-w-md animate-slide-up bg-zinc-900/40 md:bg-zinc-950/60 backdrop-blur-3xl md:backdrop-blur-2xl border border-white/10 rounded-[32px] p-5 sm:p-10 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden'}`} style={isMobile ? {} : { animationDelay: '0.2s', animationFillMode: 'both' }}>
      
      {!isMobile && (
        <>
          <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.04] md:from-white/[0.02] to-transparent pointer-events-none rounded-[32px]" />
          <div className="absolute top-0 left-1/4 right-1/4 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
          <div className="mb-5 md:mb-6 relative z-10 hidden md:block">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2 tracking-tight">{view === "signin" ? "Bem-vindo" : "Criar uma conta"}</h2>
            <p className="text-zinc-400 text-sm">
              {view === "signin" ? "Acesse a plataforma." : "Cadastre-se no iSync."}
            </p>
          </div>
        </>
      )}

      {/* Responsive Segmented Control */}
      {!isMobile && (
        <div className={`flex gap-2 mb-6 md:mb-8 border-b border-white/10 pb-2 md:pb-3 relative z-10`}>
          {(["signin", "signup"] as const).map(t => (
            <button
              key={t}
              onClick={() => setView(t)}
              className={`pb-2 text-sm font-semibold transition-colors duration-300 relative ${view === t
                  ? "text-white"
                  : "text-zinc-500 hover:text-zinc-300"
                }`}
            >
              {t === "signin" ? "Entrar" : "Cadastrar"}
              {view === t && (
                <motion.div layoutId="activeTabDesktop" transition={{ type: "spring", stiffness: 500, damping: 30 }} className={`absolute bottom-[-17px] left-0 w-full h-[2px] bg-blue-500 rounded-t-full`} />
              )}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={view === "signin" ? handleSignIn : handleSignUp} className={`relative z-10 ${isMobile ? 'space-y-5' : 'space-y-3.5 md:space-y-4'}`}>
        <AnimatePresence initial={false}>
          {view === "signup" && (
            <motion.div 
              key="signupBox"
              initial={{ opacity: 0, height: 0, scale: 0.95 }} 
              animate={{ opacity: 1, height: 'auto', scale: 1 }} 
              exit={{ opacity: 0, height: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className={`${isMobile ? 'space-y-5' : 'space-y-3.5 md:space-y-4'} overflow-hidden w-full origin-top`}
            >
              <div className={`flex flex-col items-center justify-center relative ${isMobile ? 'mb-4' : 'pb-1 mb-1 md:mb-2'}`}>
              <button
                type="button"
                onClick={() => { haptic(); setShowEmojiPicker(!showEmojiPicker); }}
                className={`rounded-full bg-black/50 border border-white/10 flex items-center justify-center shadow-[0_0_20px_rgba(0,0,0,0.5)] transition-transform hover:scale-105 active:scale-95 z-10 overflow-hidden relative group backdrop-blur-md ${isMobile ? 'w-20 h-20 text-4xl' : 'w-20 h-20 md:w-24 md:h-24 text-4xl md:text-5xl'}`}
              >
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm z-20">
                  <span className={`${isMobile ? 'text-[10px]' : 'text-[9px] md:text-[10px]'} font-bold uppercase tracking-widest text-white`}>Editar</span>
                </div>
                <Emoji unified={selectedUnified} size={isMobile ? 44 : 40} emojiStyle={EmojiStyle.APPLE} />
              </button>
              {showEmojiPicker && (
                <div className={`absolute ${isMobile ? 'top-32' : 'top-24 md:top-28'} z-[100] animate-slide-up shadow-2xl rounded-[32px] overflow-hidden border border-white/10`}>
                  <EmojiPicker 
                    theme={Theme.DARK} 
                    emojiStyle={EmojiStyle.APPLE}
                    onEmojiClick={(e) => { 
                      haptic(); 
                      setSelectedEmoji(e.emoji); 
                      setSelectedUnified(e.unified);
                      setShowEmojiPicker(false); 
                    }} 
                    searchDisabled
                    skinTonesDisabled
                    width={isMobile ? 320 : 280}
                    height={isMobile ? 400 : 350}
                  />
                </div>
              )}
            </div>

            <div className="space-y-1.5 group">
              <label className={`font-semibold text-zinc-400 group-focus-within:text-white transition-colors ml-1 ${isMobile ? 'text-[12px]' : 'text-[12px]'}`}>Nome Completo</label>
              <div className="relative flex items-center">
                <div className="absolute left-4 text-zinc-500 group-focus-within:text-blue-400 transition-colors pointer-events-none">
                  <User size={18} />
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  placeholder="Seu nome"
                  className={`w-full border border-white/10 rounded-[14px] text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium backdrop-blur-md bg-white/5 ${isMobile ? 'pl-11 pr-4 py-3.5 text-[15px]' : 'pl-11 pr-4 py-3 md:py-4 text-[14px] md:text-[15px]'}`}
                />
              </div>
            </div>
          </motion.div>
        )}
        </AnimatePresence>
        
        <div className="space-y-1.5 group">
          <label className={`font-semibold text-zinc-400 group-focus-within:text-white transition-colors ml-1 ${isMobile ? 'text-[12px]' : 'text-[12px]'}`}>Endereço de E-mail</label>
          <div className="relative flex items-center">
            <div className="absolute left-4 text-zinc-500 group-focus-within:text-blue-400 transition-colors pointer-events-none">
              <Mail size={18} />
            </div>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="nome@email.com"
              className={`w-full border border-white/10 rounded-[14px] text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium backdrop-blur-md bg-white/5 ${isMobile ? 'pl-11 pr-4 py-3.5 text-[15px]' : 'pl-11 pr-4 py-3 md:py-4 text-[14px] md:text-[15px]'}`}
            />
          </div>
        </div>

        <div className="space-y-1.5 group">
          <div className="flex justify-between items-center ml-1">
            <label className={`font-semibold text-zinc-400 group-focus-within:text-white transition-colors ${isMobile ? 'text-[12px]' : 'text-[12px]'}`}>Senha</label>
          </div>
          <div className="relative flex items-center">
            <div className="absolute left-4 text-zinc-500 group-focus-within:text-blue-400 transition-colors pointer-events-none">
              <Lock size={18} />
            </div>
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="••••••••"
              className={`w-full border border-white/10 rounded-[14px] text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium backdrop-blur-md bg-white/5 ${isMobile ? 'pl-11 pr-12 py-3.5 text-[15px] font-mono tracking-widest' : 'pl-11 pr-10 py-3 md:py-4 text-[14px] md:text-[15px] font-mono tracking-widest'}`}
            />
            <button
              type="button"
              onClick={() => { haptic(); setShowPw(p => !p); }}
              className={`absolute top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors right-4`}
            >
              {showPw ? <EyeOff size={isMobile ? 20 : 18} /> : <Eye size={isMobile ? 20 : 18} />}
            </button>
          </div>
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          type="submit"
          disabled={loading || !email || password.length < 6 || (view === "signup" && !name.trim())}
          onClick={() => haptic(30)}
          className={`w-full rounded-[14px] bg-blue-600 hover:bg-blue-500 text-white font-bold disabled:opacity-50 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center gap-2 transition-colors shadow-lg ${isMobile ? 'py-3.5 mt-5 text-[15px]' : 'py-3.5 md:py-4 mt-6 md:mt-8 text-[14px] md:text-[15px]'}`}
        >
          {loading
            ? <><Loader2 size={24} className="animate-spin" /> Conectando...</>
            : view === "signin" ? "Entrar na Plataforma" : "Criar Minha Conta"}
        </motion.button>
      </form>

      {/* Social Login / Separator (Visual only per reference image) */}
      <div className="mt-8 relative hidden md:block">
        <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-white/10" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-widest text-zinc-500">
            <span className="bg-zinc-950 px-4">Ou continue com</span>
        </div>
      </div>

      {view === "signup" && !isMobile && (
        <div className="mt-6 flex items-center justify-center gap-2 text-zinc-500">
          <ShieldAlert size={14} />
          <p className="text-xs font-medium">
            O cadastro passará por aprovação do administrador.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* ── DESKTOP LAYOUT ──────────────────────────────────────────────────────── */}
      <div className="hidden md:flex min-h-[100dvh] bg-zinc-950 text-white justify-center items-center font-sans selection:bg-blue-500/30 overflow-hidden relative p-8 w-full">
        {/* Unified Immersive Background */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_100%_100%_at_50%_50%,#000_10%,transparent_100%)] pointer-events-none" />
        <div className="absolute top-[0%] left-[-10%] w-[50vw] h-[50vw] bg-blue-600/20 blur-[120px] rounded-full mix-blend-screen pointer-events-none animate-pulse duration-1000" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-indigo-600/15 blur-[100px] rounded-full mix-blend-screen pointer-events-none" />

        <div className="relative z-10 w-full max-w-6xl flex flex-row items-center justify-between gap-8 min-h-full">
          <div className="flex w-1/2 flex-col items-start text-left">
            <div className="relative z-10 animate-slide-up">
              <div className="flex flex-row items-center gap-4 mb-8">
                <img src="/icon-192.png" alt="iSync Logo" className="w-14 h-14 object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]" />
                <span className="text-2xl font-bold tracking-tight">iSync</span>
              </div>
            </div>

            <div className="relative z-10 animate-slide-up" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
              <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tighter leading-[1.1] mb-6 text-transparent bg-clip-text bg-gradient-to-br from-white via-white to-white/40">
                Logística em<br />Sincronia.
              </h1>
              <p className="text-lg lg:text-xl text-zinc-400 max-w-md font-medium leading-relaxed drop-shadow-sm">
                A plataforma definitiva para conectar entregadores e logística de forma veloz.
              </p>
            </div>

            <div className="relative z-10 flex gap-4 animate-slide-up mt-8" style={{ animationDelay: '0.4s', animationFillMode: 'both' }}>
              <div className="flex items-center gap-2 text-zinc-400 text-sm font-medium bg-white/5 py-1.5 px-3 rounded-full border border-white/10 backdrop-blur-md">
                <Activity size={16} className="text-blue-400" /> Real-time tracking
              </div>
              <div className="flex items-center gap-2 text-zinc-400 text-sm font-medium bg-white/5 py-1.5 px-3 rounded-full border border-white/10 backdrop-blur-md">
                <Clock size={16} className="text-blue-400" /> Fast deployment
              </div>
            </div>
          </div>

          <div className="w-1/2 flex flex-col justify-center items-center relative z-20">
            {renderForm(false)}
          </div>
        </div>
      </div>

      {/* ── MOBILE LAYOUT (Exactly as Concept Reference, but Blue) ─────────────────────────────────────────────────── */}
      {/* ── MOBILE LAYOUT (Branded Deep Blue & Interactive) ─────────────────────────────────────────────────── */}
      <div className="md:hidden h-[100dvh] bg-[#020617] text-white font-sans selection:bg-blue-500/30 overflow-hidden relative w-full pt-safe">
        
        {/* Subtle background glow for the pure black sky */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden z-0">
          <div className="absolute top-[-20%] left-[-20%] w-[150vw] h-[150vw] bg-blue-600/20 blur-[140px] rounded-full animate-pulse z-0" style={{ animationDuration: '8s' }} />
        </div>

        {/* Welcome Text Left Side */}
        <div className="absolute top-[13%] left-[8%] z-10 pointer-events-none">
          <AnimatePresence mode="wait">
            <motion.h1 
              key={view}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="text-[42px] leading-[1.1] font-extrabold tracking-tight text-white mb-2"
              style={{ textShadow: "0px 4px 20px rgba(0,0,0,0.5)" }}
            >
              {view === 'signin' ? (
                <>
                  Olá,<br/>
                  Bem-vindo<br/>
                  novamente
                </>
              ) : (
                <>
                  Crie<br/>
                  sua conta<br/>
                  agora
                </>
              )}
            </motion.h1>
          </AnimatePresence>
        </div>

        {/* Motoboy Image Feature (Concept Absolute Match: Lowered slightly from the 8% state that user approved) */}
        <div className="absolute top-[11%] right-[-25%] w-[130%] h-[80dvh] flex items-start justify-end z-10 pointer-events-none">
          
          {/* Nickname Bubble when typing name */}
          <div className="absolute top-[-8%] left-[62%] w-0 h-0 flex justify-center items-center z-20 pointer-events-none overflow-visible">
            <AnimatePresence>
              {view === 'signup' && (focusedField === 'name' || name.trim().length > 0) && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.8 }}
                  className="bg-black/30 px-3 py-1.5 flex justify-center items-center whitespace-nowrap"
                  style={{ transformOrigin: "bottom center" }}
                >
                  <span className="text-white text-[16px] opacity-100 text-center" style={{ fontFamily: "Minecraftia, monospace", letterSpacing: "1px", lineHeight: "1" }}>
                    {name || "seunome"}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence mode="popLayout">
            <motion.img 
              key={focusedField === 'name' ? 'name' : focusedField === 'email' ? 'email' : focusedField === 'password' ? (password.length > 0 ? 'pw2' : 'pw1') : 'center'}
              initial={{ opacity: 0, filter: "blur(8px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(8px)" }}
              className="object-contain object-right-top relative z-10 drop-shadow-[0_20px_40px_rgba(0,0,0,0.8)] w-full h-full transition-transform duration-500"
              style={{
                 transform: focusedField ? 'scale(1.05) translateY(-2%)' : 'scale(1) translateY(0)',
                 transformOrigin: 'top right'
              }}
              src={
                focusedField === 'name' ? mbUp : 
                focusedField === 'email' ? mbPhone : 
                focusedField === 'password' ? (password.length > 0 ? mbFaceTurned : mbPhoneFace) : 
                mbCenter
              }
            />
          </AnimatePresence>
        </div>

        {/* The Glass Vault (Bottom Half - Overlapping the Motoboy higher up to his chest like the concept) */}
        <div className="absolute bottom-0 w-full h-[62dvh] z-20 flex-shrink-0 origin-bottom">
          <div className="h-full bg-[#0b1121]/90 backdrop-blur-3xl border-t border-blue-500/20 rounded-t-[40px] px-6 pt-6 pb-6 shadow-[0_-20px_50px_rgba(15,23,42,1)] relative overflow-y-auto no-scrollbar flex flex-col ring-1 ring-blue-500/10">
            {/* Soft inner highlight mimicking the 3d glass edge */}
            <div className="absolute inset-0 bg-gradient-to-b from-blue-500/10 to-transparent pointer-events-none rounded-t-[40px]" />
            <div className="absolute top-[-100px] left-1/2 -translate-x-1/2 w-[250px] h-[200px] bg-blue-600/20 blur-[90px] pointer-events-none rounded-full" />
            
            {/* Minimalist Segmented Control for better Signup Visibility */}
            <div className={`flex gap-4 mb-4 border-b border-blue-500/10 pb-2 relative z-10`}>
              {(["signin", "signup"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setView(t)}
                  className={`pb-2 text-[15px] font-semibold transition-colors duration-300 relative ${view === t
                      ? "text-white"
                      : "text-blue-200/40 hover:text-blue-200/80"
                    }`}
                >
                  {t === "signin" ? "Entrar na Conta" : "Cadastrar"}
                  {view === t && (
                    <motion.div layoutId="activeTabMobileRef" transition={{ type: "spring", stiffness: 500, damping: 30 }} className={`absolute bottom-[-9px] left-0 w-full h-[2px] bg-blue-500 rounded-t-full shadow-[0_0_10px_rgba(59,130,246,0.8)]`} />
                  )}
                </button>
              ))}
            </div>
            
            <form onSubmit={view === "signin" ? handleSignIn : handleSignUp} className={`relative z-10 space-y-4 mt-2`}>
              
              {view === "signup" && (
                <div className="mb-2">
                  <div className="space-y-1 group">
                    <label className={`font-semibold text-blue-200/60 group-focus-within:text-blue-400 transition-colors ml-1 text-[12px]`}>Nome Completo</label>
                    <div className="relative flex items-center bg-[#070e1d]/80 backdrop-blur-md border border-blue-500/10 rounded-[16px] transition-colors focus-within:border-blue-500/50 focus-within:bg-[#0a1128] focus-within:shadow-[0_0_15px_rgba(59,130,246,0.15)]">
                      <div className="absolute left-4 text-blue-400/50 group-focus-within:text-blue-400 transition-colors pointer-events-none">
                        <User size={18} strokeWidth={1.5} />
                      </div>
                      <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onFocus={() => setFocusedField('name')}
                        onBlur={() => setFocusedField(null)}
                        required
                        placeholder="Nome"
                        className={`w-full bg-transparent text-white placeholder:text-blue-200/30 focus:outline-none font-medium pl-12 pr-4 py-[14px] text-[15px]`}
                      />
                    </div>
                  </div>
                </div>
              )}
              
              <div className="space-y-1 group">
                <label className={`font-semibold text-blue-200/60 group-focus-within:text-blue-400 transition-colors ml-1 text-[12px]`}>Endereço de E-mail</label>
                <div className="relative flex items-center bg-[#070e1d]/80 backdrop-blur-md border border-blue-500/10 rounded-[16px] transition-colors focus-within:border-blue-500/50 focus-within:bg-[#0a1128] focus-within:shadow-[0_0_15px_rgba(59,130,246,0.15)]">
                  <div className="absolute left-4 text-blue-400/50 group-focus-within:text-blue-400 transition-colors pointer-events-none">
                    <Mail size={18} strokeWidth={1.5} />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    required
                    placeholder="nome@email.com"
                    className={`w-full bg-transparent text-white placeholder:text-blue-200/30 focus:outline-none font-medium pl-12 pr-4 py-[14px] text-[15px]`}
                  />
                </div>
              </div>

              <div className="space-y-1 group">
                <div className="flex justify-between items-center ml-1">
                  <label className={`font-semibold text-blue-200/60 group-focus-within:text-blue-400 transition-colors text-[12px]`}>Senha</label>
                </div>
                <div className="relative flex items-center bg-[#070e1d]/80 backdrop-blur-md border border-blue-500/10 rounded-[16px] transition-colors focus-within:border-blue-500/50 focus-within:bg-[#0a1128] focus-within:shadow-[0_0_15px_rgba(59,130,246,0.15)]">
                  <div className="absolute left-4 text-blue-400/50 group-focus-within:text-blue-400 transition-colors pointer-events-none">
                    <Lock size={18} strokeWidth={1.5} />
                  </div>
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    required
                    minLength={6}
                    placeholder="••••••••"
                    className={`w-full bg-transparent text-white placeholder:text-blue-200/30 focus:outline-none font-medium pl-12 pr-[80px] py-[14px] text-[15px] font-mono tracking-widest`}
                  />
                  {/* Forgot Password text inline inside the input per reference */}
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-blue-400/60 font-medium tracking-wide uppercase">
                    Forte
                  </div>
                </div>
                 {view === 'signin' && (
                  <div className="flex justify-end mt-1.5 mr-1">
                    <button type="button" onClick={() => toast.info('Funcionalidade em desenvolvimento')} className="text-[10px] text-blue-400/60 uppercase font-semibold cursor-pointer hover:text-blue-400 transition-colors">
                      Esqueceu a senha?
                    </button>
                  </div>
                )}
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                type="submit"
                disabled={loading || !email || password.length < 6 || (view === "signup" && !name.trim())}
                onClick={() => haptic(30)}
                className={`w-full rounded-[16px] bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-all shadow-[0_5px_20px_rgba(37,99,235,0.4)] mt-8 py-[15px] text-[15px] mb-4`}
              >
                {loading
                  ? <><Loader2 size={24} className="animate-spin" /> Conectando...</>
                  : view === "signin" ? "Acessar Conta" : "Criar Meu Cadastro"}
              </motion.button>
            </form>
          </div>
        </div>
      </div>
    </>
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
