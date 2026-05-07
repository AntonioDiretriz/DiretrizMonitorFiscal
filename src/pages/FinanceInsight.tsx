import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { format, subMonths, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  TrendingUp, TrendingDown, Upload, FileText, BarChart2,
  DollarSign, Activity, Download, Plus, Trash2, Building2,
  AlertTriangle, CheckCircle, Minus, RefreshCw, Eye, Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
  LineChart, Line, AreaChart, Area,
} from "recharts";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import jsPDF from "jspdf";

GlobalWorkerOptions.workerSrc = workerUrl;

const NAVY  = "#10143D";
const RED   = "#ED3237";
const GREEN = "#22c55e";
const AMBER = "#f59e0b";
const BLUE  = "#3b82f6";
const GRAY  = "#94a3b8";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DreData {
  receita_bruta: number;
  deducoes: number;
  receita_liquida: number;
  custo_servicos: number;
  lucro_bruto: number;
  despesas_pessoal: number;
  despesas_administrativas: number;
  despesas_comerciais: number;
  outras_despesas_op: number;
  ebitda: number;
  depreciacao_amortizacao: number;
  ebit: number;
  receitas_financeiras: number;
  despesas_financeiras: number;
  resultado_financeiro: number;
  lucro_antes_ir: number;
  ir_csll: number;
  lucro_liquido: number;
}

interface BalancoData {
  caixa_equivalentes: number;
  contas_receber: number;
  estoques: number;
  outros_ativo_circ: number;
  ativo_circulante: number;
  imobilizado: number;
  intangivel: number;
  outros_ativo_nc: number;
  ativo_nao_circulante: number;
  ativo_total: number;
  fornecedores: number;
  obrigacoes_fiscais: number;
  emprestimos_cp: number;
  outros_passivo_circ: number;
  passivo_circulante: number;
  emprestimos_lp: number;
  outros_passivo_nc: number;
  passivo_nao_circulante: number;
  patrimonio_liquido: number;
  capital_social: number;
  reservas: number;
  lucros_acumulados: number;
  passivo_total: number;
}

interface DfcData {
  lucro_liquido: number;
  ajustes_depreciacao: number;
  variacao_contas_receber: number;
  variacao_estoques: number;
  variacao_fornecedores: number;
  outros_operacionais: number;
  caixa_operacional: number;
  aquisicao_imobilizado: number;
  venda_ativo: number;
  outros_investimento: number;
  caixa_investimento: number;
  emprestimos_obtidos: number;
  amortizacao_emprestimos: number;
  distribuicao_lucros: number;
  outros_financiamento: number;
  caixa_financiamento: number;
  variacao_caixa: number;
  caixa_inicial: number;
  caixa_final: number;
}

interface BalanceteAccount {
  codigo: string;
  nome: string;
  nivel: number;
  saldo_anterior: number;
  debitos: number;
  creditos: number;
  saldo_atual: number;
}
interface BalanceteData { contas: BalanceteAccount[] }

interface DocumentoFinanceiro {
  id: string;
  empresa_id: string;
  tipo: "dre" | "balanco" | "balancete" | "dfc";
  periodo: string;
  dados_parseados: DreData | BalancoData | DfcData | BalanceteData | null;
  arquivo_url: string | null;
  arquivo_nome: string | null;
  created_at: string;
}

interface Empresa { id: string; razao_social: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtR(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtP(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}
function fmtPct(v: number) { return `${v.toFixed(1)}%`; }

function pct(a: number, b: number) { return b !== 0 ? ((a - b) / Math.abs(b)) * 100 : 0; }

function normStr(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}
function parseBRNumber(s: string): number {
  const neg = s.includes("(") || s.trimStart().startsWith("-");
  const n = parseFloat(s.replace(/[\(\)\s\-]/g, "").replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : neg ? -Math.abs(n) : n;
}
const NUM_RE = /[(-]?\d{1,3}(?:\.\d{3})*,\d{2}\)?/g;

function findLastVal(lines: string[], kwSets: string[][]): number {
  for (let i = 0; i < lines.length; i++) {
    const norm = normStr(lines[i]);
    for (const kws of kwSets) {
      if (kws.every(k => norm.includes(normStr(k)))) {
        const all = lines[i].match(NUM_RE);
        if (all && all.length > 0) return parseBRNumber(all[all.length - 1]);
        if (i + 1 < lines.length) {
          const all2 = lines[i + 1].match(NUM_RE);
          if (all2 && all2.length > 0) return parseBRNumber(all2[all2.length - 1]);
        }
        break;
      }
    }
  }
  return 0;
}
function abs(v: number) { return -Math.abs(v); }

async function extractPdfText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const pdf = await getDocument({ data: buf }).promise;
  let text = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items as any[]) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform[5]);
      const x = item.transform[4];
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x, str: item.str });
    }
    const sorted = [...rows.entries()]
      .sort(([ya], [yb]) => yb - ya)
      .map(([, items]) => items.sort((a, b) => a.x - b.x).map(i => i.str).join(" "));
    text += sorted.join("\n") + "\n";
  }
  return text;
}

function parseDRE(text: string): DreData {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const f  = (kws: string[][]) => findLastVal(lines, kws);
  const fa = (kws: string[][]) => abs(findLastVal(lines, kws));

  const receita_bruta = f([["receita bruta"], ["receita operacional bruta"], ["vendas brutas"]]);
  const deducoes      = fa([["deducoes"], ["(-) deducoes"], ["impostos sobre vendas"], ["deducoes da receita"]]);
  const receita_liquida = f([["receita liquida"], ["receita operacional liquida"], ["receita liq"]]) ||
    (receita_bruta + deducoes);
  const custo_servicos = fa([["custo dos servicos"], ["custo dos produtos"], ["cmv"], ["csp"], ["custo merc"]]);
  const lucro_bruto = f([["lucro bruto"], ["resultado bruto"]]) || (receita_liquida + custo_servicos);
  const despesas_pessoal = fa([["despesas com pessoal"], ["salarios e encargos"], ["pessoal"]]);
  const despesas_administrativas = fa([["despesas administrativas"], ["administrativas"], ["gerais e adm"]]);
  const despesas_comerciais = fa([["despesas com vendas"], ["despesas comerciais"], ["comerciais"]]);
  const outras_despesas_op = fa([["outras despesas operacionais"], ["outras despesas"]]);
  const ebitda = f([["ebitda"], ["lajida"]]) ||
    (lucro_bruto + despesas_pessoal + despesas_administrativas + despesas_comerciais + outras_despesas_op);
  const depreciacao_amortizacao = fa([["depreciacao"], ["amortizacao"]]);
  const ebit = f([["resultado operacional"], ["ebit"], ["lajir"]]) || (ebitda + depreciacao_amortizacao);
  const receitas_financeiras = f([["receitas financeiras"], ["receita financeira"]]);
  const despesas_financeiras = fa([["despesas financeiras"], ["despesa financeira"], ["encargos financeiros"]]);
  const resultado_financeiro = f([["resultado financeiro"]]) || (receitas_financeiras + despesas_financeiras);
  const lucro_antes_ir = f([["lucro antes do imposto"], ["resultado antes do ir"]]) || (ebit + resultado_financeiro);
  const ir_csll = fa([["imposto de renda"], ["ir e csll"], ["ir/csll"], ["irpj"]]);
  const lucro_liquido = f([
    ["lucro liquido"], ["resultado liquido"], ["lucro do exercicio"],
    ["resultado do exercicio"], ["prejuizo do exercicio"], ["lucro (prejuizo)"],
  ]) || (lucro_antes_ir + ir_csll);

  return {
    receita_bruta, deducoes, receita_liquida, custo_servicos, lucro_bruto,
    despesas_pessoal, despesas_administrativas, despesas_comerciais, outras_despesas_op,
    ebitda, depreciacao_amortizacao, ebit,
    receitas_financeiras, despesas_financeiras, resultado_financeiro,
    lucro_antes_ir, ir_csll, lucro_liquido,
  };
}

function parseBalanco(text: string): BalancoData {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const f = (kws: string[][]) => findLastVal(lines, kws);

  const caixa_equivalentes  = f([["caixa"], ["caixa e equivalentes"]]);
  const contas_receber       = f([["contas a receber"], ["clientes"], ["duplicatas"]]);
  const estoques             = f([["estoques"], ["mercadorias"]]);
  const outros_ativo_circ    = f([["outros ativos circulantes"], ["outros creditos"]]);
  const ativo_circulante     = f([["ativo circulante"], ["total ativo circulante"]]) ||
    (caixa_equivalentes + contas_receber + estoques + outros_ativo_circ);
  const imobilizado          = f([["imobilizado"], ["ativo imobilizado"]]);
  const intangivel           = f([["intangivel"], ["ativo intangivel"]]);
  const outros_ativo_nc      = f([["outros ativos nao circulantes"]]);
  const ativo_nao_circulante = f([["ativo nao circulante"], ["ativo realizavel"]]) ||
    (imobilizado + intangivel + outros_ativo_nc);
  const ativo_total          = f([["ativo total"], ["total do ativo"]]) ||
    (ativo_circulante + ativo_nao_circulante);
  const fornecedores         = f([["fornecedores"], ["contas a pagar"]]);
  const obrigacoes_fiscais   = f([["obrigacoes fiscais"], ["impostos a recolher"], ["tributos"]]);
  const emprestimos_cp       = f([["emprestimos e financiamentos circulante"], ["emprestimos cp"]]);
  const outros_passivo_circ  = f([["outros passivos circulantes"]]);
  const passivo_circulante   = f([["passivo circulante"], ["total passivo circulante"]]) ||
    (fornecedores + obrigacoes_fiscais + emprestimos_cp + outros_passivo_circ);
  const emprestimos_lp       = f([["emprestimos e financiamentos nao circulante"], ["emprestimos lp"]]);
  const outros_passivo_nc    = f([["outros passivos nao circulantes"]]);
  const passivo_nao_circulante = f([["passivo nao circulante"], ["exigivel a longo prazo"]]) ||
    (emprestimos_lp + outros_passivo_nc);
  const capital_social       = f([["capital social"]]);
  const reservas             = f([["reservas"], ["reservas de capital"]]);
  const lucros_acumulados    = f([["lucros acumulados"], ["prejuizos acumulados"], ["resultados acumulados"]]);
  const patrimonio_liquido   = f([["patrimonio liquido"], ["total do patrimonio"]]) ||
    (capital_social + reservas + lucros_acumulados);
  const passivo_total        = f([["passivo total"], ["total do passivo e pl"]]) ||
    (passivo_circulante + passivo_nao_circulante + patrimonio_liquido);

  return {
    caixa_equivalentes, contas_receber, estoques, outros_ativo_circ, ativo_circulante,
    imobilizado, intangivel, outros_ativo_nc, ativo_nao_circulante, ativo_total,
    fornecedores, obrigacoes_fiscais, emprestimos_cp, outros_passivo_circ, passivo_circulante,
    emprestimos_lp, outros_passivo_nc, passivo_nao_circulante,
    patrimonio_liquido, capital_social, reservas, lucros_acumulados, passivo_total,
  };
}

