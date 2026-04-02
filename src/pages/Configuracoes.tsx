import { useEffect, useState, useCallback } from "react";
import { useTheme } from "next-themes";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

export default function Configuracoes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [profile, setProfile] = useState({ nome_escritorio: "", responsavel: "" });
  const [loading, setLoading] = useState(false);
  const [senha, setSenha] = useState({ nova: "", confirmar: "" });
  const [loadingSenha, setLoadingSenha] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("profiles").select("*").eq("user_id", user.id).single();
    if (data) setProfile({ nome_escritorio: data.nome_escritorio || "", responsavel: data.responsavel || "" });
  }, [user]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const handleSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senha.nova.length < 6) {
      toast({ title: "Senha muito curta", description: "A senha deve ter pelo menos 6 caracteres.", variant: "destructive" });
      return;
    }
    if (senha.nova !== senha.confirmar) {
      toast({ title: "Senhas não coincidem", description: "A nova senha e a confirmação devem ser iguais.", variant: "destructive" });
      return;
    }
    setLoadingSenha(true);
    const { error } = await supabase.auth.updateUser({ password: senha.nova });
    setLoadingSenha(false);
    if (error) { toast({ title: "Erro ao alterar senha", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Senha alterada com sucesso!" });
    setSenha({ nova: "", confirmar: "" });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from("profiles").upsert({
      user_id: user!.id,
      nome_escritorio: profile.nome_escritorio.trim() || null,
      responsavel: profile.responsavel.trim() || null,
    }, { onConflict: "user_id" });
    setLoading(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Perfil atualizado!" });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground">Gerencie seu perfil e preferências</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Perfil do Escritório</CardTitle>
          <CardDescription>Informações do seu escritório contábil</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input value={user?.email || ""} disabled />
            </div>
            <div className="space-y-2">
              <Label>Nome do Escritório</Label>
              <Input
                placeholder="Ex: Contabilidade Silva & Associados"
                value={profile.nome_escritorio}
                onChange={(e) => setProfile({ ...profile, nome_escritorio: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Responsável</Label>
              <Input
                placeholder="Nome do responsável"
                value={profile.responsavel}
                onChange={(e) => setProfile({ ...profile, responsavel: e.target.value })}
              />
            </div>
            <Button type="submit" disabled={loading}>{loading ? "Salvando..." : "Salvar"}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alterar Senha</CardTitle>
          <CardDescription>Defina uma nova senha para sua conta</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSenha} className="space-y-4">
            <div className="space-y-2">
              <Label>Nova Senha</Label>
              <Input
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={senha.nova}
                onChange={e => setSenha({ ...senha, nova: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Confirmar Nova Senha</Label>
              <Input
                type="password"
                placeholder="Repita a nova senha"
                value={senha.confirmar}
                onChange={e => setSenha({ ...senha, confirmar: e.target.value })}
              />
            </div>
            <Button type="submit" disabled={loadingSenha}>
              {loadingSenha ? "Alterando..." : "Alterar Senha"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aparência</CardTitle>
          <CardDescription>Escolha o tema da interface</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Tema</Label>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">Sistema (automático)</SelectItem>
                <SelectItem value="light">Claro</SelectItem>
                <SelectItem value="dark">Escuro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conta</CardTitle>
          <CardDescription>Informações da sua conta</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Logado como <strong>{user?.email}</strong>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
