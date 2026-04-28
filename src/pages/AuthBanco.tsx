import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Phase = "loading" | "widget" | "syncing" | "success" | "error";

export default function AuthBanco() {
  const [params] = useSearchParams();
  const connectToken = params.get("token");
  const contaId      = params.get("conta");
  const userId       = params.get("user");

  const [phase,    setPhase]    = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [bancoNome, setBancoNome] = useState("");
  const phaseRef = useRef<Phase>("loading");

  const updatePhase = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  useEffect(() => {
    if (!connectToken || !contaId || !userId) {
      setErrorMsg("Link inválido ou incompleto. Solicite um novo link ao seu contador.");
      updatePhase("error");
      return;
    }
    initPluggy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initPluggy = async () => {
    updatePhase("loading");
    try {
      const { PluggyConnect } = await import("pluggy-connect-sdk");
      updatePhase("widget");

      const widget = new PluggyConnect({
        connectToken: connectToken!,
        includeSandbox: true,
        onSuccess: async ({ item }) => {
          updatePhase("syncing");
          const { data, error } = await supabase.functions.invoke("sync-pluggy", {
            body: { item_id: item.id, conta_bancaria_id: contaId, user_id: userId },
          });
          if (error || (data as any)?.error) {
            setErrorMsg((data as any)?.error ?? error?.message ?? "Erro ao sincronizar");
            updatePhase("error");
            return;
          }
          setBancoNome((data as any)?.banco ?? "");
          updatePhase("success");
        },
        onError: ({ message }) => {
          setErrorMsg(message ?? "Erro desconhecido na conexão.");
          updatePhase("error");
        },
        onClose: () => {
          if (phaseRef.current === "widget") {
            setErrorMsg("A janela foi fechada antes de concluir a autorização.");
            updatePhase("error");
          }
        },
      });

      await widget.init();
    } catch (e: any) {
      setErrorMsg(e.message ?? "Falha ao carregar o widget de conexão.");
      updatePhase("error");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center space-y-5">

        {/* Logo */}
        <div className="flex justify-center">
          <img
            src="/logo-diretriz.png"
            alt="Diretriz Contabilidade"
            className="h-10 object-contain"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>

        <h1 className="text-xl font-bold text-gray-900">Autorização Bancária</h1>
        <p className="text-sm text-muted-foreground">
          Seu contador solicitou acesso à sua conta bancária via Open Finance (Pluggy).
        </p>

        {phase === "loading" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Carregando widget de conexão...</p>
          </div>
        )}

        {phase === "widget" && (
          <div className="py-4 space-y-2">
            <p className="text-sm text-muted-foreground">
              Siga as instruções na janela de conexão para autorizar o acesso à sua conta bancária.
            </p>
            <p className="text-xs text-muted-foreground">
              Se a janela não aparecer, verifique se o bloqueador de pop-ups está desativado.
            </p>
          </div>
        )}

        {phase === "syncing" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Sincronizando transações, aguarde...</p>
          </div>
        )}

        {phase === "success" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <CheckCircle2 className="h-14 w-14 text-green-500" />
            <p className="text-lg font-semibold text-gray-900">Integração autorizada!</p>
            {bancoNome && <p className="text-sm text-muted-foreground">{bancoNome} conectado com sucesso.</p>}
            <p className="text-sm text-muted-foreground">
              Seu contador já pode acessar as informações da sua conta. Você pode fechar esta janela.
            </p>
          </div>
        )}

        {phase === "error" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <AlertCircle className="h-14 w-14 text-red-500" />
            <p className="text-base font-semibold text-gray-900">Não foi possível conectar</p>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            {connectToken && contaId && userId && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={initPluggy}>
                <RefreshCw className="h-3.5 w-3.5" />
                Tentar novamente
              </Button>
            )}
          </div>
        )}

        <p className="text-xs text-gray-400 pt-2 border-t">
          Diretriz Contabilidade · Conexão bancária segura via Open Finance
        </p>
      </div>
    </div>
  );
}
