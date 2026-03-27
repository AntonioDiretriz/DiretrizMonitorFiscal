import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { session } = useAuth();

  if (session) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isResetting) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        toast({
          title: "E-mail enviado!",
          description: "Verifique sua caixa de entrada para redefinir a senha.",
        });
        setIsResetting(false);
      } else if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast({
          title: "Conta criada!",
          description: "Verifique seu e-mail para confirmar o cadastro.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src="/logo.svg" alt="Diretriz Monitor Fiscal" className="h-16 w-auto object-contain" />
          </div>
          <CardTitle className="text-2xl">Diretriz Monitor Fiscal</CardTitle>
          <CardDescription>
            {isResetting
              ? "Digite seu e-mail para receber um link de recuperação"
              : isLogin
              ? "Entre na sua conta para monitorar certidões"
              : "Crie sua conta para começar a monitorar"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {!isResetting && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Senha</Label>
                  {isLogin && (
                    <button
                      type="button"
                      className="text-sm text-primary hover:underline"
                      onClick={() => setIsResetting(true)}
                    >
                      Esqueceu a senha?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? "Aguarde..."
                : isResetting
                ? "Enviar link de recuperação"
                : isLogin
                ? "Entrar"
                : "Criar conta"}
            </Button>
          </form>
          <div className="mt-4 text-center flex flex-col items-center gap-2">
            {!isResetting ? (
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={() => setIsLogin(!isLogin)}
              >
                {isLogin ? "Não tem conta? Cadastre-se" : "Já tem conta? Entre"}
              </button>
            ) : (
              <button
                type="button"
                className="text-sm text-muted-foreground hover:underline"
                onClick={() => setIsResetting(false)}
              >
                Voltar para o login
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
