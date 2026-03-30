import { useMemo } from "react";
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Clock, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useRotinas, type Rotina } from "@/hooks/useRotinas";
import { StatusBadge } from "@/pages/RotinaDetalhe";

// ── Palette ───────────────────────────────────────────────────────────────────
const NAVY  = "#10143D";
const RED   = "#ED3237";
const GREEN = "#22c55e";
const AMBER = "#f59e0b";
const BLUE  = "#3b82f6";
const GRAY  = "#6b7280";

// ── Helpers ───────────────────────────────────────────────────────────────────
function pct(num: number, den: number) {
  if (den === 0) return 0;
  return Math.round((num / den) * 100);
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DashboardRotinas() {
  const { data: rotinas = [], isLoading } = useRotinas();
  const hoje = new Date();

  // ── Últimos 6 meses para o gráfico ──
  const meses = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const ref = subMonths(hoje, 5 - i);
      return {
        key:   format(ref, "yyyy-MM"),
        label: format(ref, "MMM/yy", { locale: ptBR }),
        start: startOfMonth(ref),
        end:   endOfMonth(ref),
      };
    });
  }, []);

  const evolucao = useMemo(() => {
    return meses.map(m => {
      const rotinasMes = rotinas.filter(r => {
        const v = parseISO(r.data_vencimento);
        return v >= m.start && v <= m.end;
      });
      const concluidas = rotinasMes.filter(r => r.status === "concluida").length;
      const atrasadas  = rotinasMes.filter(r => {
        const v = parseISO(r.data_vencimento);
        return v < hoje && !["concluida", "nao_aplicavel"].includes(r.status);
      }).length;
      return { label: m.label, "No Prazo": concluidas, "Atrasadas": atrasadas };
    });
  }, [rotinas, meses]);

  // ── Mês atual ──
  const mesStart = startOfMonth(hoje);
  const mesEnd   = endOfMonth(hoje);
  const rotinasMes = useMemo(() =>
    rotinas.filter(r => {
      const v = parseISO(r.data_vencimento);
      return v >= mesStart && v <= mesEnd;
    }),
    [rotinas]
  );

  const totalMes     = rotinasMes.length;
  const concluidasMes = rotinasMes.filter(r => r.status === "concluida").length;
  const atrasadasMes  = rotinasMes.filter(r => {
    const v = parseISO(r.data_vencimento);
    return v < hoje && !["concluida", "nao_aplicavel"].includes(r.status);
  }).length;
  const pendentesHoje = rotinasMes.filter(r => !["concluida", "nao_aplicavel"].includes(r.status)).length;
  const taxaPrazo = pct(concluidasMes, totalMes);
  const taxaAtraso = pct(atrasadasMes, totalMes);

  // ── Próximas 10 tarefas a vencer ──
  const proximas = useMemo(() => {
    return rotinas
      .filter(r => {
        const v = parseISO(r.data_vencimento);
        return v >= hoje && !["concluida", "nao_aplicavel"].includes(r.status);
      })
      .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))
      .slice(0, 10);
  }, [rotinas]);

  // ── Ranking por empresa (mais atrasadas) ──
  const rankingEmpresas = useMemo(() => {
    const map: Record<string, { nome: string; total: number; atrasadas: number }> = {};
    rotinas.forEach(r => {
      const key = r.empresa_id ?? "sem_empresa";
      const nome = r.empresas?.razao_social ?? "Sem empresa";
      if (!map[key]) map[key] = { nome, total: 0, atrasadas: 0 };
      map[key].total++;
      const v = parseISO(r.data_vencimento);
      if (v < hoje && !["concluida", "nao_aplicavel"].includes(r.status)) {
        map[key].atrasadas++;
      }
    });
    return Object.values(map)
      .filter(e => e.atrasadas > 0)
      .sort((a, b) => b.atrasadas - a.atrasadas)
      .slice(0, 8);
  }, [rotinas]);

  // ── Risco estimado em R$ ──
  const riscoTotal = useMemo(() =>
    rotinas
      .filter(r => {
        const v = parseISO(r.data_vencimento);
        return v < hoje && !["concluida", "nao_aplicavel"].includes(r.status) && r.valor;
      })
      .reduce((acc, r) => acc + (r.valor ?? 0), 0),
    [rotinas]
  );

  const kpiCards = [
    {
      label: "% No Prazo (mês)",
      value: `${taxaPrazo}%`,
      sub: `${concluidasMes}/${totalMes} concluídas`,
      icon: CheckCircle,
      color: GREEN,
    },
    {
      label: "% Atrasadas (mês)",
      value: `${taxaAtraso}%`,
      sub: `${atrasadasMes} em atraso`,
      icon: AlertTriangle,
      color: atrasadasMes > 0 ? RED : GRAY,
    },
    {
      label: "Pendentes",
      value: pendentesHoje,
      sub: "tarefas abertas no mês",
      icon: Clock,
      color: AMBER,
    },
    {
      label: "Risco Estimado",
      value: riscoTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }),
      sub: "valor total atrasado",
      icon: TrendingDown,
      color: riscoTotal > 0 ? RED : GRAY,
    },
  ];

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Dashboard — Rotinas</h1>
        <p className="text-sm text-muted-foreground capitalize">
          {format(hoje, "MMMM yyyy", { locale: ptBR })}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiCards.map(k => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
                  <p className="text-2xl font-bold" style={{ color: k.color }}>{k.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{k.sub}</p>
                </div>
                <div className="rounded-lg p-2" style={{ backgroundColor: k.color + "15" }}>
                  <k.icon className="h-5 w-5" style={{ color: k.color }} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Evolução mensal */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base" style={{ color: NAVY }}>Evolução — Últimos 6 Meses</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={evolucao} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="No Prazo"  fill={GREEN} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Atrasadas" fill={RED}   radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Ranking empresas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base" style={{ color: NAVY }}>Ranking — Empresas com Mais Atrasos</CardTitle>
          </CardHeader>
          <CardContent>
            {rankingEmpresas.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                <CheckCircle className="h-8 w-8 text-green-400" />
                <p className="text-sm">Nenhuma empresa com atrasos!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {rankingEmpresas.map((e, i) => {
                  const pctAtraso = pct(e.atrasadas, e.total);
                  return (
                    <div key={e.nome} className="flex items-center gap-3">
                      <span className="text-xs font-bold w-5 text-muted-foreground text-right">{i + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium truncate">{e.nome}</span>
                          <span className="text-xs text-red-600 font-semibold ml-2 shrink-0">{e.atrasadas} atras.</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pctAtraso}%`, backgroundColor: RED }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Próximas 10 tarefas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base" style={{ color: NAVY }}>Próximas Tarefas a Vencer</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {proximas.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 text-muted-foreground gap-1">
              <CheckCircle className="h-6 w-6 text-green-400" />
              <p className="text-sm">Nenhuma tarefa pendente!</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarefa</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proximas.map(r => {
                  const v = parseISO(r.data_vencimento);
                  const dias = Math.ceil((v.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
                  const emRisco = dias <= 3;

                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <span className="line-clamp-1">{r.titulo}</span>
                        <Badge variant="outline" className="text-[10px] mt-0.5 uppercase">{r.tipo}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <span className="line-clamp-1">{r.empresas?.razao_social ?? "—"}</span>
                      </TableCell>
                      <TableCell>
                        <span className={`text-sm font-medium ${emRisco ? "text-amber-600" : ""}`}>
                          {format(v, "dd/MM/yyyy")}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {dias === 0 ? "Hoje" : `em ${dias}d`}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.responsavel?.nome.split(" ")[0] ?? "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {r.valor
                          ? r.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
