import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, FileCheck, AlertTriangle, CheckCircle, Clock, XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, tipoLabels } from "@/components/StatusBadge";
import { NivelBadge } from "@/components/StatusBadge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

type Stats = {
  totalEmpresas: number;
  regular: number;
  vencendo: number;
  irregular: number;
  indisponivel: number;
};

export default function Index() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ totalEmpresas: 0, regular: 0, vencendo: 0, irregular: 0, indisponivel: 0 });
  const [alertas, setAlertas] = useState<any[]>([]);
  const [certByTipo, setCertByTipo] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const [empresasRes, certidoesRes, alertasRes] = await Promise.all([
      supabase.from("empresas").select("id").eq("user_id", user!.id),
      supabase.from("certidoes").select("*").eq("user_id", user!.id),
      supabase.from("alertas").select("*, empresas(razao_social)").eq("user_id", user!.id).eq("lida", false).order("created_at", { ascending: false }).limit(5),
    ]);

    const certs = certidoesRes.data || [];
    setStats({
      totalEmpresas: empresasRes.data?.length || 0,
      regular: certs.filter(c => c.status === "regular").length,
      vencendo: certs.filter(c => c.status === "vencendo").length,
      irregular: certs.filter(c => c.status === "irregular").length,
      indisponivel: certs.filter(c => c.status === "indisponivel").length,
    });

    setAlertas(alertasRes.data || []);

    const tipoCount: Record<string, Record<string, number>> = {};
    certs.forEach(c => {
      if (!tipoCount[c.tipo]) tipoCount[c.tipo] = { regular: 0, irregular: 0, vencendo: 0, indisponivel: 0 };
      tipoCount[c.tipo][c.status]++;
    });
    setCertByTipo(Object.entries(tipoCount).map(([tipo, counts]) => ({
      name: tipoLabels[tipo] || tipo,
      ...counts,
    })));
    setIsLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const totalCerts = stats.regular + stats.vencendo + stats.irregular + stats.indisponivel;
  const pctRegular = totalCerts > 0 ? Math.round((stats.regular / totalCerts) * 100) : 0;

  const pieData = [
    { name: "Regular", value: stats.regular, color: "hsl(142, 71%, 45%)" },
    { name: "Vencendo", value: stats.vencendo, color: "hsl(38, 92%, 50%)" },
    { name: "Irregular", value: stats.irregular, color: "hsl(0, 72%, 51%)" },
    { name: "Indisponível", value: stats.indisponivel, color: "hsl(220, 9%, 46%)" },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral do monitoramento de certidões</p>
      </div>

      {/* Summary Cards */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-4 w-3/4" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-16" /></CardContent>
            </Card>
          ))}
        </div>
      ) : null}
      {!isLoading && (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Empresas Monitoradas</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalEmpresas}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Certidões Regulares</CardTitle>
            <CheckCircle className="h-4 w-4" style={{ color: "hsl(142, 71%, 45%)" }} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.regular}</div>
            <p className="text-xs text-muted-foreground">{pctRegular}% do total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Próximas do Vencimento</CardTitle>
            <Clock className="h-4 w-4" style={{ color: "hsl(38, 92%, 50%)" }} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.vencendo}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Irregulares</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.irregular}</div>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Certidões por Tipo</CardTitle>
          </CardHeader>
          <CardContent>
            {certByTipo.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={certByTipo}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="regular" fill="hsl(142, 71%, 45%)" name="Regular" />
                  <Bar dataKey="vencendo" fill="hsl(38, 92%, 50%)" name="Vencendo" />
                  <Bar dataKey="irregular" fill="hsl(0, 72%, 51%)" name="Irregular" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
                Cadastre empresas e certidões para ver o gráfico
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribuição por Status</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
                Sem dados para exibir
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alertas Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {alertas.length > 0 ? (
            <div className="space-y-3">
              {alertas.map((alerta) => (
                <div key={alerta.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <AlertTriangle className={`h-4 w-4 mt-0.5 ${alerta.nivel === "critico" ? "text-destructive" : alerta.nivel === "aviso" ? "text-[hsl(38,92%,50%)]" : "text-primary"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{alerta.titulo}</span>
                      <NivelBadge nivel={alerta.nivel} />
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{alerta.mensagem}</p>
                    {alerta.empresas?.razao_social && (
                      <p className="text-xs text-muted-foreground mt-1">Empresa: {alerta.empresas.razao_social}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum alerta pendente. Tudo em ordem! ✅</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
