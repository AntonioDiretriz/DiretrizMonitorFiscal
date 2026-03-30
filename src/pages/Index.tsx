import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NivelBadge } from "@/components/StatusBadge";
import { tipoLabels } from "@/components/StatusBadge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, Label,
} from "recharts";
import {
  Building2, FileCheck, KeyRound, MailOpen,
  AlertTriangle, CheckCircle, LayoutDashboard,
  Phone, Mail, FileText, MapPin,
} from "lucide-react";
import { differenceInDays, addDays, format } from "date-fns";

// ── Brand / palette ────────────────────────────────────────────────────────────
const NAVY   = "#10143D";
const RED    = "#ED3237";
const GREEN  = "#22c55e";
const AMBER  = "#f59e0b";
const GRAY   = "#9ca3af";
const BLUE   = "#3b82f6";
const VIOLET = "#8b5cf6";

const GEO_PALETTE = [
  NAVY, RED, BLUE, GREEN, AMBER, VIOLET,
  "#0ea5e9", "#f97316", "#14b8a6", "#e879f9",
  "#84cc16", "#06b6d4", "#a78bfa", "#fb923c",
  "#4ade80", "#60a5fa", "#f472b6", "#facc15",
  "#34d399", "#a3e635",
];

// ── Module filter config ───────────────────────────────────────────────────────
type ModuleId = "todos" | "certidoes" | "certificados" | "caixas";

const MODULES: { id: ModuleId; label: string; icon: any; color: string }[] = [
  { id: "todos",        label: "Todos",                 icon: LayoutDashboard, color: NAVY   },
  { id: "certidoes",    label: "Certidões",             icon: FileCheck,       color: NAVY   },
  { id: "certificados", label: "Certificados Digitais", icon: KeyRound,        color: BLUE   },
  { id: "caixas",       label: "Caixas Postais",        icon: MailOpen,        color: "#0ea5e9" },
];

// ── DDD → UF lookup ───────────────────────────────────────────────────────────
const DDD_TO_UF: Record<string, string> = {
  "11": "SP", "12": "SP", "13": "SP", "14": "SP", "15": "SP",
  "16": "SP", "17": "SP", "18": "SP", "19": "SP",
  "21": "RJ", "22": "RJ", "24": "RJ",
  "27": "ES", "28": "ES",
  "31": "MG", "32": "MG", "33": "MG", "34": "MG", "35": "MG", "37": "MG", "38": "MG",
  "41": "PR", "42": "PR", "43": "PR", "44": "PR", "45": "PR", "46": "PR",
  "47": "SC", "48": "SC", "49": "SC",
  "51": "RS", "53": "RS", "54": "RS", "55": "RS",
  "61": "DF",
  "62": "GO", "64": "GO",
  "63": "TO",
  "65": "MT", "66": "MT",
  "67": "MS",
  "68": "AC",
  "69": "RO",
  "71": "BA", "73": "BA", "74": "BA", "75": "BA", "77": "BA",
  "79": "SE",
  "81": "PE", "87": "PE",
  "82": "AL",
  "83": "PB",
  "84": "RN",
  "85": "CE", "88": "CE",
  "86": "PI", "89": "PI",
  "91": "PA", "93": "PA", "94": "PA",
  "92": "AM", "97": "AM",
  "95": "RR",
  "96": "AP",
  "98": "MA", "99": "MA",
};

const UF_NAMES: Record<string, string> = {
  SP: "São Paulo", RJ: "Rio de Janeiro", MG: "Minas Gerais", ES: "Espírito Santo",
  PR: "Paraná", SC: "Santa Catarina", RS: "Rio Grande do Sul",
  BA: "Bahia", SE: "Sergipe", AL: "Alagoas", PE: "Pernambuco", PB: "Paraíba",
  RN: "Rio Grande do Norte", CE: "Ceará", PI: "Piauí", MA: "Maranhão",
  PA: "Pará", AM: "Amazonas", RR: "Roraima", AP: "Amapá", AC: "Acre", RO: "Rondônia",
  DF: "Distrito Federal", GO: "Goiás", TO: "Tocantins", MT: "Mato Grosso", MS: "Mato Grosso do Sul",
};

