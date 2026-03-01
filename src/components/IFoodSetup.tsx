import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Key, ExternalLink, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface IFoodSetupProps {
  onAuthenticated: () => void;
}

export function IFoodSetup({ onAuthenticated }: IFoodSetupProps) {
  const [step, setStep] = useState<'idle' | 'getting_code' | 'waiting_auth' | 'exchanging'>('idle');
  const [userCode, setUserCode] = useState('');
  const [verificationUrl, setVerificationUrl] = useState('');
  const [authCodeVerifier, setAuthCodeVerifier] = useState('');
  const [error, setError] = useState('');

  const startAuth = async () => {
    setStep('getting_code');
    setError('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('ifood-auth', {
        body: { action: 'get_user_code' },
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      setUserCode(data.userCode);
      setVerificationUrl(data.verificationUrl || data.verificationUrlComplete);
      setAuthCodeVerifier(data.authorizationCodeVerifier);
      setStep('waiting_auth');

      toast.info("Copie o código e autorize no iFood", {
        description: "Após autorizar, clique em 'Já Autorizei'",
        duration: 10000,
      });
    } catch (err: any) {
      setError(err?.message || 'Erro ao obter código');
      setStep('idle');
    }
  };

  const exchangeToken = async () => {
    setStep('exchanging');
    setError('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('ifood-auth', {
        body: {
          action: 'exchange_code',
          authorizationCode: userCode,
          authorizationCodeVerifier: authCodeVerifier,
        },
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      toast.success("Autenticação iFood concluída!");
      onAuthenticated();
    } catch (err: any) {
      setError(err?.message || 'Erro ao trocar token');
      setStep('waiting_auth');
    }
  };

  return (
    <div className="glass-card rounded-lg p-6 space-y-4 max-w-md mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-warning/15 flex items-center justify-center">
          <Key size={20} className="text-warning" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">Configurar iFood</h2>
          <p className="text-xs text-muted-foreground">Autentique sua loja para receber pedidos</p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
          <AlertCircle size={16} className="text-destructive mt-0.5" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {step === 'idle' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Clique abaixo para iniciar a autenticação com a API do iFood. 
            Você será direcionado para autorizar o acesso aos pedidos da sua loja.
          </p>
          <button
            onClick={startAuth}
            className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all glow-primary"
          >
            Iniciar Autenticação
          </button>
        </div>
      )}

      {step === 'getting_code' && (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={24} className="text-primary animate-spin" />
          <span className="ml-2 text-sm text-muted-foreground">Obtendo código...</span>
        </div>
      )}

      {step === 'waiting_auth' && (
        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Seu código de autorização:</label>
            <div className="bg-secondary rounded-lg p-4 text-center">
              <span className="text-2xl font-mono font-bold text-primary tracking-wider">{userCode}</span>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              1. Copie o código acima<br />
              2. Acesse o link abaixo e cole o código<br />
              3. Autorize o acesso à sua loja<br />
              4. Volte aqui e clique em "Já Autorizei"
            </p>
            {verificationUrl && (
              <a
                href={verificationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-secondary text-secondary-foreground font-medium text-sm hover:bg-secondary/80 border border-border transition-all"
              >
                <ExternalLink size={14} />
                Abrir página de autorização iFood
              </a>
            )}
          </div>

          <button
            onClick={exchangeToken}
            className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all"
          >
            <CheckCircle size={16} className="inline mr-2" />
            Já Autorizei
          </button>
        </div>
      )}

      {step === 'exchanging' && (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={24} className="text-primary animate-spin" />
          <span className="ml-2 text-sm text-muted-foreground">Finalizando autenticação...</span>
        </div>
      )}
    </div>
  );
}
