import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { addDays, format, subMonths } from "date-fns";
import {
  CreditCard, AlertTriangle, CheckCircle, Clock,
  TrendingDown, ArrowRight, TrendingUp, Minus, Building2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useContasPagar } from "@/hooks/useContasPagar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from "recharts";

const NAVY  = "#10143D";
const RED   = "#ED3237";
const GREEN = "#22c55e";
const AMBER = "#f59e0b";
const BLUE  = "#3b82f6";

function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Interfaces ────────────────────────────────────────────────────────────────
interface Empresa { id: string; razao_social: string; }
interface ContaBancaria { id: string; empresa_id: string | null; }
interface PlanoContas { id: string; nome: string; tipo: string; codigo: string | null; }
interface Transacao {
  id: string;
  conta_bancaria_id: string;
  data: string;
  valor: number;
  tipo: string; // debito | credito
  status: string;
  plano_contas_id: string | null;
}

// ── DRE Section ───────────────────────────────────────────────────────────────
function DreDashboard() {
  const { ownerUserId } = useAuth();
  const [empresas, setEmpresas]   = useState<Empresa[]>([]);
  const [contas,   setContas]     = useState<ContaBancaria[]>([]);
  const [planos,   setPlanos]     = useState<PlanoContas[]>([]);
  const [txs,      setTxs]        = useState<Transacao[]>([]);
  const [loading,  setLoading]    = useState(true);

  const today = new Date();
  const [filtroEmpresa, setFiltroEmpresa] = useState("all");
  const [filtroMes,     setFiltroMes]     = useState(format(today, "yyyy-MM"));

  // Últimos 12 meses para o select
  const meses = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const d = subMonths(today, i);
      return { value: format(d, "yyyy-MM"), label: format(d, "MM/yyyy") };
    });
  }, []);

  useEffect(() => {
    if (!ownerUserId) return;
    (async () => {
      setLoading(true);
      const [empRes, contaRes, planoRes, txRes] = await Promise.all([
        supabase.from("empresas").select("id, razao_social").eq("user_id", ownerUserId).order("razao_social"),
        supabase.from("contas_bancarias").select("id, empresa_id").eq("user_id", ownerUserId),
        supabase.from("plano_contas").select("id, nome, tipo, codigo").eq("user_id", ownerUserId).order("codigo"),
        supabase.from("transacoes_bancarias")
          .select("id, conta_bancaria_id, data, valor, tipo, status, plano_contas_id")
          .eq("user_id", ownerUserId)
          .eq("status", "conciliado")
          .order("data", { ascending: false })
          .limit(5000),
      ]);
      setEmpresas(empRes.data ?? []);
      setContas(contaRes.data ?? []);
      setPlanos(planoRes.data ?? []);
      setTxs(txRes.data ?? []);
      setLoading(false);
    })();
  }, [ownerUserId]);

  // Filtra transações pelo mês e empresa selecionados
  const txFiltradas = useMemo(() => {
    const contaIds = filtroEmpresa === "all"
      ? new Set(contas.map(c => c.id))
      : new Set(contas.filter(c => c.empresa_id === filtroEmpresa).map(c => c.id));

    return txs.filter(t => {
      const mesStr = t.data.slice(0, 7); // yyyy-MM
      return mesStr === filtroMes && contaIds.has(t.conta_bancaria_id);
    });
  }, [txs, contas, filtroEmpresa, filtroMes]);

  const planoById = useMemo(() => {
    const m: Record<string, PlanoContas> = {};
    planos.forEach(p => { m[p.id] = p; });
    return m;
  }, [planos]);

  // Totais
  const totalReceitas = txFiltradas
    .filter(t => t.tipo === "credito")
    .reduce((s, t) => s + Number(t.valor), 0);

  const totalDespesas = txFiltradas
    .filter(t => t.tipo === "debito")
    .reduce((s, t) => s + Number(t.valor), 0);

  const resultado = totalReceitas - totalDespesas;

  // Agrupamento por conta contábil (plano de contas)
  const gruposPorConta = useMemo(() => {
    const map: Record<string, { plano: PlanoContas; receita: number; despesa: number }> = {};
    txFiltradas.forEach(t => {
      if (!t.plano_contas_id) return;
      const p = planoById[t.plano_contas_id];
      if (!p) return;
      if (!map[p.id]) map[p.id] = { plano: p, receita: 0, despesa: 0 };
      if (t.tipo === "credito") map[p.id].receita += Number(t.valor);
      else                      map[p.id].despesa += Number(t.valor);
    });
    return Object.values(map).sort((a, b) => (b.receita + b.despesa) - (a.receita + a.despesa));
  }, [txFiltradas, planoById]);

  // Dados para gráfico de barras (top 10 por valor)
  const barData = gruposPorConta.slice(0, 10).map(g => ({
    nome: g.plano.codigo ? `${g.plano.codigo} - ${g.plano.nome}` : g.plano.nome,
    nomeShort: g.plano.codigo ?? g.plano.nome.slice(0, 12),
    receita: g.receita,
    despesa: g.despesa,
  }));

  // Dados pie: distribuição de despesas por conta
  const COLORS = [NAVY, RED, AMBER, BLUE, GREEN, "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#84cc16"];
  const pieData = gruposPorConta
    .filter(g => g.despesa > 0)
    .slice(0, 8)
    .map((g, i) => ({
      name: g.plano.codigo ? `${g.plano.codigo}` : g.plano.nome.slice(0, 15),
      value: g.despesa,
      color: COLORS[i % COLORS.length],
    }));

  const semDados = txFiltradas.length === 0;

  return (
    <div className="space-y-6">
      {/* Header filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <Select value={filtroEmpresa} onValueChange={setFiltroEmpresa}>
            <SelectTrigger className="w-48 h-8 text-sm">
              <SelectValue placeholder="Empresa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as empresas</SelectItem>
              {empresas.map(e => (
                <SelectItem key={e.id} value={e.id}>{e.razao_social}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Select value={filtroMes} onValueChange={setFiltroMes}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            {meses.map(m => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {loading && <span className="text-xs text-muted-foreground">Carregando...</span>}
      </div>

      {/* KPIs DRE */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-0 shadow-sm" style={{ backgroundColor: "#f0fdf4" }}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Receitas</CardTitle>
            <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: GREEN + "20" }}>
              <TrendingUp className="h-4 w-4" style={{ color: GREEN }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: GREEN }}>{formatCurrency(totalReceitas)}</div>
            <p className="text-xs text-muted-foreground mt-1">Créditos conciliados</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm" style={{ backgroundColor: "#fff1f1" }}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Despesas</CardTitle>
            <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: RED + "20" }}>
              <TrendingDown className="h-4 w-4" style={{ color: RED }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: RED }}>{formatCurrency(totalDespesas)}</div>
            <p className="text-xs text-muted-foreground mt-1">Débitos conciliados</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm" style={{ backgroundColor: resultado >= 0 ? "#f0fdf4" : "#fff1f1" }}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Resultado</CardTitle>
            <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: (resultado >= 0 ? GREEN : RED) + "20" }}>
              <Minus className="h-4 w-4" style={{ color: resultado >= 0 ? GREEN : RED }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: resultado >= 0 ? GREEN : RED }}>{formatCurrency(resultado)}</div>
            <p className="text-xs text-muted-foreground mt-1">Receitas − Despesas</p>
          </CardContent>
        </Card>
      </div>

      {semDados ? (
        <Card className="shadow-sm">
          <CardContent className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            Nenhuma transação conciliada encontrada para {filtroMes.slice(5, 7)}/{filtroMes.slice(0, 4)}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Barras: receitas x despesas por conta */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Receitas × Despesas por Conta Contábil</CardTitle>
            </CardHeader>
            <CardContent>
              {barData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={barData} margin={{ left: -10, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="nomeShort"
                      tick={{ fontSize: 10 }}
                      angle={-35}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="receita" fill={GREEN} radius={[4, 4, 0, 0]} name="Receita" />
                    <Bar dataKey="despesa" fill={RED}   radius={[4, 4, 0, 0]} name="Despesa" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                  Sem dados categorizados
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pie: distribuição das despesas */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Distribuição das Despesas</CardTitle>
            </CardHeader>
            <CardContent>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="45%"
                      outerRadius={75}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                      fontSize={10}
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                  Nenhuma despesa categorizada
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabela DRE por conta contábil */}
      {!semDados && gruposPorConta.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">DRE por Conta Contábil</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Cód.</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Conta</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Receita</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Despesa</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {gruposPorConta.map(g => {
                  const saldo = g.receita - g.despesa;
                  return (
                    <tr key={g.plano.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2 text-muted-foreground font-mono text-xs">{g.plano.codigo ?? "—"}</td>
                      <td className="px-4 py-2 font-medium">{g.plano.nome}</td>
                      <td className="px-4 py-2 text-right" style={{ color: g.receita > 0 ? GREEN : undefined }}>
                        {g.receita > 0 ? formatCurrency(g.receita) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right" style={{ color: g.despesa > 0 ? RED : undefined }}>
                        {g.despesa > 0 ? formatCurrency(g.despesa) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold" style={{ color: saldo >= 0 ? GREEN : RED }}>
                        {formatCurrency(saldo)}
                      </td>
                    </tr>
                  );
                })}
                {/* Totais */}
                <tr className="bg-muted/40 font-semibold">
                  <td className="px-4 py-2" colSpan={2}>Total</td>
                  <td className="px-4 py-2 text-right" style={{ color: GREEN }}>{formatCurrency(totalReceitas)}</td>
                  <td className="px-4 py-2 text-right" style={{ color: RED }}>{formatCurrency(totalDespesas)}</td>
                  <td className="px-4 py-2 text-right" style={{ color: resultado >= 0 ? GREEN : RED }}>{formatCurrency(resultado)}</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Financeiro() {
  const navigate = useNavigate();
  const { data: contas = [], isLoading } = useContasPagar();
  const today = new Date();
  const in7   = addDays(today, 7);
  const in30  = addDays(today, 30);

  // KPIs contas a pagar
  const totalPendente = contas.filter(c => ["pendente","aprovado"].includes(c.status)).reduce((s, c) => s + Number(c.valor), 0);
  const vencendo7d    = contas.filter(c => ["pendente","aprovado"].includes(c.status) && new Date(c.data_vencimento + "T12:00:00") <= in7 && new Date(c.data_vencimento + "T12:00:00") >= today);
  const vencidas      = contas.filter(c => c.status === "vencido");
  const pagoMes       = contas.filter(c => c.status === "pago" && c.data_pagamento?.startsWith(format(today, "yyyy-MM"))).reduce((s, c) => s + Number(c.valor), 0);

  // Próximas a vencer (até 30 dias)
  const proximas = contas
    .filter(c => ["pendente","aprovado"].includes(c.status) && new Date(c.data_vencimento + "T12:00:00") <= in30)
    .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))
    .slice(0, 8);

  // Gráfico: fluxo por semana (próximos 30 dias)
  const semanas: { semana: string; valor: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const inicio = addDays(today, i * 7);
    const fim    = addDays(today, i * 7 + 6);
    const valor  = contas
      .filter(c => {
        const d = new Date(c.data_vencimento + "T12:00:00");
        return ["pendente","aprovado"].includes(c.status) && d >= inicio && d <= fim;
      })
      .reduce((s, c) => s + Number(c.valor), 0);
    semanas.push({ semana: `Sem ${i + 1}`, valor });
  }

  const kpis = [
    { label: "Total a Pagar",       value: formatCurrency(totalPendente), icon: CreditCard,    color: NAVY,  bg: "#f0f1f8", to: "/contas-pagar?filtro=pendente" },
    { label: "Vencendo em 7 dias",  value: String(vencendo7d.length),     icon: Clock,         color: AMBER, bg: "#fffbeb", to: "/contas-pagar?filtro=vencendo" },
    { label: "Vencidas",            value: String(vencidas.length),       icon: AlertTriangle, color: RED,   bg: "#fff1f1", to: "/contas-pagar?filtro=vencidas" },
    { label: "Pago no mês",         value: formatCurrency(pagoMes),       icon: CheckCircle,   color: GREEN, bg: "#f0fdf4", to: null },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financeiro</h1>
          <p className="text-muted-foreground">Visão geral das suas finanças</p>
        </div>
        <Button onClick={() => navigate("/contas-pagar")}>
          <CreditCard className="mr-2 h-4 w-4" /> Contas a Pagar
        </Button>
      </div>

      {/* KPIs Contas a Pagar */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ label, value, icon: Icon, color, bg, to }) => (
          <Card
            key={label}
            className={`border-0 shadow-sm ${to ? "cursor-pointer hover:scale-[1.02] hover:shadow-md transition-transform" : ""}`}
            style={{ backgroundColor: bg }}
            onClick={() => to && navigate(to)}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + "20" }}>
                <Icon className="h-4 w-4" style={{ color }} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" style={{ color }}>{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Fluxo previsto */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4" style={{ color: RED }} />
              <CardTitle className="text-sm font-semibold">Saídas Previstas (próximas 4 semanas)</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {semanas.some(s => s.valor > 0) ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={semanas} margin={{ left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="semana" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="valor" fill={AMBER} radius={[4,4,0,0]} name="A pagar" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                Nenhuma conta prevista para as próximas 4 semanas
              </div>
            )}
          </CardContent>
        </Card>

        {/* Próximas a vencer */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" style={{ color: AMBER }} />
                <CardTitle className="text-sm font-semibold">Próximas a Vencer (30 dias)</CardTitle>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate("/contas-pagar")} className="text-xs gap-1">
                Ver todas <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : proximas.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Nenhuma conta vencendo nos próximos 30 dias
              </div>
            ) : (
              <div className="space-y-2">
                {proximas.map(c => {
                  const dias = Math.ceil((new Date(c.data_vencimento + "T12:00:00").getTime() - today.getTime()) / 86400000);
                  return (
                    <div key={c.id} className="flex items-center justify-between p-2 rounded-lg border bg-muted/20">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.fornecedor}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(c.data_vencimento + "T12:00:00"), "dd/MM/yyyy")}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-2 shrink-0">
                        <span className="text-sm font-semibold">{formatCurrency(Number(c.valor))}</span>
                        <Badge style={{ backgroundColor: (dias <= 7 ? RED : AMBER) + "20", color: dias <= 7 ? RED : AMBER, fontSize: "10px" }}>
                          {dias <= 0 ? "Hoje" : `${dias}d`}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── DRE por Conciliação ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="h-1 w-6 rounded" style={{ backgroundColor: NAVY }} />
          <h2 className="text-lg font-semibold">DRE — Transações Conciliadas</h2>
        </div>
        <DreDashboard />
      </div>
    </div>
  );
}
