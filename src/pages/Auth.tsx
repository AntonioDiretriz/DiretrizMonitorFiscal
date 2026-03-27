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
    <div className="min-h-screen flex">
      {/* Left panel - Brand */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#10143D] items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <svg viewBox="0 0 400 400" className="w-full h-full">
            <path d="M80 320 L80 128 C80 64 128 16 192 16 L304 16 C368 16 416 64 416 128 L416 272 C416 336 368 384 304 384 L192 384 C128 384 80 336 80 320 Z" fill="white"/>
            <rect x="40" y="120" width="340" height="45" rx="8" fill="#10143D"/>
            <rect x="40" y="240" width="340" height="45" rx="8" fill="#10143D"/>
          </svg>
        </div>
        <div className="relative z-10 text-center px-12">
          <img src="/logo-white.svg" alt="Diretriz" className="h-14 w-auto mx-auto mb-8" />
          <p className="text-white/70 text-lg font-light leading-relaxed">
            Sistema de Monitoramento Fiscal
          </p>
        </div>
      </div>

      {/* Right panel - Form */}
      <div className="flex-1 flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-0 shadow-none lg:shadow-none">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4 lg:hidden">
            <img src="/logo.svg" alt="Diretriz Monitor Fiscal" className="h-14 w-auto object-contain" />
          </div>
          <CardTitle className="text-2xl font-semibold">
            {isResetting ? "Recuperar Senha" : isLogin ? "Bem-vindo" : "Criar Conta"}
          </CardTitle>
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
    </div>
  );
}