function parseDFC(text: string): DfcData {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const f = (kws: string[][]) => findLastVal(lines, kws);

  const lucro_liquido            = f([["lucro liquido"], ["resultado liquido"]]);
  const ajustes_depreciacao      = f([["depreciacao"], ["amortizacao"]]);
  const variacao_contas_receber  = f([["variacao contas a receber"], ["contas a receber"]]);
  const variacao_estoques        = f([["variacao estoque"], ["estoques"]]);
  const variacao_fornecedores    = f([["variacao fornecedores"], ["fornecedores"]]);
  const outros_operacionais      = f([["outros operacionais"]]);
  const caixa_operacional        = f([["caixa operacional"], ["atividades operacionais"]]) ||
    (lucro_liquido + ajustes_depreciacao + variacao_contas_receber + variacao_estoques + variacao_fornecedores + outros_operacionais);

  const aquisicao_imobilizado = abs(f([["aquisicao de imobilizado"], ["compra de imobilizado"], ["investimentos em imobilizado"]]));
  const venda_ativo           = f([["venda de ativo"], ["alienacao de ativo"], ["desinvestimento"]]);
  const outros_investimento   = f([["outros investimento"]]);
  const caixa_investimento    = f([["atividades de investimento"]]) ||
    (aquisicao_imobilizado + venda_ativo + outros_investimento);

  const emprestimos_obtidos       = f([["emprestimos obtidos"], ["captacao de emprestimos"]]);
  const amortizacao_emprestimos   = abs(f([["amortizacao de emprestimos"], ["pagamento de emprestimos"]]));
  const distribuicao_lucros       = abs(f([["distribuicao de lucros"], ["dividendos pagos"], ["juros sobre capital"]]));
  const outros_financiamento      = f([["outros financiamento"]]);
  const caixa_financiamento       = f([["atividades de financiamento"]]) ||
    (emprestimos_obtidos + amortizacao_emprestimos + distribuicao_lucros + outros_financiamento);

  const variacao_caixa = f([["variacao liquida"], ["variacao de caixa"], ["variacao no saldo de caixa"]]) ||
    (caixa_operacional + caixa_investimento + caixa_financiamento);
  const caixa_inicial  = f([["caixa no inicio"], ["saldo inicial de caixa"], ["caixa e equivalentes no inicio"]]);
  const caixa_final    = f([["caixa no fim"], ["saldo final de caixa"], ["caixa e equivalentes no fim"]]) ||
    (caixa_inicial + variacao_caixa);

  return {
    lucro_liquido, ajustes_depreciacao, variacao_contas_receber, variacao_estoques,
    variacao_fornecedores, outros_operacionais, caixa_operacional,
    aquisicao_imobilizado, venda_ativo, outros_investimento, caixa_investimento,
    emprestimos_obtidos, amortizacao_emprestimos, distribuicao_lucros, outros_financiamento, caixa_financiamento,
    variacao_caixa, caixa_inicial, caixa_final,
  };
}

