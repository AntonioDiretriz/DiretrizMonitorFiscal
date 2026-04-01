import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, CheckCircle, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { NivelBadge } from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";

export default function Alertas() {
  const { user, ownerUserId } = useAuth();
  const { toast } = useToast();
  const [alertas, setAlertas] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState("pendentes");

  const loadAlertas = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const { data } = await supabase
      .from("alertas")
      .select("*, empresas(razao_social)")
      .eq("user_id", ownerUserId!)
      .order("created_at", { ascending: false });
    setAlertas(data || []);
    setIsLoading(false);
  }, [user]);

  useEffect(() => { loadAlertas(); }, [loadAlertas]);

  const markRead = async (id: string) => {
    await supabase.from("alertas").update({ lida: true }).eq("id", id);
    await loadAlertas();
  };

  const markResolved = async (id: string) => {
    await supabase.from("alertas").update({ resolvida: true, lida: true }).eq("id", id);
    toast({ title: "Alerta resolvido!" });
    await loadAlertas();
  };

  const pendentes = alertas.filter(a => !a.resolvida && !a.lida);
  const criticos = alertas.filter(a => a.nivel === "critico" && !a.resolvida);
  const resolvidos = alertas.filter(a => a.resolvida);

  const current = tab === "pendentes" ? pendentes : tab === "criticos" ? criticos : resolvidos;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Central de Alertas</h1>
        <p className="text-muted-foreground">Gerencie notificações e pendências</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Não Lidos</CardTitle>
            <Bell className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{pendentes.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Críticos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive">{criticos.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Resolvidos</CardTitle>
            <CheckCircle className="h-4 w-4" style={{ color: "hsl(142, 71%, 45%)" }} />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{resolvidos.length}</div></CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pendentes">Pendentes ({pendentes.length})</TabsTrigger>
          <TabsTrigger value="criticos">Críticos ({criticos.length})</TabsTrigger>
          <TabsTrigger value="resolvidos">Resolvidos ({resolvidos.length})</TabsTrigger>
        </TabsList>
        <TabsContent value={tab}>
          <Card>
            <CardContent className="pt-6">
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-3 p-4 rounded-lg border bg-card">
                      <Skeleton className="h-5 w-5 mt-0.5 rounded-full shrink-0" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-1/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : current.length > 0 ? (
                <div className="space-y-3">
                  {current.map((alerta) => (
                    <div key={alerta.id} className={`flex items-start gap-3 p-4 rounded-lg border ${!alerta.lida ? "bg-primary/5 border-primary/20" : "bg-card"}`}>
                      <AlertTriangle className={`h-5 w-5 mt-0.5 shrink-0 ${alerta.nivel === "critico" ? "text-destructive" : alerta.nivel === "aviso" ? "text-[hsl(38,92%,50%)]" : "text-primary"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{alerta.titulo}</span>
                          <NivelBadge nivel={alerta.nivel} />
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{alerta.mensagem}</p>
                        {alerta.acao_recomendada && (
                          <p className="text-sm text-primary mt-2">💡 {alerta.acao_recomendada}</p>
                        )}
                        <div className="flex items-center gap-4 mt-3">
                          {alerta.empresas?.razao_social && (
                            <span className="text-xs text-muted-foreground">📋 {alerta.empresas.razao_social}</span>
                          )}
                          <span className="text-xs text-muted-foreground">{format(parseISO(alerta.created_at), "dd/MM/yyyy HH:mm")}</span>
                        </div>
                      </div>
                      {!alerta.resolvida && (
                        <div className="flex gap-2 shrink-0">
                          {!alerta.lida && (
                            <Button variant="outline" size="sm" onClick={() => markRead(alerta.id)}>Marcar lida</Button>
                          )}
                          <Button size="sm" onClick={() => markResolved(alerta.id)}>Resolver</Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="mx-auto h-8 w-8 mb-2 opacity-40" />
                  {tab === "resolvidos" ? "Nenhum alerta resolvido" : "Nenhum alerta pendente. Tudo em ordem! ✅"}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