function extractDdd(telefone: string | null): string | null {
  if (!telefone) return null;
  const digits = telefone.replace(/\D/g, "");
  const ddd = digits.slice(0, 2);
  return ddd.length === 2 ? ddd : null;
}

const toDate = (s: string) => new Date(s + "T12:00:00");

// ── Custom tooltip ────────────────────────────────────────────────────────────
const StyledTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border shadow-lg rounded-lg p-3 text-sm">
      {label && <p className="font-semibold text-foreground mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
};

// ── Section header helper ─────────────────────────────────────────────────────
function SectionHeading({ icon: Icon, title, color, badge }: { icon: any; title: string; color: string; badge?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-1 h-6 rounded-full" style={{ backgroundColor: color }} />
      <Icon className="h-4 w-4" style={{ color }} />
      <h2 className="font-semibold" style={{ color }}>{title}</h2>
      {badge && <Badge variant="secondary" className="ml-1">{badge}</Badge>}
    </div>
  );
}

// ── Empty chart helper ────────────────────────────────────────────────────────
function EmptyChart({ height = 240 }: { height?: number }) {
  return (
    <div className="flex items-center justify-center text-muted-foreground text-sm" style={{ height }}>
      Sem dados suficientes para exibir o gráfico
    </div>
  );
}

// ── Donut with center label ───────────────────────────────────────────────────
function DonutChart({
  data, total, centerLabel, height = 260,
}: {
  data: { name: string; value: number; color: string }[];
  total: number;
  centerLabel: string;
  height?: number;
}) {
  if (data.length === 0) return <EmptyChart height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="40%"
          cy="50%"
          innerRadius={68}
          outerRadius={95}
          dataKey="value"
          paddingAngle={3}
          strokeWidth={0}
        >
          {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          <Label
            content={({ viewBox }: any) => {
              const { cx, cy } = viewBox;
              return (
                <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                  <tspan x={cx} dy="-0.5em" fontSize="22" fontWeight="700" fill={NAVY}>{total}</tspan>
                  <tspan x={cx} dy="1.5em" fontSize="11" fill="#6b7280">{centerLabel}</tspan>
                </text>
              );
            }}
          />
        </Pie>
        <Legend
          iconType="circle"
          iconSize={8}
          layout="vertical"
          align="right"
          verticalAlign="middle"
          formatter={(value, entry: any) => (
            <span className="text-xs text-foreground">{value} <strong>({entry.payload.value})</strong></span>
          )}
        />
        <Tooltip content={<StyledTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Index() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [activeModule, setActiveModule] = useState<ModuleId>("todos");

  // Empresas
  const [totalEmpresas, setTotalEmpresas]   = useState(0);
  const [regimeData, setRegimeData]         = useState<any[]>([]);
  const [camposEmBranco, setCamposEmBranco] = useState({ semRegime: 0, semTelefone: 0, semEmail: 0, semMunicipio: 0 });

  // Certidões
  const [certStatusData, setCertStatusData] = useState<any[]>([]);
  const [certTipoData, setCertTipoData]     = useState<any[]>([]);

  // Certificados digitais
  const [certDigTipoData, setCertDigTipoData] = useState<any[]>([]);
  const [certDigVencData, setCertDigVencData] = useState<any[]>([]);

  // Caixas postais
  const [caixasStatusData, setCaixasStatusData] = useState<any[]>([]);

  // DDD por estado
  const [dddData, setDddData] = useState<any[]>([]);

  // Alertas
  const [alertas, setAlertas] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    const [empRes, certRes, certDigRes, caixasRes] = await Promise.all([
      supabase.from("empresas").select("*").eq("user_id", user.id),
      supabase.from("certidoes").select("*").eq("user_id", user.id),
      supabase.from("certificados").select("*").eq("user_id", user.id),
      supabase.from("caixas_postais").select("*").eq("user_id", user.id),
    ]);

    const emps     = empRes.data     || [];
    const certs    = certRes.data    || [];
    const certDigs = certDigRes.data || [];
    const caixas   = caixasRes.data  || [];

    setTotalEmpresas(emps.length);

    // Campos em branco
    setCamposEmBranco({
      semRegime:    emps.filter(e => !e.regime_tributario).length,
      semTelefone:  emps.filter(e => !e.telefone).length,
      semEmail:     emps.filter(e => !e.email_responsavel).length,
      semMunicipio: emps.filter(e => !e.municipio || !e.uf).length,
    });

    // Regime tributário
    const regimeMap: Record<string, number> = {};
    emps.forEach(e => {
      const r = e.regime_tributario || "Não informado";
      const label = r === "simples" ? "Simples" : r === "presumido" ? "Presumido" : r === "real" ? "Lucro Real" : r === "mei" ? "MEI" : "N/I";
      regimeMap[label] = (regimeMap[label] || 0) + 1;
    });
    const regimeColors = [GREEN, NAVY, AMBER, VIOLET, GRAY];
    setRegimeData(Object.entries(regimeMap).map(([name, value], i) => ({ name, value, color: regimeColors[i % regimeColors.length] })));

    // Certidões por status
    const statusMap = { regular: 0, vencendo: 0, irregular: 0, indisponivel: 0 };
    certs.forEach(c => { if (c.status in statusMap) (statusMap as any)[c.status]++; });
    setCertStatusData([
      { name: "Regular",      value: statusMap.regular,      color: GREEN },
      { name: "Vencendo",     value: statusMap.vencendo,     color: AMBER },
      { name: "Irregular",    value: statusMap.irregular,    color: RED   },
      { name: "Indisponível", value: statusMap.indisponivel, color: GRAY  },
    ].filter(d => d.value > 0));

    // Certidões por tipo
    const tipoMap: Record<string, Record<string, number>> = {};
    certs.forEach(c => {
      if (!tipoMap[c.tipo]) tipoMap[c.tipo] = { regular: 0, irregular: 0, vencendo: 0, indisponivel: 0 };
      tipoMap[c.tipo][c.status]++;
    });
    setCertTipoData(Object.entries(tipoMap).map(([tipo, counts]) => ({
      name: tipoLabels[tipo] || tipo,
      ...counts,
    })));

    // Certificados digitais
    const today = new Date();
    const in30  = addDays(today, 30);
    setCertDigTipoData([
      { name: "A1", value: certDigs.filter(c => c.tipo === "A1").length, color: BLUE   },
      { name: "A3", value: certDigs.filter(c => c.tipo === "A3").length, color: VIOLET },
    ].filter(d => d.value > 0));
    setCertDigVencData([
      { name: "Válidos",  value: certDigs.filter(c => toDate(c.data_vencimento) > in30).length,                                         color: GREEN },
      { name: "Vencendo", value: certDigs.filter(c => toDate(c.data_vencimento) > today && toDate(c.data_vencimento) <= in30).length,    color: AMBER },
      { name: "Vencidos", value: certDigs.filter(c => toDate(c.data_vencimento) <= today).length,                                       color: RED   },
    ].filter(d => d.value > 0));

    // Caixas postais — gera alertas automaticamente para as que vencem em até 30 dias
    const caixasStatus = { ativa: 0, a_vencer: 0, vencida: 0, rescindido: 0 };
    for (const c of caixas) {
      if (c.contrato_status === "rescindido") { caixasStatus.rescindido++; continue; }
      const dias = differenceInDays(toDate(c.data_vencimento), toDate(format(today, "yyyy-MM-dd")));
      if (dias < 0)        caixasStatus.vencida++;
      else if (dias <= 30) {
        caixasStatus.a_vencer++;
        // Cria alerta se ainda não existe um não-resolvido para esta caixa
        const titulo = `Caixa Postal nº ${c.numero} vencendo`;
        const { data: jaExiste } = await supabase
          .from("alertas")
          .select("id")
          .eq("user_id", user.id)
          .eq("titulo", titulo)
          .eq("resolvida", false)
          .limit(1);
        if (!jaExiste || jaExiste.length === 0) {
          const nivel = dias <= 7 ? "critico" : "aviso";
          await supabase.from("alertas").insert({
            user_id: c.user_id,
            empresa_id: c.empresa_id,
            nivel,
            titulo,
            mensagem: `O contrato da Caixa Postal nº ${c.numero} de ${c.empresa} vence em ${dias} dias (${c.data_vencimento}).`,
            acao_recomendada: "Renove o contrato da caixa postal antes do vencimento.",
          });
        }
      } else {
        caixasStatus.ativa++;
      }
    }
    setCaixasStatusData([
      { name: "Ativas",      value: caixasStatus.ativa,      color: GREEN },
      { name: "A Vencer",    value: caixasStatus.a_vencer,   color: AMBER },
      { name: "Vencidas",    value: caixasStatus.vencida,    color: RED   },
      { name: "Rescindidas", value: caixasStatus.rescindido, color: GRAY  },
    ].filter(d => d.value > 0));

    // DDD por estado
    const ufCount: Record<string, number> = {};
    [...emps.map(e => e.telefone), ...caixas.map(c => c.telefone)].forEach(tel => {
      const ddd = extractDdd(tel);
      if (!ddd) return;
      const uf = DDD_TO_UF[ddd];
      if (uf) ufCount[uf] = (ufCount[uf] || 0) + 1;
    });
    setDddData(
      Object.entries(ufCount)
        .sort((a, b) => b[1] - a[1])
        .map(([uf, count], i) => ({ uf, name: UF_NAMES[uf] || uf, count, color: GEO_PALETTE[i % GEO_PALETTE.length] }))
    );

    // Busca alertas após possível inserção das caixas
    const { data: alertasData } = await supabase
      .from("alertas")
      .select("*, empresas(razao_social)")
      .eq("user_id", user.id)
      .eq("lida", false)
      .order("created_at", { ascending: false })
      .limit(5);
    setAlertas(alertasData || []);

    setIsLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  // Derived totals
  const totalCerts   = certStatusData.reduce((s, d) => s + d.value, 0);
  const totalCertDig = certDigTipoData.reduce((s, d) => s + d.value, 0);
  const totalCaixas  = caixasStatusData.reduce((s, d) => s + d.value, 0);
  const totalDdd     = dddData.reduce((s, d) => s + d.count, 0);

  const certRegulares = certStatusData.find(d => d.name === "Regular")?.value || 0;
  const certIrreg     = certStatusData.find(d => d.name === "Irregular")?.value || 0;
  const certVenc      = certStatusData.find(d => d.name === "Vencendo")?.value || 0;
  const caixasAtivas   = caixasStatusData.find(d => d.name === "Ativas")?.value || 0;
  const caixasAVencer  = caixasStatusData.find(d => d.name === "A Vencer")?.value || 0;

  // Visibility per module
  const show = {
    certidoes:    activeModule === "todos" || activeModule === "certidoes",
    certificados: activeModule === "todos" || activeModule === "certificados",
    caixas:       activeModule === "todos" || activeModule === "caixas",
    regime:       activeModule === "todos",
    campos:       activeModule === "todos",
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Carregando dados...</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}><CardHeader className="pb-2"><Skeleton className="h-4 w-3/4" /></CardHeader><CardContent><Skeleton className="h-8 w-16" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* ── Page header + Module filter ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral de todos os módulos</p>
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2">
          {MODULES.map(({ id, label, icon: Icon, color }) => {
            const active = activeModule === id;
            return (
              <Button
                key={id}
                size="sm"
                onClick={() => setActiveModule(id)}
                className="gap-1.5 transition-all"
                style={active
                  ? { backgroundColor: color, color: "#fff", borderColor: color }
                  : { backgroundColor: "transparent", color: color, borderColor: color + "60" }
                }
                variant={active ? "default" : "outline"}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* ── KPI strip (contextual por módulo) ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(activeModule === "todos" ? [
          { label: "Certidões com Problema", value: certIrreg + certVenc,                                                                  icon: AlertTriangle, color: RED,       bg: "#fff1f1", to: "/certidoes"                        },
          { label: "Certificados Vencendo",  value: (certDigVencData.find(d => d.name === "Vencendo")?.value || 0) + (certDigVencData.find(d => d.name === "Vencidos")?.value || 0), icon: KeyRound, color: AMBER, bg: "#fffbeb", to: "/certificados" },
          { label: "Caixas A Vencer (30d)",  value: caixasAVencer,                                                                         icon: MailOpen,      color: AMBER,     bg: "#fffbeb", to: "/caixas-postais?filtro=a_vencer"   },
          { label: "Empresas sem Dados",     value: camposEmBranco.semRegime + camposEmBranco.semEmail + camposEmBranco.semTelefone + camposEmBranco.semMunicipio, icon: Building2, color: NAVY, bg: "#f0f1f8", to: "/empresas" },
        ] : activeModule === "certidoes" ? [
          { label: "Total de Certidões",     value: totalCerts,           icon: FileCheck,     color: NAVY,      bg: "#f0f1f8", to: "/certidoes" },
          { label: "Regulares",              value: certRegulares,        icon: CheckCircle,   color: GREEN,     bg: "#f0fdf4", to: "/certidoes" },
          { label: "Irregulares",            value: certIrreg,            icon: AlertTriangle, color: RED,       bg: "#fff1f1", to: "/certidoes" },
          { label: "Vencendo",               value: certVenc,             icon: AlertTriangle, color: AMBER,     bg: "#fffbeb", to: "/certidoes" },
        ] : activeModule === "certificados" ? [
          { label: "Total de Certificados",  value: totalCertDig,         icon: KeyRound,      color: BLUE,      bg: "#eff6ff", to: "/certificados" },
          { label: "Válidos",                value: certDigVencData.find(d => d.name === "Válidos")?.value  || 0, icon: CheckCircle,   color: GREEN, bg: "#f0fdf4", to: "/certificados" },
          { label: "Vencendo (30d)",         value: certDigVencData.find(d => d.name === "Vencendo")?.value || 0, icon: AlertTriangle, color: AMBER, bg: "#fffbeb", to: "/certificados" },
          { label: "Vencidos",               value: certDigVencData.find(d => d.name === "Vencidos")?.value || 0, icon: AlertTriangle, color: RED,   bg: "#fff1f1", to: "/certificados" },
        ] : /* caixas */ [
          { label: "Total de Caixas",        value: totalCaixas,          icon: MailOpen,      color: "#0ea5e9", bg: "#eff6ff", to: "/caixas-postais" },
          { label: "Ativas",                 value: caixasAtivas,         icon: CheckCircle,   color: GREEN,     bg: "#f0fdf4", to: "/caixas-postais?filtro=ativa" },
          caixasAVencer > 0
            ? { label: "A Vencer (30d)",     value: caixasAVencer,        icon: AlertTriangle, color: AMBER,     bg: "#fffbeb", to: "/caixas-postais?filtro=a_vencer" }
            : { label: "A Vencer (30d)",     value: 0,                    icon: AlertTriangle, color: AMBER,     bg: "#fffbeb", to: "/caixas-postais?filtro=a_vencer" },
          { label: "Vencidas",               value: caixasStatusData.find(d => d.name === "Vencidas")?.value || 0, icon: AlertTriangle, color: RED, bg: "#fff1f1", to: "/caixas-postais?filtro=vencida" },
        ]).map(({ label, value, icon: Icon, color, bg, to }) => (
          <Card key={label} className="border-0 shadow-sm cursor-pointer transition-transform hover:scale-[1.02] hover:shadow-md" style={{ backgroundColor: bg }} onClick={() => navigate(to)}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + "20" }}>
                <Icon className="h-4 w-4" style={{ color }} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" style={{ color }}>{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Campos em branco (only on Todos) ── */}
      {show.campos && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 rounded-full" style={{ backgroundColor: NAVY }} />
              <FileText className="h-4 w-4" style={{ color: NAVY }} />
              <h2 className="text-sm font-semibold" style={{ color: NAVY }}>Campos em Branco — Cadastro de Empresas</h2>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Sem Regime Tributário", value: camposEmBranco.semRegime,    color: AMBER,  bg: "#fffbeb", icon: FileText, filtro: "sem_regime"    },
                { label: "Sem Endereço (Mun/UF)", value: camposEmBranco.semMunicipio, color: BLUE,   bg: "#eff6ff", icon: MapPin,   filtro: "sem_municipio" },
                { label: "Sem Telefone",           value: camposEmBranco.semTelefone,  color: VIOLET, bg: "#f5f3ff", icon: Phone,    filtro: "sem_telefone"  },
                { label: "Sem E-mail",             value: camposEmBranco.semEmail,     color: RED,    bg: "#fff1f1", icon: Mail,     filtro: "sem_email"     },
              ].map(({ label, value, color, bg, icon: Icon, filtro }) => (
                <div key={label} className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-transform hover:scale-[1.02] hover:shadow-md" style={{ backgroundColor: bg, borderColor: color + "30" }} onClick={() => navigate(`/empresas?filtro=${filtro}`)}>
                  <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: color + "20" }}>
                    <Icon className="h-4 w-4" style={{ color }} />
                  </div>
                  <div>
                    <div className="text-2xl font-bold" style={{ color }}>{value}</div>
                    <div className="text-xs text-muted-foreground leading-tight">{label}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Certidões ── */}
      {show.certidoes && (
        <div>
          <SectionHeading icon={FileCheck} title="Certidões" color={NAVY} badge={`${totalCerts} certidões`} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="shadow-sm">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm text-muted-foreground font-medium">Distribuição por Status</CardTitle>
              </CardHeader>
              <CardContent>
                <DonutChart data={certStatusData} total={totalCerts} centerLabel="certidões" />
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm text-muted-foreground font-medium">Por Tipo de Certidão</CardTitle>
              </CardHeader>
              <CardContent>
                {certTipoData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={certTipoData} margin={{ left: -10, bottom: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip content={<StyledTooltip />} />
                      <Bar dataKey="regular"      fill={GREEN} name="Regular"      radius={[2, 2, 0, 0]} />
                      <Bar dataKey="vencendo"     fill={AMBER} name="Vencendo"     radius={[2, 2, 0, 0]} />
                      <Bar dataKey="irregular"    fill={RED}   name="Irregular"    radius={[2, 2, 0, 0]} />
                      <Bar dataKey="indisponivel" fill={GRAY}  name="Indisponível" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyChart />}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── Certificados Digitais ── */}
      {show.certificados && (
        <div>
          <SectionHeading icon={KeyRound} title="Certificados Digitais" color={BLUE} badge={`${totalCertDig} certificados`} />
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            <Card className="shadow-sm">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm text-muted-foreground font-medium">A1 vs A3</CardTitle>
              </CardHeader>
              <CardContent>
                <DonutChart data={certDigTipoData} total={totalCertDig} centerLabel="certificados" height={220} />
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm text-muted-foreground font-medium">Situação de Vencimento</CardTitle>
              </CardHeader>
              <CardContent>
                <DonutChart data={certDigVencData} total={totalCertDig} centerLabel="certificados" height={220} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── Caixas Postais ── */}
      {show.caixas && (
        <div>
          <SectionHeading icon={MailOpen} title="Caixas Postais" color="#0ea5e9" badge={`${totalCaixas} caixas`} />
          <Card className="shadow-sm">
            <CardHeader className="pb-0">
              <CardTitle className="text-sm text-muted-foreground font-medium">Status dos Contratos</CardTitle>
            </CardHeader>
            <CardContent>
              <DonutChart data={caixasStatusData} total={totalCaixas} centerLabel="caixas" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Origem Geográfica dos Clientes (always visible) ── */}
      {<Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="w-1 h-6 rounded-full" style={{ backgroundColor: VIOLET }} />
            <MapPin className="h-4 w-4" style={{ color: VIOLET }} />
            <CardTitle className="text-sm font-semibold" style={{ color: VIOLET }}>
              Origem Geográfica dos Clientes
            </CardTitle>
            {totalDdd > 0 && (
              <Badge variant="secondary" className="ml-1">{totalDdd} contatos mapeados</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {dddData.length > 0 ? (
            <div className="space-y-4">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={dddData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={105}
                    dataKey="count"
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {dddData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    <Label
                      content={({ viewBox }: any) => {
                        const { cx, cy } = viewBox;
                        return (
                          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                            <tspan x={cx} dy="-0.5em" fontSize="28" fontWeight="700" fill={NAVY}>{totalDdd}</tspan>
                            <tspan x={cx} dy="1.6em" fontSize="11" fill="#6b7280">clientes</tspan>
                          </text>
                        );
                      }}
                    />
                  </Pie>
                  <Tooltip
                    content={({ active, payload }: any) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      const pct = totalDdd > 0 ? ((d.count / totalDdd) * 100).toFixed(1) : "0";
                      return (
                        <div className="bg-white border border-border shadow-lg rounded-lg p-3 text-sm">
                          <p className="font-semibold text-foreground">{d.name}</p>
                          <p style={{ color: d.color }}>Clientes: <strong>{d.count}</strong></p>
                          <p className="text-muted-foreground">{pct}% do total</p>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Legenda em grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1.5 pt-2 border-t">
                {dddData.map((d) => {
                  const pct = totalDdd > 0 ? ((d.count / totalDdd) * 100).toFixed(1) : "0";
                  return (
                    <div key={d.uf} className="flex items-center gap-1.5 min-w-0">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      <span className="text-xs text-foreground truncate">{d.name}</span>
                      <span className="text-xs font-semibold ml-auto shrink-0" style={{ color: d.color }}>{d.count}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-sm gap-2">
              <MapPin className="h-8 w-8 opacity-30" />
              <p>Preencha os telefones nas empresas e caixas postais para ver a origem geográfica.</p>
            </div>
          )}
        </CardContent>
      </Card>}

      {/* ── Regime Tributário (only on Todos) ── */}
      {show.regime && regimeData.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 rounded-full" style={{ backgroundColor: GREEN }} />
              <FileText className="h-4 w-4" style={{ color: GREEN }} />
              <h2 className="text-sm font-semibold" style={{ color: GREEN }}>Tributação das Empresas</h2>
            </div>
          </CardHeader>
          <CardContent>
            <DonutChart data={regimeData} total={totalEmpresas} centerLabel="empresas" />
          </CardContent>
        </Card>
      )}

      {/* ── Alertas Recentes (filtrado por módulo) ── */}
      {(() => {
        const alertasFiltrados = activeModule === "todos" ? alertas
          : activeModule === "certidoes"    ? alertas.filter(a => a.certidao_id)
          : activeModule === "certificados" ? alertas.filter(a => a.titulo?.toLowerCase().includes("certificado"))
          : activeModule === "caixas"       ? alertas.filter(a => a.titulo?.startsWith("Caixa Postal"))
          : alertas;
        return (
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="w-1 h-5 rounded-full" style={{ backgroundColor: RED }} />
                <AlertTriangle className="h-4 w-4" style={{ color: RED }} />
                <h2 className="text-sm font-semibold" style={{ color: RED }}>Alertas Recentes</h2>
              </div>
            </CardHeader>
            <CardContent>
              {alertasFiltrados.length > 0 ? (
                <div className="space-y-3">
                  {alertasFiltrados.map((alerta) => (
                    <div key={alerta.id} className="flex items-start gap-3 p-3 rounded-xl border bg-muted/30">
                      <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${alerta.nivel === "critico" ? "text-destructive" : alerta.nivel === "aviso" ? "text-amber-500" : "text-primary"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{alerta.titulo}</span>
                          <NivelBadge nivel={alerta.nivel} />
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">{alerta.mensagem}</p>
                        {alerta.empresas?.razao_social && (
                          <p className="text-xs text-muted-foreground mt-0.5">Empresa: {alerta.empresas.razao_social}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Nenhum alerta pendente. Tudo em ordem!
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

    </div>
  );
}