function parseBalanceteComCodigos(text: string): BalanceteData {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const contas: BalanceteAccount[] = [];

  function parseDC(s: string): number {
    const n = parseFloat(s.replace(/[DC]$/, "").replace(/\./g, "").replace(",", "."));
    return isNaN(n) ? 0 : n;
  }

  const NUM_BAL = /\d{1,3}(?:\.\d{3})*,\d{2}[DC]?/g;

  for (const line of lines) {
    if (/balancete|c[oó]digo\s+classific|saldo\s+anterior.*d[eé]bit|empresa:|c\.n\.p\.j|per[ií]odo:|emiss[aã]o|sistema\s+licenc|resumo\s+do\s+balanc|hora:/i.test(line)) continue;

    const allNums: { str: string; idx: number }[] = [];
    NUM_BAL.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = NUM_BAL.exec(line)) !== null) {
      allNums.push({ str: m[0], idx: m.index });
    }
    if (allNums.length < 4) continue;

    const last4 = allNums.slice(-4);
    const textPart = line.slice(0, last4[0].idx).trim();

    const rowMatch = textPart.match(/(?:^|\s)(\d{1,4})\s+(\d{1,3}(?:\.\d{1,3})*)\s+(.+)$/);
    if (!rowMatch) continue;

    const codigo = rowMatch[2];
    let nome = rowMatch[3].trim().replace(/^\d+\s*/, "").trim();
    if (!nome || nome.length < 2) continue;

    const nivel = (codigo.match(/\./g) ?? []).length + 1;

    contas.push({
      codigo,
      nome,
      nivel,
      saldo_anterior: parseDC(last4[0].str),
      debitos:        parseDC(last4[1].str),
      creditos:       parseDC(last4[2].str),
      saldo_atual:    parseDC(last4[3].str),
    });
  }

  return { contas };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  title, value, subtitle, trend, icon: Icon, color = NAVY, small = false,
}: {
  title: string; value: string; subtitle?: string; trend?: number;
  icon: React.ElementType; color?: string; small?: boolean;
}) {
  const up = trend !== undefined ? trend >= 0 : null;
  return (
    <Card className="overflow-hidden">
      <div className="h-1" style={{ background: color }} />
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide truncate">{title}</p>
            <p className={`font-bold text-foreground mt-1 ${small ? "text-lg" : "text-2xl"}`}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
            {trend !== undefined && (
              <p className={`text-xs font-medium mt-1 flex items-center gap-1 ${up ? "text-green-600" : "text-red-500"}`}>
                {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {fmtP(trend)} vs período anterior
              </p>
            )}
          </div>
          <div className="ml-3 shrink-0 h-10 w-10 rounded-lg flex items-center justify-center" style={{ background: `${color}18` }}>
            <Icon className="h-5 w-5" style={{ color }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type TrafficLight = "green" | "yellow" | "red" | "neutral";
function IndicadorCard({
  nome, valor, unidade = "", meta, interpretacao, status,
}: {
  nome: string; valor: number; unidade?: string; meta?: string;
  interpretacao: string; status: TrafficLight;
}) {
  const colors: Record<TrafficLight, { bg: string; text: string; icon: React.ElementType }> = {
    green:   { bg: "bg-green-50 border-green-200",   text: "text-green-700", icon: CheckCircle },
    yellow:  { bg: "bg-amber-50 border-amber-200",   text: "text-amber-700", icon: AlertTriangle },
    red:     { bg: "bg-red-50 border-red-200",       text: "text-red-700",   icon: AlertTriangle },
    neutral: { bg: "bg-slate-50 border-slate-200",   text: "text-slate-600", icon: Minus },
  };
  const c = colors[status];
  const StatusIcon = c.icon;
  return (
    <Card className={`border ${c.bg}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">{nome}</span>
          <StatusIcon className={`h-4 w-4 ${c.text}`} />
        </div>
        <div className={`text-2xl font-bold ${c.text}`}>
          {valor.toFixed(2)}{unidade}
        </div>
        {meta && <p className="text-xs text-muted-foreground mt-1">Meta: {meta}</p>}
        <p className="text-xs text-muted-foreground mt-2">{interpretacao}</p>
      </CardContent>
    </Card>
  );
}

function DreLinha({
  label, valor, base, valorAnt, indent = 0, bold = false, separator = false, cols,
}: {
  label: string; valor: number; base: number; valorAnt?: number | null;
  indent?: number; bold?: boolean; separator?: boolean; cols: number;
}) {
  const margem = base !== 0 ? (valor / base) * 100 : 0;
  const hasAnt = valorAnt !== undefined && valorAnt !== null;
  const delta  = hasAnt && valorAnt !== 0 ? ((valor - valorAnt!) / Math.abs(valorAnt!)) * 100 : null;
  return (
    <>
      {separator && <tr><td colSpan={cols} className="py-0.5"><div className="border-t border-gray-200" /></td></tr>}
      <tr className={bold ? "font-semibold bg-slate-50" : "hover:bg-slate-50/50"}>
        <td className="py-2 text-sm" style={{ paddingLeft: `${(indent + 1) * 12}px` }}>{label}</td>
        {hasAnt && (
          <td className="py-2 text-sm text-right text-slate-400">{fmtR(valorAnt!)}</td>
        )}
        <td className="py-2 text-sm text-right">{fmtR(valor)}</td>
        {hasAnt && (
          <td className={`py-2 text-xs text-right font-medium ${delta === null ? "text-slate-300" : delta >= 0 ? "text-green-600" : "text-red-500"}`}>
            {delta !== null ? fmtP(delta) : "—"}
          </td>
        )}
        <td className={`py-2 text-xs text-right ${margem >= 0 ? "text-slate-400" : "text-red-400"}`}>
          {base !== 0 ? fmtPct(margem) : "—"}
        </td>
      </tr>
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type UploadStep = "select" | "parsing" | "review";

const DRE_FIELDS: { key: keyof DreData; label: string }[] = [
  { key: "receita_bruta",           label: "Receita Bruta" },
  { key: "deducoes",                label: "(-) Deduções" },
  { key: "receita_liquida",         label: "Receita Líquida" },
  { key: "custo_servicos",          label: "(-) Custo dos Serviços/CMV" },
  { key: "lucro_bruto",             label: "Lucro Bruto" },
  { key: "despesas_pessoal",        label: "(-) Desp. Pessoal" },
  { key: "despesas_administrativas",label: "(-) Desp. Administrativas" },
  { key: "despesas_comerciais",     label: "(-) Desp. Comerciais" },
  { key: "outras_despesas_op",      label: "(-) Outras Desp. Operacionais" },
  { key: "ebitda",                  label: "EBITDA" },
  { key: "depreciacao_amortizacao", label: "(-) Depreciação/Amortização" },
  { key: "ebit",                    label: "EBIT" },
  { key: "receitas_financeiras",    label: "Receitas Financeiras" },
  { key: "despesas_financeiras",    label: "(-) Despesas Financeiras" },
  { key: "resultado_financeiro",    label: "Resultado Financeiro" },
  { key: "lucro_antes_ir",          label: "Lucro Antes do IR/CSLL" },
  { key: "ir_csll",                 label: "(-) IR e CSLL" },
  { key: "lucro_liquido",           label: "Lucro Líquido" },
];

const BALANCO_FIELDS: { key: keyof BalancoData; label: string }[] = [
  { key: "caixa_equivalentes",    label: "Caixa e Equivalentes" },
  { key: "contas_receber",        label: "Contas a Receber" },
  { key: "estoques",              label: "Estoques" },
  { key: "outros_ativo_circ",     label: "Outros Ativos Circulantes" },
  { key: "ativo_circulante",      label: "Ativo Circulante" },
  { key: "imobilizado",           label: "Imobilizado" },
  { key: "intangivel",            label: "Intangível" },
  { key: "outros_ativo_nc",       label: "Outros Ativos Não Circulantes" },
  { key: "ativo_nao_circulante",  label: "Ativo Não Circulante" },
  { key: "ativo_total",           label: "Ativo Total" },
  { key: "fornecedores",          label: "Fornecedores" },
  { key: "obrigacoes_fiscais",    label: "Obrigações Fiscais" },
  { key: "emprestimos_cp",        label: "Empréstimos CP" },
  { key: "outros_passivo_circ",   label: "Outros Passivos Circulantes" },
  { key: "passivo_circulante",    label: "Passivo Circulante" },
  { key: "emprestimos_lp",        label: "Empréstimos LP" },
  { key: "outros_passivo_nc",     label: "Outros Passivos NC" },
  { key: "passivo_nao_circulante",label: "Passivo Não Circulante" },
  { key: "capital_social",        label: "Capital Social" },
  { key: "reservas",              label: "Reservas" },
  { key: "lucros_acumulados",     label: "Lucros Acumulados" },
  { key: "patrimonio_liquido",    label: "Patrimônio Líquido" },
  { key: "passivo_total",         label: "Passivo Total" },
];

const DFC_FIELDS: { key: keyof DfcData; label: string }[] = [
  { key: "lucro_liquido",            label: "Lucro Líquido" },
  { key: "ajustes_depreciacao",      label: "(+) Depreciação/Amortização" },
  { key: "variacao_contas_receber",  label: "Variação Contas a Receber" },
  { key: "variacao_estoques",        label: "Variação Estoques" },
  { key: "variacao_fornecedores",    label: "Variação Fornecedores" },
  { key: "outros_operacionais",      label: "Outros Operacionais" },
  { key: "caixa_operacional",        label: "Caixa das Operações" },
  { key: "aquisicao_imobilizado",    label: "(-) Aquisição de Imobilizado" },
  { key: "venda_ativo",              label: "Venda de Ativo" },
  { key: "outros_investimento",      label: "Outros Investimentos" },
  { key: "caixa_investimento",       label: "Caixa de Investimentos" },
  { key: "emprestimos_obtidos",      label: "Empréstimos Obtidos" },
  { key: "amortizacao_emprestimos",  label: "(-) Amortização Empréstimos" },
  { key: "distribuicao_lucros",      label: "(-) Distribuição de Lucros" },
  { key: "outros_financiamento",     label: "Outros Financiamentos" },
  { key: "caixa_financiamento",      label: "Caixa de Financiamentos" },
  { key: "variacao_caixa",           label: "Variação Líquida de Caixa" },
  { key: "caixa_inicial",            label: "Caixa no Início do Período" },
  { key: "caixa_final",              label: "Caixa no Fim do Período" },
];

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function periodoLabel(p: string) {
  if (p.length === 7) {
    const [y, m] = p.split("-");
    const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    return `${meses[parseInt(m) - 1]}/${y}`;
  }
  return p;
}

// ─── Geração automática da conciliação ────────────────────────────────────────

interface TxRaw { valor: number; tipo: string; plano_contas_id: string }
interface PCRaw  { id: string; nome: string; tipo: string; codigo: string }

function buildDreFromTransactions(txs: TxRaw[], pcMap: Map<string, PCRaw>): DreData {
  let receita = 0, custo = 0, pessoal = 0, adm = 0, comercial = 0;
  let fin_d = 0, fin_r = 0, outras = 0, imposto = 0;

  for (const tx of txs) {
    const pc = pcMap.get(tx.plano_contas_id);
    if (!pc) continue;
    const signed = tx.tipo === "credito" ? tx.valor : -tx.valor;
    const n = normStr(pc.nome);

    if (pc.tipo === "receita") {
      receita += signed;
    } else if (pc.tipo === "imposto") {
      imposto += signed;
    } else {
      const isDesp = pc.tipo === "despesa" || pc.tipo === "investimento";
      if (!isDesp) continue;
      if (["custo","cmv","csp","mercadoria","materia prima"].some(k => n.includes(k))) {
        custo += signed;
      } else if (["pessoal","salario","folha","pro labore","prolabore","inss","fgts","ferias"].some(k => n.includes(k))) {
        pessoal += signed;
      } else if (["financeira","juros","tarifa bancaria","iof","encargo financeiro","spread"].some(k => n.includes(k))) {
        if (signed > 0) fin_r += signed; else fin_d += signed;
      } else if (["comercial","marketing","publicidade","propaganda","comissao"].some(k => n.includes(k))) {
        comercial += signed;
      } else if (["administrativ","aluguel","contabilidade","energia","agua","internet","telefone","limpeza","seguro"].some(k => n.includes(k))) {
        adm += signed;
      } else {
        outras += signed;
      }
    }
  }

  const receita_liquida = receita;
  const lucro_bruto = receita_liquida + custo;
  const ebitda = lucro_bruto + pessoal + adm + comercial + outras;
  const resultado_financeiro = fin_r + fin_d;
  const lucro_antes_ir = ebitda + resultado_financeiro;
  const lucro_liquido = lucro_antes_ir + imposto;

  return {
    receita_bruta: receita_liquida, deducoes: 0, receita_liquida,
    custo_servicos: custo, lucro_bruto,
    despesas_pessoal: pessoal, despesas_administrativas: adm,
    despesas_comerciais: comercial, outras_despesas_op: outras,
    ebitda, depreciacao_amortizacao: 0, ebit: ebitda,
    receitas_financeiras: fin_r, despesas_financeiras: fin_d, resultado_financeiro,
    lucro_antes_ir, ir_csll: imposto, lucro_liquido,
  };
}

function buildBalanceteFromTransactions(txs: TxRaw[], pcMap: Map<string, PCRaw>): BalanceteData {
  const acc = new Map<string, { codigo: string; nome: string; debitos: number; creditos: number }>();
  for (const tx of txs) {
    const pc = pcMap.get(tx.plano_contas_id);
    if (!pc) continue;
    if (!acc.has(tx.plano_contas_id))
      acc.set(tx.plano_contas_id, { codigo: pc.codigo, nome: pc.nome, debitos: 0, creditos: 0 });
    const a = acc.get(tx.plano_contas_id)!;
    if (tx.tipo === "debito") a.debitos += tx.valor; else a.creditos += tx.valor;
  }
  const contas: BalanceteAccount[] = Array.from(acc.values())
    .map(a => ({
      codigo: a.codigo, nome: a.nome,
      nivel: (a.codigo.match(/\./g) ?? []).length + 1,
      saldo_anterior: 0,
      debitos: a.debitos, creditos: a.creditos,
      saldo_atual: a.creditos - a.debitos,
    }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
  return { contas };
}

export default function FinanceInsight() {
  const { ownerUserId } = useAuth();
  const [empresas,          setEmpresas]          = useState<Empresa[]>([]);
  const [selEmpresa,        setSelEmpresa]         = useState("");
  const [documentos,        setDocumentos]         = useState<DocumentoFinanceiro[]>([]);
  const [selPeriodo,        setSelPeriodo]         = useState("");
  const [loading,           setLoading]            = useState(false);
  const [uploadOpen,        setUploadOpen]         = useState(false);
  const [upStep,            setUpStep]             = useState<UploadStep>("select");
  const [upTipo,            setUpTipo]             = useState<"dre" | "balanco" | "balancete">("dre");
  const [upPeriodo,         setUpPeriodo]          = useState(format(new Date(), "yyyy-MM"));
  const [upFile,            setUpFile]             = useState<File | null>(null);
  const [upParsed,          setUpParsed]           = useState<DreData | BalancoData | null>(null);
  const [upEditVals,        setUpEditVals]         = useState<Record<string, string>>({});
  const [upSaving,          setUpSaving]           = useState(false);
  const [upMode,            setUpMode]             = useState<"pdf" | "manual">("pdf");
  const [dreView,           setDreView]            = useState<"completo" | "simplificado">("completo");
  const [selPeriodoComp,    setSelPeriodoComp]     = useState("");
  const [showComp,          setShowComp]           = useState(false);
  const [balanceteNivel,    setBalanceteNivel]     = useState<1|2|3|4>(4);
  const [consolidarOpen,    setConsolidarOpen]     = useState(false);
  const [consolidarAno,     setConsolidarAno]      = useState(String(new Date().getFullYear() - 1));
  const [gerarOpen,         setGerarOpen]          = useState(false);
  const [gerarPeriodo,      setGerarPeriodo]       = useState(format(new Date(), "yyyy-MM"));
  const [gerarLoading,      setGerarLoading]       = useState(false);
  const [gerarPreview,      setGerarPreview]       = useState<{ totalTx: number; dre: DreData; balancete: BalanceteData } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load empresas
  useEffect(() => {
    if (!ownerUserId) return;
    supabase.from("empresas").select("id,razao_social")
      .order("razao_social")
      .then(({ data }) => setEmpresas((data ?? []) as Empresa[]));
  }, [ownerUserId]);

  // Load documentos for selected empresa
  const loadDocs = useCallback(async (empresaId: string, resetPeriodo = false) => {
    if (!empresaId || !ownerUserId) return;
    setLoading(true);
    const { data } = await supabase
      .from("documentos_financeiros")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("owner_user_id", ownerUserId)
      .order("periodo", { ascending: false });
    const docs = (data ?? []) as DocumentoFinanceiro[];
    setDocumentos(docs);
    if (resetPeriodo) setSelPeriodo(docs.length > 0 ? docs[0].periodo : "");
    setLoading(false);
  }, [ownerUserId]);

  useEffect(() => {
    if (selEmpresa) loadDocs(selEmpresa, true);
  }, [selEmpresa, loadDocs]);

  // Docs for selected period
  const docsAtual = useMemo(() =>
    documentos.filter(d => d.periodo === selPeriodo),
  [documentos, selPeriodo]);

  const dreAtual = useMemo(() =>
    (docsAtual.find(d => d.tipo === "dre")?.dados_parseados as DreData | null) ?? null,
  [docsAtual]);

  const balancoAtual = useMemo(() =>
    (docsAtual.find(d => d.tipo === "balanco" || d.tipo === "balancete")?.dados_parseados as BalancoData | null) ?? null,
  [docsAtual]);

  // Previous period docs
  const periodoAnterior = useMemo(() => {
    if (!selPeriodo) return "";
    const parts = selPeriodo.split("-");
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 2, 1);
    return format(d, "yyyy-MM");
  }, [selPeriodo]);

  const dreAnterior = useMemo(() =>
    (documentos.find(d => d.tipo === "dre" && d.periodo === periodoAnterior)?.dados_parseados as DreData | null) ?? null,
  [documentos, periodoAnterior]);

  const balancoAnterior = useMemo(() =>
    (documentos.find(d => (d.tipo === "balanco" || d.tipo === "balancete") && d.periodo === periodoAnterior)
      ?.dados_parseados as BalancoData | null) ?? null,
  [documentos, periodoAnterior]);

  const dfcAtual = useMemo(() =>
    (docsAtual.find(d => d.tipo === "dfc")?.dados_parseados as DfcData | null) ?? null,
  [docsAtual]);

  // Balancete with account codes (tipo="balancete")
  const balanceteContas = useMemo((): BalanceteAccount[] => {
    const bd = docsAtual.find(d => d.tipo === "balancete");
    if (!bd) return [];
    const dp = bd.dados_parseados as any;
    return Array.isArray(dp?.contas) ? dp.contas : [];
  }, [docsAtual]);

  // Comparison period data
  const dreComp = useMemo(() =>
    selPeriodoComp
      ? (documentos.find(d => d.tipo === "dre" && d.periodo === selPeriodoComp)?.dados_parseados as DreData | null) ?? null
      : null,
  [documentos, selPeriodoComp]);

  const balancoComp = useMemo(() =>
    selPeriodoComp
      ? (documentos.find(d => (d.tipo === "balanco" || d.tipo === "balancete") && d.periodo === selPeriodoComp)?.dados_parseados as BalancoData | null) ?? null
      : null,
  [documentos, selPeriodoComp]);

  // Indicadores calculados
  const indicadores = useMemo(() => {
    if (!dreAtual && !balancoAtual) return null;
    const lc  = balancoAtual ? balancoAtual.ativo_circulante / (balancoAtual.passivo_circulante || 1) : null;
    const ls  = balancoAtual ? (balancoAtual.ativo_circulante - balancoAtual.estoques) / (balancoAtual.passivo_circulante || 1) : null;
    const mg  = dreAtual && dreAtual.receita_liquida ? (dreAtual.lucro_liquido / dreAtual.receita_liquida) * 100 : null;
    const mb  = dreAtual && dreAtual.receita_liquida ? (dreAtual.lucro_bruto / dreAtual.receita_liquida) * 100 : null;
    const em  = dreAtual && dreAtual.receita_liquida ? (dreAtual.ebitda / dreAtual.receita_liquida) * 100 : null;
    const roe = (balancoAtual && dreAtual && balancoAtual.patrimonio_liquido) ? (dreAtual.lucro_liquido / balancoAtual.patrimonio_liquido) * 100 : null;
    const roa = (balancoAtual && dreAtual && balancoAtual.ativo_total) ? (dreAtual.lucro_liquido / balancoAtual.ativo_total) * 100 : null;
    const end = balancoAtual && balancoAtual.ativo_total ? (balancoAtual.passivo_total / balancoAtual.ativo_total) * 100 : null;
    const cg  = balancoAtual ? balancoAtual.ativo_circulante - balancoAtual.passivo_circulante : null;
    return { lc, ls, mg, mb, em, roe, roa, end, cg };
  }, [dreAtual, balancoAtual]);

  // Diagnóstico financeiro — health score + insights
  const diagnostico = useMemo(() => {
    if (!indicadores) return null;
    const { mg, mb, em, roe, roa, lc, ls, end } = indicadores;
    let score = 0;
    const insights: Array<{ titulo: string; texto: string; status: TrafficLight }> = [];

    if (mg !== null) {
      const pts = mg > 15 ? 15 : mg > 8 ? 10 : mg > 3 ? 5 : 0;
      score += pts;
      insights.push({
        titulo: "Margem Líquida",
        texto: mg > 15
          ? `Excelente! A empresa converte ${mg.toFixed(1)}% do faturamento em lucro líquido, bem acima da média do setor.`
          : mg > 8
          ? `Boa margem líquida de ${mg.toFixed(1)}%. Há espaço para otimização de custos e despesas.`
          : mg > 0
          ? `Margem líquida de ${mg.toFixed(1)}% está abaixo do ideal. Recomendamos análise de custos operacionais.`
          : `Margem líquida negativa (${mg.toFixed(1)}%). A empresa está operando com prejuízo. Ação imediata necessária.`,
        status: mg > 8 ? "green" : mg > 3 ? "yellow" : "red",
      });
    }
    if (mb !== null) {
      const pts = mb > 40 ? 10 : mb > 25 ? 7 : mb > 10 ? 3 : 0;
      score += pts;
      insights.push({
        titulo: "Margem Bruta",
        texto: mb > 40
          ? `Margem bruta de ${mb.toFixed(1)}% demonstra forte eficiência na geração de valor sobre os custos diretos.`
          : mb > 25
          ? `Margem bruta de ${mb.toFixed(1)}% é satisfatória. Monitore os custos de serviço ou mercadorias.`
          : `Margem bruta de ${mb.toFixed(1)}% indica pressão nos custos diretos. Revise precificação e fornecedores.`,
        status: mb > 30 ? "green" : mb > 15 ? "yellow" : "red",
      });
    }
    if (em !== null) {
      const pts = em > 20 ? 15 : em > 12 ? 10 : em > 5 ? 5 : 0;
      score += pts;
      insights.push({
        titulo: "EBITDA",
        texto: em > 20
          ? `EBITDA de ${em.toFixed(1)}% indica alta capacidade operacional de geração de caixa.`
          : em > 12
          ? `EBITDA de ${em.toFixed(1)}% está dentro de parâmetros saudáveis para a maioria dos setores.`
          : em > 5
          ? `EBITDA de ${em.toFixed(1)}% está abaixo do recomendado. Despesas operacionais merecem atenção.`
          : `EBITDA muito baixo (${em.toFixed(1)}%). A geração de caixa operacional está comprometida.`,
        status: em > 15 ? "green" : em > 8 ? "yellow" : "red",
      });
    }
    if (lc !== null) {
      const pts = lc > 2 ? 20 : lc > 1.5 ? 15 : lc > 1 ? 8 : 0;
      score += pts;
      insights.push({
        titulo: "Liquidez Corrente",
        texto: lc > 2
          ? `Excelente liquidez corrente de ${lc.toFixed(2)}x. A empresa tem ampla capacidade de honrar obrigações de curto prazo.`
          : lc > 1.5
          ? `Boa liquidez de ${lc.toFixed(2)}x. A empresa consegue cobrir suas dívidas circulantes com folga.`
          : lc > 1
          ? `Liquidez de ${lc.toFixed(2)}x é positiva, mas com margem estreita. Acompanhe o fluxo de caixa.`
          : `Liquidez corrente de ${lc.toFixed(2)}x abaixo de 1. A empresa pode ter dificuldade em pagar dívidas de curto prazo.`,
        status: lc > 1.5 ? "green" : lc > 1 ? "yellow" : "red",
      });
    }
    if (end !== null) {
      const pts = end < 30 ? 20 : end < 50 ? 14 : end < 65 ? 7 : 0;
      score += pts;
      insights.push({
        titulo: "Endividamento",
        texto: end < 30
          ? `Endividamento baixo de ${end.toFixed(1)}%. A empresa financia a maior parte de seus ativos com capital próprio.`
          : end < 50
          ? `Endividamento de ${end.toFixed(1)}% está em nível moderado. Equilibrio entre capital próprio e terceiros.`
          : end < 65
          ? `Endividamento de ${end.toFixed(1)}% merece atenção. Alavancagem elevada pode gerar pressão financeira.`
          : `Endividamento alto de ${end.toFixed(1)}%. Riscos significativos associados ao nível de alavancagem.`,
        status: end < 40 ? "green" : end < 60 ? "yellow" : "red",
      });
    }
    if (roe !== null) {
      const pts = roe > 20 ? 10 : roe > 12 ? 7 : roe > 5 ? 3 : 0;
      score += pts;
      insights.push({
        titulo: "Retorno sobre PL (ROE)",
        texto: roe > 20
          ? `ROE de ${roe.toFixed(1)}% representa excelente retorno para os sócios, superando a maioria dos benchmarks.`
          : roe > 12
          ? `ROE de ${roe.toFixed(1)}% é satisfatório. Os sócios estão obtendo retorno acima da taxa básica.`
          : roe > 0
          ? `ROE de ${roe.toFixed(1)}% é modesto. Os sócios podem obter melhor retorno em outras aplicações.`
          : `ROE negativo indica que o patrimônio dos sócios está sendo erodido.`,
        status: roe > 15 ? "green" : roe > 8 ? "yellow" : "red",
      });
    }
    if (roa !== null) {
      const pts = roa > 10 ? 10 : roa > 5 ? 7 : roa > 2 ? 3 : 0;
      score += pts;
      insights.push({
        titulo: "Retorno sobre Ativos (ROA)",
        texto: roa > 10
          ? `Excelente ROA de ${roa.toFixed(1)}%. Os ativos estão sendo utilizados com alta eficiência.`
          : roa > 5
          ? `ROA de ${roa.toFixed(1)}% demonstra boa eficiência na utilização dos ativos totais.`
          : roa > 0
          ? `ROA de ${roa.toFixed(1)}% indica potencial de melhoria na produtividade dos ativos.`
          : `ROA negativo sugere que os ativos da empresa não estão gerando valor suficiente.`,
        status: roa > 8 ? "green" : roa > 3 ? "yellow" : "red",
      });
    }

    const maxScore = 100;
    const nivel: "excelente" | "bom" | "regular" | "critico" =
      score >= 80 ? "excelente" : score >= 60 ? "bom" : score >= 35 ? "regular" : "critico";
    const nivelColor = { excelente: GREEN, bom: BLUE, regular: AMBER, critico: RED }[nivel];
    const nivelLabel = { excelente: "Excelente", bom: "Bom", regular: "Regular", critico: "Crítico" }[nivel];

    return { score, maxScore, nivel, nivelColor, nivelLabel, insights };
  }, [indicadores]);

  // Evolução histórica (últimos 12 meses)
  const evolucao = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const p = format(subMonths(new Date(), 11 - i), "yyyy-MM");
      const dre = documentos.find(d => d.tipo === "dre" && d.periodo === p)?.dados_parseados as DreData | null;
      const bal = documentos.find(d => (d.tipo === "balanco" || d.tipo === "balancete") && d.periodo === p)
        ?.dados_parseados as BalancoData | null;
      return {
        mes: periodoLabel(p),
        receita: dre?.receita_liquida ?? null,
        lucro: dre?.lucro_liquido ?? null,
        ebitda: dre?.ebitda ?? null,
        ativo: bal?.ativo_total ?? null,
      };
    });
  }, [documentos]);

  // ── Annual consolidation ─────────────────────────────────────────────────────

  async function consolidarAnual() {
    if (!selEmpresa || !ownerUserId) return;
    const ano = consolidarAno;
    const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`);
    const dresMes = documentos.filter(d => d.tipo === "dre" && meses.includes(d.periodo));
    if (dresMes.length === 0) { toast.error("Nenhum DRE mensal encontrado para " + ano); return; }

    // Sum all monthly DRE values
    const keys: (keyof DreData)[] = [
      "receita_bruta","deducoes","receita_liquida","custo_servicos","lucro_bruto",
      "despesas_pessoal","despesas_administrativas","despesas_comerciais","outras_despesas_op",
      "ebitda","depreciacao_amortizacao","ebit","receitas_financeiras","despesas_financeiras",
      "resultado_financeiro","lucro_antes_ir","ir_csll","lucro_liquido",
    ];
    const anual: Record<string, number> = {};
    for (const k of keys) anual[k] = 0;
    for (const doc of dresMes) {
      const d = doc.dados_parseados as DreData;
      if (!d) continue;
      for (const k of keys) anual[k] = (anual[k] ?? 0) + (d[k] ?? 0);
    }

    // Upsert annual document
    const existing = documentos.find(d => d.tipo === "dre" && d.periodo === ano);
    if (existing) {
      await supabase.from("documentos_financeiros").update({ dados_parseados: anual }).eq("id", existing.id);
    } else {
      await supabase.from("documentos_financeiros").insert({
        empresa_id: selEmpresa, owner_user_id: ownerUserId,
        tipo: "dre", periodo: ano, dados_parseados: anual,
      });
    }
    toast.success(`DRE Anual ${ano} consolidada a partir de ${dresMes.length} mês(es)!`);
    setConsolidarOpen(false);
    loadDocs(selEmpresa, false);
  }

  // ── Upload handlers ──────────────────────────────────────────────────────────

  function openUpload() {
    setUpStep("select");
    setUpTipo("dre");
    setUpMode("pdf");
    setUpPeriodo(format(new Date(), "yyyy-MM"));
    setUpFile(null);
    setUpParsed(null);
    setUpEditVals({});
    setUploadOpen(true);
  }

  function handleManualEntry() {
    const fields = upTipo === "dre" ? DRE_FIELDS : upTipo === "dfc" ? DFC_FIELDS : BALANCO_FIELDS;
    const initVals: Record<string, string> = {};
    for (const { key } of fields) initVals[key] = "0";
    setUpEditVals(initVals);
    setUpStep("review");
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUpFile(f);
    setUpStep("parsing");
    try {
      const text = await extractPdfText(f);
      const parsed =
        upTipo === "dre"       ? parseDRE(text) :
        upTipo === "dfc"       ? parseDFC(text) :
        upTipo === "balancete" ? parseBalanceteComCodigos(text) :
                                 parseBalanco(text);
      setUpParsed(parsed);
      const fields = upTipo === "dre" ? DRE_FIELDS : upTipo === "dfc" ? DFC_FIELDS : upTipo === "balancete" ? [] : BALANCO_FIELDS;
      const initVals: Record<string, string> = {};
      if (upTipo === "balancete") {
        // Balancete stores account tree; show as JSON summary
        setUpEditVals({ _json: JSON.stringify(parsed, null, 2) });
        setUpStep("review");
        return;
      }
      for (const { key } of fields) {
        initVals[key] = String((parsed as any)[key] ?? 0);
      }
      setUpEditVals(initVals);
      setUpStep("review");
    } catch {
      toast.error("Erro ao ler o PDF. Verifique o arquivo.");
      setUpStep("select");
    }
  }

  async function handleSaveDoc() {
    if (!selEmpresa || !ownerUserId) return;
    setUpSaving(true);
    try {
      let dados: any;
      if (upTipo === "balancete" && upEditVals._json) {
        dados = JSON.parse(upEditVals._json);
      } else {
        const fields = upTipo === "dre" ? DRE_FIELDS : upTipo === "dfc" ? DFC_FIELDS : BALANCO_FIELDS;
        const d: Record<string, number> = {};
        for (const { key } of fields) d[key] = parseFloat(upEditVals[key] ?? "0") || 0;
        dados = d;
      }

      let arquivo_url: string | null = null;
      if (upFile) {
        const path = `${ownerUserId}/${selEmpresa}/${upPeriodo}_${upTipo}_${Date.now()}.pdf`;
        const { data: storeData } = await supabase.storage
          .from("documentos-financeiros").upload(path, upFile, { upsert: true });
        if (storeData) arquivo_url = storeData.path;
      }

      await supabase.from("documentos_financeiros").insert({
        empresa_id: selEmpresa,
        owner_user_id: ownerUserId,
        tipo: upTipo as string,
        periodo: upPeriodo,
        dados_parseados: dados,
        arquivo_url,
        arquivo_nome: upFile?.name ?? null,
      } as any);
      toast.success("Documento importado com sucesso!");
      setUploadOpen(false);
      loadDocs(selEmpresa, false);
    } catch {
      toast.error("Erro ao salvar o documento.");
    } finally {
      setUpSaving(false);
    }
  }

  async function handleDeleteDoc(id: string) {
    await supabase.from("documentos_financeiros").delete().eq("id", id);
    loadDocs(selEmpresa, false);
    toast.success("Documento removido.");
  }

  async function previaConciliacao() {
    if (!selEmpresa || !gerarPeriodo) return;
    setGerarLoading(true);
    setGerarPreview(null);
    try {
      const { data: contas } = await supabase
        .from("contas_bancarias").select("id").eq("empresa_id", selEmpresa);
      if (!contas?.length) { toast.error("Nenhuma conta bancária nesta empresa."); return; }

      const [y, m] = gerarPeriodo.split("-").map(Number);
      const dataFim = new Date(y, m, 0).toISOString().slice(0, 10);
      const dataInicio = `${y}-${String(m).padStart(2, "0")}-01`;

      const { data: txs } = await supabase
        .from("transacoes_bancarias")
        .select("valor,tipo,plano_contas_id")
        .in("conta_bancaria_id", contas.map(c => c.id))
        .gte("data", dataInicio).lte("data", dataFim)
        .not("plano_contas_id", "is", null);

      if (!txs?.length) { toast.error("Nenhuma transação categorizada neste período."); return; }

      const pcIds = [...new Set(txs.map(t => t.plano_contas_id as string))];
      const { data: pcs } = await supabase
        .from("plano_contas").select("id,nome,tipo,codigo").in("id", pcIds);
      const pcMap = new Map((pcs ?? []).map(pc => [pc.id, pc as PCRaw]));

      setGerarPreview({
        totalTx: txs.length,
        dre: buildDreFromTransactions(txs as TxRaw[], pcMap),
        balancete: buildBalanceteFromTransactions(txs as TxRaw[], pcMap),
      });
    } finally {
      setGerarLoading(false);
    }
  }

  async function salvarDaConciliacao() {
    if (!selEmpresa || !ownerUserId || !gerarPreview) return;
    setGerarLoading(true);
    try {
      await supabase.from("documentos_financeiros").insert([
        {
          empresa_id: selEmpresa, owner_user_id: ownerUserId,
          tipo: "dre", periodo: gerarPeriodo,
          dados_parseados: gerarPreview.dre,
          arquivo_url: null,
          arquivo_nome: `DRE da Conciliação — ${periodoLabel(gerarPeriodo)}`,
        },
        {
          empresa_id: selEmpresa, owner_user_id: ownerUserId,
          tipo: "balancete", periodo: gerarPeriodo,
          dados_parseados: gerarPreview.balancete,
          arquivo_url: null,
          arquivo_nome: `Balancete da Conciliação — ${periodoLabel(gerarPeriodo)}`,
        },
      ] as any[]);
      toast.success("DRE e Balancete gerados e salvos!");
      setGerarOpen(false);
      setGerarPreview(null);
      loadDocs(selEmpresa, false);
    } catch {
      toast.error("Erro ao salvar documentos.");
    } finally {
      setGerarLoading(false);
    }
  }

  // ── PDF Export ───────────────────────────────────────────────────────────────

  function exportPDF() {
    if (!dreAtual && !balancoAtual) return;
    const empresa = empresas.find(e => e.id === selEmpresa);
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = 210;

    // Header navy
    doc.setFillColor(16, 20, 61);
    doc.rect(0, 0, W, 35, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Finance Insight", 15, 15);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(empresa?.razao_social ?? "", 15, 23);
    doc.text(`Período: ${periodoLabel(selPeriodo)}`, 15, 30);

    // Red accent line
    doc.setFillColor(237, 50, 55);
    doc.rect(0, 35, W, 2, "F");

    let y = 48;
    doc.setTextColor(16, 20, 61);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Demonstração do Resultado", 15, y); y += 8;

    if (dreAtual) {
      const base = dreAtual.receita_liquida || 1;
      const rows: [string, number][] = [
        ["Receita Bruta",       dreAtual.receita_bruta],
        ["(-) Deduções",        dreAtual.deducoes],
        ["Receita Líquida",     dreAtual.receita_liquida],
        ["(-) Custo Serv./CMV", dreAtual.custo_servicos],
        ["Lucro Bruto",         dreAtual.lucro_bruto],
        ["EBITDA",              dreAtual.ebitda],
        ["EBIT",                dreAtual.ebit],
        ["Resultado Financeiro",dreAtual.resultado_financeiro],
        ["Lucro Líquido",       dreAtual.lucro_liquido],
      ];
      doc.setFontSize(9);
      for (const [label, val] of rows) {
        const isBold = ["Receita Líquida","Lucro Bruto","EBITDA","Lucro Líquido"].includes(label);
        doc.setFont("helvetica", isBold ? "bold" : "normal");
        doc.setTextColor(50, 50, 50);
        doc.text(label, 15, y);
        doc.text(fmtR(val), 150, y, { align: "right" });
        doc.setTextColor(120, 120, 120);
        doc.text(fmtPct((val / base) * 100), 195, y, { align: "right" });
        y += 6;
      }
    }

    y += 5;
    if (indicadores) {
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(16, 20, 61);
      doc.text("Indicadores Financeiros", 15, y); y += 8;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(50, 50, 50);
      const kpis: [string, number | null, string][] = [
        ["Margem Líquida",    indicadores.mg,  "%"],
        ["Margem Bruta",      indicadores.mb,  "%"],
        ["Margem EBITDA",     indicadores.em,  "%"],
        ["ROE",               indicadores.roe, "%"],
        ["ROA",               indicadores.roa, "%"],
        ["Liquidez Corrente", indicadores.lc,  "x"],
        ["Endividamento",     indicadores.end, "%"],
      ];
      for (const [label, val, unit] of kpis) {
        if (val === null) continue;
        doc.text(label, 15, y);
        doc.text(`${val.toFixed(2)}${unit}`, 150, y, { align: "right" });
        y += 6;
      }
    }

    // Diagnóstico section
    if (diagnostico) {
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(16, 20, 61);
      doc.text("Diagnóstico Financeiro", 15, y); y += 8;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...hexToRgb(diagnostico.nivelColor) as [number,number,number]);
      doc.text(`Score de Saúde Financeira: ${diagnostico.score}/100 — ${diagnostico.nivelLabel}`, 15, y); y += 7;
      doc.setTextColor(50, 50, 50);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      for (const ins of diagnostico.insights) {
        if (y > 255) { doc.addPage(); y = 20; }
        doc.setFont("helvetica", "bold");
        doc.text(`• ${ins.titulo}:`, 15, y);
        doc.setFont("helvetica", "normal");
        const lines = doc.splitTextToSize(ins.texto, 170);
        y += 5;
        doc.text(lines, 20, y);
        y += lines.length * 4.5 + 2;
      }
    }

    // Footer
    doc.setFillColor(16, 20, 61);
    doc.rect(0, 280, W, 17, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Diretriz Contabilidade | (85) 99999-9999 | www.diretriz.cnt.br", W / 2, 288, { align: "center" });
    doc.text(`Relatório gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}`, W / 2, 293, { align: "center" });

    doc.save(`FinanceInsight_${empresa?.razao_social ?? "empresa"}_${selPeriodo}.pdf`);
  }

  // ── Periodos disponíveis ─────────────────────────────────────────────────────

  const periodosDisponiveis = useMemo(() => {
    const set = new Set(documentos.map(d => d.periodo));
    return Array.from(set).sort().reverse();
  }, [documentos]);

  // ─────────────────────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Finance Insight</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Análise financeira inteligente por empresa e período
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => { setGerarPreview(null); setGerarOpen(true); }}
            className="border-[#10143D] text-[#10143D] hover:bg-[#10143D] hover:text-white"
          >
            <Zap className="h-4 w-4 mr-2" /> Gerar da Conciliação
          </Button>
          <Button onClick={openUpload} style={{ background: NAVY }} className="text-white hover:opacity-90">
            <Plus className="h-4 w-4 mr-2" /> Importar Documento
          </Button>
        </div>
      </div>

      {/* ── Selectors bar ── */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-50 rounded-xl border">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <Select value={selEmpresa} onValueChange={setSelEmpresa}>
            <SelectTrigger className="w-64 bg-white">
              <SelectValue placeholder="Selecionar empresa" />
            </SelectTrigger>
            <SelectContent>
              {empresas.map(e => (
                <SelectItem key={e.id} value={e.id}>{e.razao_social}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {periodosDisponiveis.length > 0 && (
          <div className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-muted-foreground" />
            <Select value={selPeriodo} onValueChange={setSelPeriodo}>
              <SelectTrigger className="w-40 bg-white">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                {periodosDisponiveis.map(p => (
                  <SelectItem key={p} value={p}>{periodoLabel(p)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {selEmpresa && (
          <Button variant="ghost" size="sm" onClick={() => loadDocs(selEmpresa, false)}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}

        {/* Comparison period */}
        {periodosDisponiveis.length > 1 && selEmpresa && (
          <div className="flex items-center gap-2 ml-2 pl-2 border-l">
            <Button
              variant={showComp ? "default" : "outline"} size="sm"
              className="h-8 text-xs"
              style={showComp ? { background: NAVY } : {}}
              onClick={() => { setShowComp(!showComp); if (showComp) setSelPeriodoComp(""); }}
            >
              Comparar Períodos
            </Button>
            {showComp && (
              <Select value={selPeriodoComp} onValueChange={setSelPeriodoComp}>
                <SelectTrigger className="w-36 h-8 text-xs bg-white">
                  <SelectValue placeholder="2º período" />
                </SelectTrigger>
                <SelectContent>
                  {periodosDisponiveis.filter(p => p !== selPeriodo).map(p => (
                    <SelectItem key={p} value={p}>{periodoLabel(p)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* Consolidar anual */}
        {selEmpresa && documentos.filter(d => d.tipo === "dre").length >= 2 && (
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setConsolidarOpen(true)}>
            Consolidar Anual
          </Button>
        )}

        {(dreAtual || balancoAtual) && (
          <Button variant="outline" size="sm" onClick={exportPDF} className="ml-auto">
            <Download className="h-4 w-4 mr-2" /> Exportar PDF
          </Button>
        )}
      </div>

      {/* ── Empty state ── */}
      {!selEmpresa && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-16 w-16 rounded-full flex items-center justify-center mb-4"
            style={{ background: `${NAVY}12` }}>
            <BarChart2 className="h-8 w-8" style={{ color: NAVY }} />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Selecione uma empresa</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Escolha uma empresa para visualizar os indicadores financeiros
          </p>
        </div>
      )}

      {selEmpresa && loading && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      )}

      {selEmpresa && !loading && documentos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed rounded-xl">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">Nenhum documento importado</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Importe um DRE ou Balanço Patrimonial para começar a análise
          </p>
          <Button className="mt-4" onClick={openUpload} style={{ background: NAVY }}>
            <Upload className="h-4 w-4 mr-2" /> Importar Primeiro Documento
          </Button>
        </div>
      )}

      {/* ── Main content ── */}
      {selEmpresa && !loading && (dreAtual || balancoAtual) && (
        <Tabs defaultValue="visao" className="space-y-4">
          <TabsList className="bg-slate-100 flex flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="visao">Visão Executiva</TabsTrigger>
            <TabsTrigger value="dre" disabled={!dreAtual}>DRE</TabsTrigger>
            <TabsTrigger value="dfc" disabled={!dfcAtual}>Fluxo de Caixa</TabsTrigger>
            <TabsTrigger value="balanco" disabled={!balancoAtual && balanceteContas.length === 0}>Balanço/Balancete</TabsTrigger>
            <TabsTrigger value="indicadores" disabled={!indicadores}>Indicadores</TabsTrigger>
            <TabsTrigger value="evolucao">Evolução</TabsTrigger>
            <TabsTrigger value="diagnostico" disabled={!diagnostico}>Diagnóstico</TabsTrigger>
            <TabsTrigger value="documentos">Documentos</TabsTrigger>
          </TabsList>

          {/* ── Visão Executiva ── */}
          <TabsContent value="visao" className="space-y-4">
            {/* KPI grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              {dreAtual && (
                <>
                  <KpiCard title="Receita Bruta" value={fmtR(dreAtual.receita_bruta)}
                    trend={dreAnterior ? pct(dreAtual.receita_bruta, dreAnterior.receita_bruta) : undefined}
                    icon={TrendingUp} color={NAVY} />
                  <KpiCard title="Receita Líquida" value={fmtR(dreAtual.receita_liquida)}
                    trend={dreAnterior ? pct(dreAtual.receita_liquida, dreAnterior.receita_liquida) : undefined}
                    icon={DollarSign} color={BLUE} />
                  <KpiCard title="Lucro Líquido" value={fmtR(dreAtual.lucro_liquido)}
                    trend={dreAnterior ? pct(dreAtual.lucro_liquido, dreAnterior.lucro_liquido) : undefined}
                    icon={dreAtual.lucro_liquido >= 0 ? TrendingUp : TrendingDown}
                    color={dreAtual.lucro_liquido >= 0 ? GREEN : RED} />
                  <KpiCard title="Margem Líquida" value={fmtPct(dreAtual.receita_liquida ? (dreAtual.lucro_liquido / dreAtual.receita_liquida) * 100 : 0)}
                    subtitle="sobre receita líquida"
                    icon={Activity} color={AMBER} />
                  <KpiCard title="EBITDA" value={fmtR(dreAtual.ebitda)}
                    trend={dreAnterior ? pct(dreAtual.ebitda, dreAnterior.ebitda) : undefined}
                    icon={BarChart2} color="#8b5cf6" />
                </>
              )}
              {balancoAtual && (
                <KpiCard title="Capital de Giro" value={fmtR(balancoAtual.ativo_circulante - balancoAtual.passivo_circulante)}
                  subtitle="Ativo Circ. − Passivo Circ."
                  icon={balancoAtual.ativo_circulante > balancoAtual.passivo_circulante ? CheckCircle : AlertTriangle}
                  color={balancoAtual.ativo_circulante > balancoAtual.passivo_circulante ? GREEN : RED} />
              )}
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Receita vs Despesas bar */}
              {dreAtual && (
                <Card className="lg:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Composição do Resultado</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={[
                        { name: "Receita Líquida",   valor: dreAtual.receita_liquida,         fill: BLUE  },
                        { name: "Lucro Bruto",        valor: dreAtual.lucro_bruto,             fill: NAVY  },
                        { name: "EBITDA",             valor: dreAtual.ebitda,                  fill: AMBER },
                        { name: "EBIT",               valor: dreAtual.ebit,                    fill: "#8b5cf6" },
                        { name: "Lucro Líquido",      valor: dreAtual.lucro_liquido,           fill: dreAtual.lucro_liquido >= 0 ? GREEN : RED },
                      ]} barSize={36}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={v => fmtR(v).replace("R$", "R$ ")} width={80} tick={{ fontSize: 10 }} />
                        <ReTooltip formatter={(v: any) => fmtR(v)} />
                        <Bar dataKey="valor" radius={[4,4,0,0]}>
                          {[dreAtual.receita_liquida, dreAtual.lucro_bruto, dreAtual.ebitda, dreAtual.ebit, dreAtual.lucro_liquido]
                            .map((v, i) => <Cell key={i} fill={[BLUE, NAVY, AMBER, "#8b5cf6", v >= 0 ? GREEN : RED][i]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Despesas donut */}
              {dreAtual && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Estrutura de Despesas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie data={[
                          { name: "Custo Serv.",      value: Math.abs(dreAtual.custo_servicos),          fill: NAVY },
                          { name: "Pessoal",           value: Math.abs(dreAtual.despesas_pessoal),        fill: RED  },
                          { name: "Administrativo",    value: Math.abs(dreAtual.despesas_administrativas),fill: BLUE },
                          { name: "Comercial",         value: Math.abs(dreAtual.despesas_comerciais),     fill: AMBER},
                          { name: "Financeiro",        value: Math.abs(dreAtual.despesas_financeiras),    fill: GRAY },
                        ].filter(d => d.value > 0)}
                          dataKey="value" cx="50%" cy="50%" innerRadius={55} outerRadius={90}>
                          {[NAVY,RED,BLUE,AMBER,GRAY].map((c,i) => <Cell key={i} fill={c} />)}
                        </Pie>
                        <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                        <ReTooltip formatter={(v: any) => fmtR(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Balanço overview */}
            {balancoAtual && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Ativo Total</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    <KpiCard title="Ativo Circulante" value={fmtR(balancoAtual.ativo_circulante)}
                      icon={TrendingUp} color={GREEN} small />
                    <KpiCard title="Ativo Não Circulante" value={fmtR(balancoAtual.ativo_nao_circulante)}
                      icon={TrendingUp} color={BLUE} small />
                    <div className="pt-1 border-t font-bold text-sm flex justify-between">
                      <span>Total</span><span>{fmtR(balancoAtual.ativo_total)}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Passivo</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    <KpiCard title="Passivo Circulante" value={fmtR(balancoAtual.passivo_circulante)}
                      icon={TrendingDown} color={RED} small />
                    <KpiCard title="Passivo Não Circulante" value={fmtR(balancoAtual.passivo_nao_circulante)}
                      icon={TrendingDown} color={AMBER} small />
                    <div className="pt-1 border-t font-bold text-sm flex justify-between">
                      <span>Total</span><span>{fmtR(balancoAtual.passivo_total)}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Patrimônio Líquido</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold mt-2" style={{ color: NAVY }}>
                      {fmtR(balancoAtual.patrimonio_liquido)}
                    </div>
                    {balancoAnterior && (
                      <p className={`text-sm mt-1 ${pct(balancoAtual.patrimonio_liquido, balancoAnterior.patrimonio_liquido) >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {fmtP(pct(balancoAtual.patrimonio_liquido, balancoAnterior.patrimonio_liquido))} vs período anterior
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* ── DRE ── */}
          <TabsContent value="dre">
            {dreAtual && (() => {
              const ant = dreAnterior;
              const hasAnt = !!ant;
              const cols = hasAnt ? 5 : 3;
              const base = dreAtual.receita_liquida || 1;
              const simpleRows: Array<{ label: string; key: keyof DreData; bold?: boolean; indent?: number; sep?: boolean }> = [
                { label: "Receita Bruta",           key: "receita_bruta",       bold: true },
                { label: "Receita Líquida",          key: "receita_liquida",     bold: true, sep: true },
                { label: "Lucro Bruto",              key: "lucro_bruto",         bold: true, sep: true },
                { label: "EBITDA",                   key: "ebitda",              bold: true, sep: true },
                { label: "EBIT",                     key: "ebit",                bold: true, sep: true },
                { label: "Lucro Líquido",            key: "lucro_liquido",       bold: true, sep: true },
              ];
              const fullRows: Array<{ label: string; key: keyof DreData; bold?: boolean; indent?: number; sep?: boolean }> = [
                { label: "Receita Bruta",                    key: "receita_bruta",           bold: true },
                { label: "(-) Deduções",                     key: "deducoes",                indent: 1 },
                { label: "Receita Líquida",                  key: "receita_liquida",         bold: true, sep: true },
                { label: "(-) Custo dos Serv. / CMV",        key: "custo_servicos",          indent: 1 },
                { label: "Lucro Bruto",                      key: "lucro_bruto",             bold: true, sep: true },
                { label: "(-) Desp. Pessoal",                key: "despesas_pessoal",        indent: 1 },
                { label: "(-) Desp. Administrativas",        key: "despesas_administrativas",indent: 1 },
                { label: "(-) Desp. Comerciais",             key: "despesas_comerciais",     indent: 1 },
                { label: "(-) Outras Desp. Operacionais",    key: "outras_despesas_op",      indent: 1 },
                { label: "EBITDA",                           key: "ebitda",                  bold: true, sep: true },
                { label: "(-) Depreciação/Amortização",      key: "depreciacao_amortizacao", indent: 1 },
                { label: "EBIT",                             key: "ebit",                    bold: true, sep: true },
                { label: "Receitas Financeiras",             key: "receitas_financeiras",    indent: 1 },
                { label: "(-) Despesas Financeiras",         key: "despesas_financeiras",    indent: 1 },
                { label: "Resultado Financeiro",             key: "resultado_financeiro",    sep: true },
                { label: "Lucro Antes do IR/CSLL",           key: "lucro_antes_ir",          bold: true, sep: true },
                { label: "(-) IR e CSLL",                    key: "ir_csll",                 indent: 1 },
                { label: "Lucro Líquido",                    key: "lucro_liquido",           bold: true, sep: true },
              ];
              const rows = dreView === "simplificado" ? simpleRows : fullRows;
              return (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <FileText className="h-4 w-4" style={{ color: NAVY }} />
                        DRE — {periodoLabel(selPeriodo)}
                        {hasAnt && <span className="text-sm font-normal text-muted-foreground">vs {periodoLabel(periodoAnterior)}</span>}
                      </CardTitle>
                      <div className="flex items-center gap-1 text-xs">
                        <Button size="sm" variant={dreView === "simplificado" ? "default" : "outline"}
                          className="h-7 px-3" onClick={() => setDreView("simplificado")}>
                          Simplificado
                        </Button>
                        <Button size="sm" variant={dreView === "completo" ? "default" : "outline"}
                          className="h-7 px-3" onClick={() => setDreView("completo")}>
                          Completo
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b-2 text-left">
                            <th className="pb-2 font-semibold text-muted-foreground">Descrição</th>
                            {hasAnt && <th className="pb-2 font-semibold text-muted-foreground text-right">{periodoLabel(periodoAnterior)}</th>}
                            <th className="pb-2 font-semibold text-muted-foreground text-right">{periodoLabel(selPeriodo)}</th>
                            {hasAnt && <th className="pb-2 font-semibold text-muted-foreground text-right">∆%</th>}
                            <th className="pb-2 font-semibold text-muted-foreground text-right">% RL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(r => (
                            <DreLinha
                              key={r.key}
                              label={r.label}
                              valor={dreAtual[r.key] as number}
                              valorAnt={hasAnt ? (ant![r.key] as number) : undefined}
                              base={base}
                              bold={r.bold}
                              indent={r.indent}
                              separator={r.sep}
                              cols={cols}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}
          </TabsContent>

          {/* ── Fluxo de Caixa (DFC) ── */}
          <TabsContent value="dfc">
            {dfcAtual && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Summary KPIs */}
                <div className="lg:col-span-3 grid grid-cols-3 gap-3">
                  <KpiCard title="Caixa Operacional" value={fmtR(dfcAtual.caixa_operacional)}
                    icon={dfcAtual.caixa_operacional >= 0 ? TrendingUp : TrendingDown}
                    color={dfcAtual.caixa_operacional >= 0 ? GREEN : RED} />
                  <KpiCard title="Caixa de Investimentos" value={fmtR(dfcAtual.caixa_investimento)}
                    icon={Activity} color={BLUE} />
                  <KpiCard title="Caixa de Financiamentos" value={fmtR(dfcAtual.caixa_financiamento)}
                    icon={dfcAtual.caixa_financiamento >= 0 ? TrendingUp : TrendingDown}
                    color={AMBER} />
                </div>

                {/* DFC Table */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Activity className="h-4 w-4" style={{ color: NAVY }} />
                      Demonstração do Fluxo de Caixa — {periodoLabel(selPeriodo)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <table className="w-full text-sm">
                      <tbody>
                        {[
                          { label: "Lucro Líquido",               val: dfcAtual.lucro_liquido,           bold: true, indent: 0, section: "Atividades Operacionais" },
                          { label: "(+) Depreciação/Amortização",  val: dfcAtual.ajustes_depreciacao,     indent: 1 },
                          { label: "Variação Contas a Receber",    val: dfcAtual.variacao_contas_receber, indent: 1 },
                          { label: "Variação Estoques",            val: dfcAtual.variacao_estoques,       indent: 1 },
                          { label: "Variação Fornecedores",        val: dfcAtual.variacao_fornecedores,   indent: 1 },
                          { label: "Outros Operacionais",          val: dfcAtual.outros_operacionais,     indent: 1 },
                          { label: "CAIXA OPERACIONAL",            val: dfcAtual.caixa_operacional,       bold: true, sep: true },
                          { label: "(-) Aquisição de Imobilizado", val: dfcAtual.aquisicao_imobilizado,   indent: 1, section: "Atividades de Investimento" },
                          { label: "Venda de Ativo",               val: dfcAtual.venda_ativo,             indent: 1 },
                          { label: "Outros Investimentos",         val: dfcAtual.outros_investimento,     indent: 1 },
                          { label: "CAIXA DE INVESTIMENTOS",       val: dfcAtual.caixa_investimento,      bold: true, sep: true },
                          { label: "Empréstimos Obtidos",          val: dfcAtual.emprestimos_obtidos,     indent: 1, section: "Atividades de Financiamento" },
                          { label: "(-) Amortização Empréstimos",  val: dfcAtual.amortizacao_emprestimos, indent: 1 },
                          { label: "(-) Distribuição de Lucros",   val: dfcAtual.distribuicao_lucros,     indent: 1 },
                          { label: "Outros Financiamentos",        val: dfcAtual.outros_financiamento,    indent: 1 },
                          { label: "CAIXA DE FINANCIAMENTOS",      val: dfcAtual.caixa_financiamento,     bold: true, sep: true },
                          { label: "VARIAÇÃO LÍQUIDA DE CAIXA",    val: dfcAtual.variacao_caixa,          bold: true, sep: true, hl: true },
                          { label: "Caixa Inicial",                val: dfcAtual.caixa_inicial,           indent: 1 },
                          { label: "CAIXA FINAL",                  val: dfcAtual.caixa_final,             bold: true, sep: true },
                        ].map(({ label, val, bold, indent = 0, sep, section, hl }, i) => (
                          <tr key={i} className={hl ? "bg-blue-50 font-bold" : bold ? "font-semibold bg-slate-50" : "hover:bg-slate-50/50"}>
                            {sep && !hl && <td colSpan={2}><div className="border-t border-gray-200 my-0.5" /></td>}
                            {section && <tr className="hidden" />}
                            {(!sep || hl) && <>
                              <td className={`py-2 text-sm ${section ? "font-semibold text-muted-foreground text-xs uppercase pt-4" : ""}`}
                                style={{ paddingLeft: `${(indent + 1) * 12}px` }}>
                                {section ? section : label}
                              </td>
                              <td className={`py-2 text-sm text-right ${val >= 0 ? "text-slate-700" : "text-red-600"}`}>
                                {section ? "" : fmtR(val)}
                              </td>
                            </>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                {/* Waterfall chart */}
                <Card>
                  <CardHeader><CardTitle className="text-sm">Composição do Caixa</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={[
                        { name: "Operacional",    valor: dfcAtual.caixa_operacional,   fill: dfcAtual.caixa_operacional >= 0 ? GREEN : RED },
                        { name: "Investimentos",  valor: dfcAtual.caixa_investimento,  fill: dfcAtual.caixa_investimento >= 0 ? GREEN : AMBER },
                        { name: "Financiamentos", valor: dfcAtual.caixa_financiamento, fill: dfcAtual.caixa_financiamento >= 0 ? BLUE : AMBER },
                        { name: "Variação",       valor: dfcAtual.variacao_caixa,      fill: dfcAtual.variacao_caixa >= 0 ? NAVY : RED },
                      ]} layout="vertical" barSize={28}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                        <XAxis type="number" tickFormatter={v => fmtR(v)} tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                        <ReTooltip formatter={(v: any) => fmtR(v)} />
                        <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                          {[dfcAtual.caixa_operacional, dfcAtual.caixa_investimento, dfcAtual.caixa_financiamento, dfcAtual.variacao_caixa]
                            .map((v, i) => <Cell key={i} fill={[
                              v >= 0 ? GREEN : RED,
                              v >= 0 ? GREEN : AMBER,
                              v >= 0 ? BLUE : AMBER,
                              v >= 0 ? NAVY : RED,
                            ][i]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>

                    <div className="mt-4 p-3 rounded-lg bg-slate-50 text-xs space-y-1">
                      <div className="flex justify-between"><span className="text-muted-foreground">Caixa Inicial</span><span className="font-medium">{fmtR(dfcAtual.caixa_inicial)}</span></div>
                      <div className="flex justify-between border-t pt-1"><span className="font-semibold">Caixa Final</span><span className="font-bold" style={{ color: dfcAtual.caixa_final >= dfcAtual.caixa_inicial ? GREEN : RED }}>{fmtR(dfcAtual.caixa_final)}</span></div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* ── Balanço / Balancete ── */}
          <TabsContent value="balanco">
            {balancoAtual && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Ativo */}
                <Card>
                  <CardHeader><CardTitle className="text-sm text-green-700">ATIVO</CardTitle></CardHeader>
                  <CardContent>
                    <table className="w-full text-sm">
                      <tbody>
                        {[
                          { label: "Caixa e Equivalentes",    val: balancoAtual.caixa_equivalentes,    indent: 1 },
                          { label: "Contas a Receber",         val: balancoAtual.contas_receber,        indent: 1 },
                          { label: "Estoques",                 val: balancoAtual.estoques,              indent: 1 },
                          { label: "Outros",                   val: balancoAtual.outros_ativo_circ,     indent: 1 },
                          { label: "ATIVO CIRCULANTE",         val: balancoAtual.ativo_circulante,      bold: true },
                          { label: "Imobilizado",              val: balancoAtual.imobilizado,           indent: 1 },
                          { label: "Intangível",               val: balancoAtual.intangivel,            indent: 1 },
                          { label: "Outros",                   val: balancoAtual.outros_ativo_nc,       indent: 1 },
                          { label: "ATIVO NÃO CIRCULANTE",     val: balancoAtual.ativo_nao_circulante,  bold: true },
                          { label: "ATIVO TOTAL",              val: balancoAtual.ativo_total,           bold: true, sep: true },
                        ].map(({ label, val, indent = 0, bold, sep }, i) => (
                          <tr key={i} className={bold ? "font-semibold bg-green-50" : ""}>
                            {sep && <td colSpan={2}><div className="border-t my-1" /></td>}
                            {!sep && <>
                              <td className="py-1.5 text-sm" style={{ paddingLeft: `${(indent + 1) * 10}px` }}>{label}</td>
                              <td className="py-1.5 text-sm text-right">{fmtR(val)}</td>
                            </>}
                          </tr>
                        ))}
                        <tr className="font-bold bg-green-100">
                          <td className="py-2 pl-2">ATIVO TOTAL</td>
                          <td className="py-2 text-right">{fmtR(balancoAtual.ativo_total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                {/* Passivo + PL */}
                <Card>
                  <CardHeader><CardTitle className="text-sm text-red-700">PASSIVO + PATRIMÔNIO LÍQUIDO</CardTitle></CardHeader>
                  <CardContent>
                    <table className="w-full text-sm">
                      <tbody>
                        {[
                          { label: "Fornecedores",             val: balancoAtual.fornecedores,          indent: 1 },
                          { label: "Obrigações Fiscais",       val: balancoAtual.obrigacoes_fiscais,     indent: 1 },
                          { label: "Empréstimos CP",           val: balancoAtual.emprestimos_cp,         indent: 1 },
                          { label: "Outros",                   val: balancoAtual.outros_passivo_circ,   indent: 1 },
                          { label: "PASSIVO CIRCULANTE",       val: balancoAtual.passivo_circulante,    bold: true },
                          { label: "Empréstimos LP",           val: balancoAtual.emprestimos_lp,         indent: 1 },
                          { label: "Outros",                   val: balancoAtual.outros_passivo_nc,      indent: 1 },
                          { label: "PASSIVO NÃO CIRCULANTE",   val: balancoAtual.passivo_nao_circulante, bold: true },
                          { label: "Capital Social",           val: balancoAtual.capital_social,         indent: 1 },
                          { label: "Reservas",                 val: balancoAtual.reservas,               indent: 1 },
                          { label: "Lucros Acumulados",        val: balancoAtual.lucros_acumulados,      indent: 1 },
                          { label: "PATRIMÔNIO LÍQUIDO",       val: balancoAtual.patrimonio_liquido,     bold: true },
                        ].map(({ label, val, indent = 0, bold }, i) => (
                          <tr key={i} className={bold ? "font-semibold bg-red-50" : ""}>
                            <td className="py-1.5 text-sm" style={{ paddingLeft: `${(indent + 1) * 10}px` }}>{label}</td>
                            <td className="py-1.5 text-sm text-right">{fmtR(val)}</td>
                          </tr>
                        ))}
                        <tr className="font-bold bg-red-100">
                          <td className="py-2 pl-2">PASSIVO TOTAL + PL</td>
                          <td className="py-2 text-right">{fmtR(balancoAtual.passivo_total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Balancete with account tree */}
            {balanceteContas.length > 0 && (
              <Card className="mt-4">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="h-4 w-4" style={{ color: NAVY }} />
                      Balancete — {periodoLabel(selPeriodo)}
                      <Badge variant="outline" className="text-xs">{balanceteContas.length} contas</Badge>
                    </CardTitle>
                    <div className="flex items-center gap-1 text-xs">
                      <span className="text-muted-foreground mr-1">Nível:</span>
                      {([1, 2, 3, 4] as const).map(n => (
                        <Button key={n} size="sm" variant={balanceteNivel === n ? "default" : "outline"}
                          className="h-7 w-7 p-0 text-xs"
                          style={balanceteNivel === n ? { background: NAVY } : {}}
                          onClick={() => setBalanceteNivel(n)}>
                          {n}
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b-2">
                          <th className="pb-2 font-semibold text-muted-foreground text-left w-24">Código</th>
                          <th className="pb-2 font-semibold text-muted-foreground text-left">Descrição</th>
                          <th className="pb-2 font-semibold text-muted-foreground text-right">Saldo Anterior</th>
                          <th className="pb-2 font-semibold text-muted-foreground text-right">Débitos</th>
                          <th className="pb-2 font-semibold text-muted-foreground text-right">Créditos</th>
                          <th className="pb-2 font-semibold text-muted-foreground text-right">Saldo Atual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {balanceteContas
                          .filter(c => c.nivel <= balanceteNivel)
                          .map((c, i) => (
                            <tr key={i} className={c.nivel === 1 ? "bg-slate-100 font-bold" : c.nivel === 2 ? "bg-slate-50 font-semibold" : "hover:bg-slate-50/50"}>
                              <td className="py-1 font-mono">{c.codigo}</td>
                              <td className="py-1" style={{ paddingLeft: `${(c.nivel - 1) * 12}px` }}>{c.nome}</td>
                              <td className="py-1 text-right tabular-nums">{c.saldo_anterior !== 0 ? fmtR(c.saldo_anterior) : "—"}</td>
                              <td className="py-1 text-right tabular-nums text-blue-600">{c.debitos !== 0 ? fmtR(c.debitos) : "—"}</td>
                              <td className="py-1 text-right tabular-nums text-red-500">{c.creditos !== 0 ? fmtR(c.creditos) : "—"}</td>
                              <td className={`py-1 text-right tabular-nums font-medium ${c.saldo_atual >= 0 ? "" : "text-red-600"}`}>
                                {fmtR(c.saldo_atual)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Indicadores ── */}
          <TabsContent value="indicadores">
            {indicadores && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {indicadores.mg !== null && (
                    <IndicadorCard nome="Margem Líquida" valor={indicadores.mg} unidade="%"
                      meta="> 5%" interpretacao="Percentual do faturamento líquido convertido em lucro."
                      status={indicadores.mg > 10 ? "green" : indicadores.mg > 3 ? "yellow" : "red"} />
                  )}
                  {indicadores.mb !== null && (
                    <IndicadorCard nome="Margem Bruta" valor={indicadores.mb} unidade="%"
                      meta="> 30%" interpretacao="Eficiência na geração de lucro após custos diretos."
                      status={indicadores.mb > 30 ? "green" : indicadores.mb > 15 ? "yellow" : "red"} />
                  )}
                  {indicadores.em !== null && (
                    <IndicadorCard nome="Margem EBITDA" valor={indicadores.em} unidade="%"
                      meta="> 15%" interpretacao="Capacidade operacional antes de juros e depreciação."
                      status={indicadores.em > 15 ? "green" : indicadores.em > 8 ? "yellow" : "red"} />
                  )}
                  {indicadores.roe !== null && (
                    <IndicadorCard nome="ROE" valor={indicadores.roe} unidade="%"
                      meta="> 15%" interpretacao="Retorno sobre o patrimônio dos sócios."
                      status={indicadores.roe > 15 ? "green" : indicadores.roe > 8 ? "yellow" : "red"} />
                  )}
                  {indicadores.roa !== null && (
                    <IndicadorCard nome="ROA" valor={indicadores.roa} unidade="%"
                      meta="> 8%" interpretacao="Retorno sobre o total de ativos da empresa."
                      status={indicadores.roa > 8 ? "green" : indicadores.roa > 3 ? "yellow" : "red"} />
                  )}
                  {indicadores.lc !== null && (
                    <IndicadorCard nome="Liquidez Corrente" valor={indicadores.lc} unidade="x"
                      meta="> 1,5" interpretacao="Capacidade de pagar obrigações de curto prazo."
                      status={indicadores.lc > 1.5 ? "green" : indicadores.lc > 1 ? "yellow" : "red"} />
                  )}
                  {indicadores.ls !== null && (
                    <IndicadorCard nome="Liquidez Seca" valor={indicadores.ls} unidade="x"
                      meta="> 1,0" interpretacao="Liquidez excluindo estoques (mais conservador)."
                      status={indicadores.ls > 1.0 ? "green" : indicadores.ls > 0.7 ? "yellow" : "red"} />
                  )}
                  {indicadores.end !== null && (
                    <IndicadorCard nome="Endividamento" valor={indicadores.end} unidade="%"
                      meta="< 50%" interpretacao="Proporção do ativo financiada por terceiros."
                      status={indicadores.end < 40 ? "green" : indicadores.end < 60 ? "yellow" : "red"} />
                  )}
                </div>

                {/* Legenda */}
                <Card className="bg-slate-50">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground font-medium mb-2">Referência dos indicadores:</p>
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-600" /> Bom desempenho</span>
                      <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-500" /> Atenção necessária</span>
                      <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-500" /> Abaixo do ideal</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* ── Evolução ── */}
          <TabsContent value="evolucao" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Receita e Lucro — Últimos 12 Meses</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={evolucao.filter(d => d.receita !== null)}>
                    <defs>
                      <linearGradient id="recGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={NAVY} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={NAVY} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="lucGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={GREEN} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={GREEN} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => fmtR(v).replace("R$","R$ ")} width={80} tick={{ fontSize: 10 }} />
                    <ReTooltip formatter={(v: any) => fmtR(v)} />
                    <Legend />
                    <Area type="monotone" dataKey="receita" stroke={NAVY} fill="url(#recGrad)" strokeWidth={2} name="Receita Líquida" />
                    <Area type="monotone" dataKey="lucro"   stroke={GREEN} fill="url(#lucGrad)" strokeWidth={2} name="Lucro Líquido" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">EBITDA — Últimos 12 Meses</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={evolucao.filter(d => d.ebitda !== null)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => fmtR(v)} width={80} tick={{ fontSize: 10 }} />
                    <ReTooltip formatter={(v: any) => fmtR(v)} />
                    <Bar dataKey="ebitda" name="EBITDA" radius={[4,4,0,0]}>
                      {evolucao.map((d, i) => (
                        <Cell key={i} fill={(d.ebitda ?? 0) >= 0 ? AMBER : RED} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Diagnóstico ── */}
          <TabsContent value="diagnostico" className="space-y-4">
            {diagnostico && (
              <>
                {/* Health score card */}
                <Card className="overflow-hidden">
                  <div className="h-2" style={{ background: `linear-gradient(90deg, ${diagnostico.nivelColor}, ${diagnostico.nivelColor}88)` }} />
                  <CardContent className="p-6">
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                      {/* Gauge circle */}
                      <div className="shrink-0 flex flex-col items-center">
                        <div className="relative h-32 w-32">
                          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                            <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="10" />
                            <circle cx="50" cy="50" r="42" fill="none"
                              stroke={diagnostico.nivelColor} strokeWidth="10"
                              strokeDasharray={`${2 * Math.PI * 42 * diagnostico.score / 100} 1000`}
                              strokeLinecap="round" />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-3xl font-bold" style={{ color: diagnostico.nivelColor }}>
                              {diagnostico.score}
                            </span>
                            <span className="text-xs text-muted-foreground">/ 100</span>
                          </div>
                        </div>
                        <Badge className="mt-2 px-3 py-1 text-sm font-semibold text-white"
                          style={{ background: diagnostico.nivelColor }}>
                          {diagnostico.nivelLabel}
                        </Badge>
                      </div>

                      {/* Summary */}
                      <div className="flex-1">
                        <h3 className="text-lg font-bold" style={{ color: NAVY }}>
                          Saúde Financeira — {periodoLabel(selPeriodo)}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1 mb-4">
                          {empresas.find(e => e.id === selEmpresa)?.razao_social}
                        </p>
                        <p className="text-sm text-foreground">
                          {diagnostico.nivel === "excelente" &&
                            "A empresa apresenta indicadores financeiros excelentes em todos os critérios analisados. Continue monitorando para manter esse desempenho."}
                          {diagnostico.nivel === "bom" &&
                            "A empresa está em boa situação financeira. Alguns indicadores têm espaço para melhoria, mas a base é sólida."}
                          {diagnostico.nivel === "regular" &&
                            "A empresa apresenta pontos de atenção que merecem acompanhamento próximo. Recomendamos um plano de ação focado nas áreas críticas."}
                          {diagnostico.nivel === "critico" &&
                            "Atenção: a empresa apresenta indicadores financeiros preocupantes que requerem ação imediata. Consulte seu contador para um diagnóstico detalhado."}
                        </p>
                        <div className="flex gap-4 mt-4 text-sm">
                          {[
                            { label: "Rentabilidade", pts: (indicadores?.mg ?? 0) > 8 ? "✓" : "⚠", ok: (indicadores?.mg ?? 0) > 8 },
                            { label: "Liquidez",      pts: (indicadores?.lc ?? 0) > 1.5 ? "✓" : "⚠", ok: (indicadores?.lc ?? 0) > 1.5 },
                            { label: "Solvência",     pts: (indicadores?.end ?? 100) < 50 ? "✓" : "⚠", ok: (indicadores?.end ?? 100) < 50 },
                            { label: "Eficiência",    pts: (indicadores?.em ?? 0) > 12 ? "✓" : "⚠", ok: (indicadores?.em ?? 0) > 12 },
                          ].map(({ label, pts, ok }) => (
                            <div key={label} className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${ok ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                              <span>{pts}</span> {label}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Insights */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {diagnostico.insights.map(({ titulo, texto, status }) => {
                    const colors: Record<TrafficLight, string> = {
                      green: "border-l-green-500 bg-green-50",
                      yellow: "border-l-amber-500 bg-amber-50",
                      red: "border-l-red-500 bg-red-50",
                      neutral: "border-l-slate-300 bg-slate-50",
                    };
                    const icons: Record<TrafficLight, React.ElementType> = {
                      green: CheckCircle, yellow: AlertTriangle, red: AlertTriangle, neutral: Minus,
                    };
                    const iconColors: Record<TrafficLight, string> = {
                      green: "text-green-600", yellow: "text-amber-500", red: "text-red-500", neutral: "text-slate-400",
                    };
                    const Icon = icons[status];
                    return (
                      <div key={titulo} className={`rounded-xl border-l-4 p-4 ${colors[status]}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className={`h-4 w-4 shrink-0 ${iconColors[status]}`} />
                          <span className="text-sm font-semibold text-foreground">{titulo}</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{texto}</p>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </TabsContent>

          {/* ── Documentos ── */}
          <TabsContent value="documentos">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Documentos Importados</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium text-muted-foreground">Tipo</th>
                      <th className="pb-2 font-medium text-muted-foreground">Período</th>
                      <th className="pb-2 font-medium text-muted-foreground">Arquivo</th>
                      <th className="pb-2 font-medium text-muted-foreground">Importado em</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {documentos.map(d => (
                      <tr key={d.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="py-2">
                          <Badge variant="outline" className="uppercase text-xs">
                            {d.tipo}
                          </Badge>
                        </td>
                        <td className="py-2">{periodoLabel(d.periodo)}</td>
                        <td className="py-2 text-muted-foreground max-w-xs truncate">{d.arquivo_nome ?? "—"}</td>
                        <td className="py-2 text-muted-foreground">
                          {format(parseISO(d.created_at), "dd/MM/yyyy HH:mm")}
                        </td>
                        <td className="py-2 text-right">
                          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 h-7 px-2"
                            onClick={() => handleDeleteDoc(d.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* ── Upload Dialog ── */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle style={{ color: NAVY }}>
              {upStep === "select"  && "Importar Documento Financeiro"}
              {upStep === "parsing" && "Processando PDF…"}
              {upStep === "review"  && "Revisar Dados Extraídos"}
            </DialogTitle>
          </DialogHeader>

          {upStep === "select" && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo do Documento</Label>
                  <Select value={upTipo} onValueChange={(v) => setUpTipo(v as any)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dre">DRE</SelectItem>
                      <SelectItem value="dfc">Fluxo de Caixa (DFC)</SelectItem>
                      <SelectItem value="balanco">Balanço Patrimonial</SelectItem>
                      <SelectItem value="balancete">Balancete (com códigos)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Período (AAAA-MM)</Label>
                  <Input
                    className="mt-1"
                    value={upPeriodo}
                    onChange={e => setUpPeriodo(e.target.value)}
                    placeholder="2025-01"
                  />
                </div>
              </div>

              {/* Mode selector */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setUpMode("pdf")}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors ${upMode === "pdf" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}
                >
                  <Upload className={`h-6 w-6 ${upMode === "pdf" ? "text-blue-600" : "text-muted-foreground"}`} />
                  <span className="text-sm font-medium">Upload PDF</span>
                  <span className="text-xs text-muted-foreground text-center">Extração automática</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUpMode("manual")}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors ${upMode === "manual" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}
                >
                  <FileText className={`h-6 w-6 ${upMode === "manual" ? "text-blue-600" : "text-muted-foreground"}`} />
                  <span className="text-sm font-medium">Entrada Manual</span>
                  <span className="text-xs text-muted-foreground text-center">Digitar os valores</span>
                </button>
              </div>

              {upMode === "pdf" ? (
                <>
                  <div
                    className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm font-medium">Clique para selecionar o PDF</p>
                    <p className="text-xs text-muted-foreground mt-1">ou arraste o arquivo aqui</p>
                    <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileSelect} />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    O sistema extrai os valores automaticamente. Você poderá revisar antes de salvar.
                  </p>
                </>
              ) : (
                <Button className="w-full" style={{ background: NAVY }} onClick={handleManualEntry}>
                  <FileText className="h-4 w-4 mr-2" /> Preencher Manualmente
                </Button>
              )}
            </div>
          )}

          {upStep === "parsing" && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <RefreshCw className="h-10 w-10 animate-spin text-blue-500" />
              <p className="text-sm text-muted-foreground">Extraindo texto do PDF…</p>
            </div>
          )}

          {upStep === "review" && upParsed !== null && (
            <>
              <ScrollArea className="flex-1 min-h-0 pr-3">
                <div className="space-y-2 py-2">
                  <p className="text-xs text-muted-foreground mb-3">
                    Revise os valores extraídos automaticamente. Edite os campos que precisar.
                  </p>
                  {upTipo === "balancete" && upEditVals._json ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Balancete com {JSON.parse(upEditVals._json ?? "{}").contas?.length ?? 0} conta(s) extraída(s).
                        Os dados serão salvos conforme extraídos.
                      </p>
                    </div>
                  ) : (upTipo === "dre" ? DRE_FIELDS : upTipo === "dfc" ? DFC_FIELDS : BALANCO_FIELDS).map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-3">
                      <Label className="w-56 shrink-0 text-xs">{label}</Label>
                      <Input
                        className="text-right text-sm h-8"
                        value={upEditVals[key] ?? "0"}
                        onChange={e => setUpEditVals(prev => ({ ...prev, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <DialogFooter className="pt-3 border-t mt-2 shrink-0">
                <Button variant="outline" onClick={() => setUpStep("select")}>Voltar</Button>
                <Button onClick={handleSaveDoc} disabled={upSaving} style={{ background: NAVY }} className="text-white">
                  {upSaving ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                  Salvar Documento
                </Button>
              </DialogFooter>
            </>
          )}

          {upStep === "select" && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancelar</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Gerar da Conciliação Dialog ── */}
      <Dialog open={gerarOpen} onOpenChange={v => { setGerarOpen(v); if (!v) setGerarPreview(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle style={{ color: NAVY }} className="flex items-center gap-2">
              <Zap className="h-5 w-5" /> Gerar DRE &amp; Balancete da Conciliação
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Gera automaticamente um DRE e um Balancete com base nas transações categorizadas no módulo de Conciliação para o período selecionado.
            </p>

            <div>
              <Label>Período (ano-mês)</Label>
              <Input
                className="mt-1 w-44"
                type="month"
                value={gerarPeriodo}
                onChange={e => { setGerarPeriodo(e.target.value); setGerarPreview(null); }}
              />
            </div>

            {!gerarPreview && (
              <Button
                onClick={previaConciliacao}
                disabled={gerarLoading || !gerarPeriodo}
                style={{ background: NAVY }}
                className="text-white w-full"
              >
                {gerarLoading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
                Carregar Prévia
              </Button>
            )}

            {gerarPreview && (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                  <p className="font-medium text-green-800">
                    {gerarPreview.totalTx} transações categorizadas encontradas
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-lg p-3 border">
                    <p className="text-xs text-muted-foreground uppercase font-medium mb-1">DRE — Receita Total</p>
                    <p className="text-lg font-bold" style={{ color: NAVY }}>
                      {fmtR(gerarPreview.dre.receita_bruta)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Lucro líquido: {fmtR(gerarPreview.dre.lucro_liquido)}
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 border">
                    <p className="text-xs text-muted-foreground uppercase font-medium mb-1">Balancete — Contas</p>
                    <p className="text-lg font-bold" style={{ color: NAVY }}>
                      {gerarPreview.balancete.contas.length}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">contas com movimento</p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-100 rounded p-2">
                  Se já existe DRE ou Balancete para este período, um novo será adicionado. Você pode excluir o antigo na aba Documentos.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setGerarOpen(false); setGerarPreview(null); }}>
              Cancelar
            </Button>
            {gerarPreview && (
              <Button
                onClick={salvarDaConciliacao}
                disabled={gerarLoading}
                style={{ background: NAVY }}
                className="text-white"
              >
                {gerarLoading
                  ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  : <Download className="h-4 w-4 mr-2" />
                }
                Salvar DRE + Balancete
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Consolidar Anual Dialog ── */}
      <Dialog open={consolidarOpen} onOpenChange={setConsolidarOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ color: NAVY }}>Consolidar DRE Anual</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Soma todos os DREs mensais do ano selecionado e gera um DRE anual consolidado.
            </p>
            <div>
              <Label>Ano</Label>
              <Input
                className="mt-1"
                value={consolidarAno}
                onChange={e => setConsolidarAno(e.target.value)}
                placeholder="2024"
                maxLength={4}
              />
            </div>
            <div className="text-xs text-muted-foreground bg-blue-50 p-3 rounded-lg">
              Encontrados: {documentos.filter(d => d.tipo === "dre" && d.periodo.startsWith(consolidarAno)).length} DRE(s) para {consolidarAno}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConsolidarOpen(false)}>Cancelar</Button>
            <Button onClick={consolidarAnual} style={{ background: NAVY }} className="text-white">
              Consolidar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
