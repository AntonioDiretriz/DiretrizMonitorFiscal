import { useNavigate } from "react-router-dom";
import { addDays, format, startOfMonth, endOfMonth } from "date-fns";
import {
  CreditCard, AlertTriangle, CheckCircle, Clock,
  TrendingDown, ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useContasPagar } from "@/hooks/useContasPagar";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const NAVY  = "#10143D";
const RED   = "#ED3237";
const GREEN = "#22c55e";
const AMBER = "#f59e0b";

function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_COLOR: Record<string, string> = {
  pendente: AMBER, aprovado: NAVY, pago: GREEN, vencido: RED, cancelado: "#6b7280",
};
const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente", aprovado: "Aprovado", pago: "Pago", vencido: "Vencido", cancelado: "Cancelado",
};

export default function Financeiro() {
  const navigate = useNavigate();
  const { data: contas = [], isLoading } = useContasPagar();
  const today = new Date();
  const in7   = addDays(today, 7);
  const in30  = addDays(today, 30);

  // KPIs
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

      {/* KPIs */}
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
    </div>
  );
}
