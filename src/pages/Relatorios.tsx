import { useState, useEffect, useMemo, useRef } from "react";
import {
  FileBarChart, Download, Import, Building2, BarChart2,
  TrendingUp, TrendingDown, DollarSign, Percent, RefreshCw,
  ChevronRight, AlertTriangle, CheckCircle, Upload, FileText,
  X, Sparkles,
} from "lucide-react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc = workerUrl;
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line,
} from "recharts";
import jsPDF from "jspdf";

// ─── Constants ────────────────────────────────────────────────────────────────

const NAVY  = "#10143D";
const RED   = "#ED3237";
const GREEN = "#22c55e";
const AMBER = "#f59e0b";

const PIE_COLORS = [
  "#3b82f6","#22c55e","#f59e0b","#ef4444",
  "#8b5cf6","#ec4899","#06b6d4","#84cc16","#f97316",
];

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
  tipo: string;
  periodo: string;
  dados_parseados: any;
  arquivo_nome: string | null;
  created_at: string;
}

interface Empresa { id: string; razao_social: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtR(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtPct(v: number) { return `${v.toFixed(1)}%`; }
function periodoLabel(p: string) {
  if (p.length === 7) {
    const [y, m] = p.split("-");
    const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    return `${meses[parseInt(m) - 1]}/${y}`;
  }
  return p;
}

// ─── PDF Parsers ─────────────────────────────────────────────────────────────

async function extractPdfText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const pdf = await getDocument({ data: buf }).promise;
  let text = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Group text items by Y position to reconstruct table rows
    const rows = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items as any[]) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform[5]);
      const x = item.transform[4];
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x, str: item.str });
    }
    // Sort rows top→bottom (PDF Y is bottom-up → descending), items left→right by X
    const sorted = [...rows.entries()]
      .sort(([ya], [yb]) => yb - ya)
      .map(([, items]) => items.sort((a, b) => a.x - b.x).map(i => i.str).join(" "));
    text += sorted.join("\n") + "\n";
  }
  return text;
}

function normStr(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}
function parseBRNumber(s: string): number {
  const neg = s.includes("(") || s.trimStart().startsWith("-");
  const n = parseFloat(s.replace(/[() -]/g, "").replace(/\./g, "").replace(",", "."));
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
function absN(v: number) { return -Math.abs(v); }

function parseDRE(text: string): DreData {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const f  = (kws: string[][]) => findLastVal(lines, kws);
  const fa = (kws: string[][]) => absN(findLastVal(lines, kws));

  const receita_bruta = f([["receita bruta"],["receita operacional bruta"],["vendas brutas"]]);
  const deducoes      = fa([["deducoes"],["(-) deducoes"],["impostos sobre vendas"],["deducoes da receita"]]);
  const receita_liquida = f([["receita liquida"],["receita operacional liquida"],["receita liq"]]) ||
    (receita_bruta + deducoes);
  const custo_servicos  = fa([["custo dos servicos"],["custo dos produtos"],["cmv"],["csp"],["custo merc"]]);
  const lucro_bruto     = f([["lucro bruto"],["resultado bruto"]]) || (receita_liquida + custo_servicos);
  const despesas_pessoal = fa([["despesas com pessoal"],["salarios e encargos"],["pessoal"]]);
  const despesas_administrativas = fa([["despesas administrativas"],["administrativas"],["gerais e adm"]]);
  const despesas_comerciais = fa([["despesas com vendas"],["despesas comerciais"],["comerciais"]]);
  const outras_despesas_op  = fa([["outras despesas operacionais"],["outras despesas"]]);
  const ebitda = f([["ebitda"],["lajida"]]) ||
    (lucro_bruto + despesas_pessoal + despesas_administrativas + despesas_comerciais + outras_despesas_op);
  const depreciacao_amortizacao = fa([["depreciacao"],["amortizacao"]]);
  const ebit = f([["resultado operacional"],["ebit"],["lajir"]]) || (ebitda + depreciacao_amortizacao);
  const receitas_financeiras = f([["receitas financeiras"],["receita financeira"]]);
  const despesas_financeiras = fa([["despesas financeiras"],["despesa financeira"],["encargos financeiros"]]);
  const resultado_financeiro = f([["resultado financeiro"]]) || (receitas_financeiras + despesas_financeiras);
  const lucro_antes_ir = f([["lucro antes do imposto"],["resultado antes do ir"]]) || (ebit + resultado_financeiro);
  const ir_csll = fa([["imposto de renda"],["ir e csll"],["ir/csll"],["irpj"]]);
  const lucro_liquido = f([
    ["lucro liquido"],["resultado liquido"],["lucro do exercicio"],
    ["resultado do exercicio"],["prejuizo do exercicio"],["lucro (prejuizo)"],
  ]) || (lucro_antes_ir + ir_csll);
  return {
    receita_bruta, deducoes, receita_liquida, custo_servicos, lucro_bruto,
    despesas_pessoal, despesas_administrativas, despesas_comerciais, outras_despesas_op,
    ebitda, depreciacao_amortizacao, ebit,
    receitas_financeiras, despesas_financeiras, resultado_financeiro,
    lucro_antes_ir, ir_csll, lucro_liquido,
  };
}

function parseBalancete(text: string): BalanceteData {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const contas: BalanceteAccount[] = [];

  // Strip D/C suffix and parse absolute value
  function parseDC(s: string): number {
    const n = parseFloat(s.replace(/[DC]$/, "").replace(/\./g, "").replace(",", "."));
    return isNaN(n) ? 0 : n;
  }

  // Number pattern: Brazilian format with optional D/C balance indicator
  const NUM_BAL = /\d{1,3}(?:\.\d{3})*,\d{2}[DC]?/g;

  for (const line of lines) {
    // Skip header/footer lines
    if (/balancete|c[oó]digo\s+classific|saldo\s+anterior.*d[eé]bit|empresa:|c\.n\.p\.j|per[ií]odo:|emiss[aã]o|sistema\s+licenc|resumo\s+do\s+balanc|hora:/i.test(line)) continue;

    // Collect all financial numbers with their positions
    const allNums: { str: string; idx: number }[] = [];
    NUM_BAL.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = NUM_BAL.exec(line)) !== null) {
      allNums.push({ str: m[0], idx: m.index });
    }
    if (allNums.length < 4) continue;

    // The last 4 numbers are: Saldo Anterior, Débito, Crédito, Saldo Atual
    const last4 = allNums.slice(-4);

    // Everything before the first of these 4 numbers = "seq code name" header
    const textPart = line.slice(0, last4[0].idx).trim();

    // Pattern: [optional label text] seq_num  classification_code  account_name
    // classification_code: digit segments separated by dots (e.g. 1.1.1.01)
    const rowMatch = textPart.match(/(?:^|\s)(\d{1,4})\s+(\d{1,3}(?:\.\d{1,3})*)\s+(.+)$/);
    if (!rowMatch) continue;

    const codigo = rowMatch[2];
    // nome is everything after "seq code " — strip any leading numbers (seq repeats)
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
  title, value, sub, cor, up,
}: { title: string; value: string; sub?: string; cor?: string; up?: boolean | null }) {
  return (
    <Card className="overflow-hidden">
      <div className="h-1" style={{ background: cor ?? NAVY }} />
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground uppercase font-medium tracking-wide">{title}</p>
        <p className="text-xl font-bold mt-1" style={{ color: cor ?? NAVY }}>{value}</p>
        {sub && (
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            {up !== null && up !== undefined && (
              up ? <TrendingUp className="h-3 w-3 text-green-500" /> : <TrendingDown className="h-3 w-3 text-red-500" />
            )}
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function DreRow({ label, value, receita, indent = 0, bold = false, highlight }: {
  label: string; value: number; receita: number; indent?: number;
  bold?: boolean; highlight?: "green" | "red" | "blue";
}) {
  const pct = receita ? ((value / receita) * 100) : 0;
  const color = highlight === "green" ? GREEN : highlight === "red" ? RED : highlight === "blue" ? "#3b82f6" : undefined;
  return (
    <tr className={`border-b last:border-0 ${bold ? "font-semibold" : "font-normal"}`}>
      <td className="py-2 pr-4 text-sm" style={{ paddingLeft: `${12 + indent * 16}px`, color }}>
        {label}
      </td>
      <td className="py-2 text-right text-sm tabular-nums pr-4" style={{ color }}>
        {fmtR(value)}
      </td>
      <td className="py-2 text-right text-xs text-muted-foreground tabular-nums">
        {receita ? fmtPct(pct) : "—"}
      </td>
    </tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Relatorios() {
  const { ownerUserId } = useAuth();

  // Dialog state
  const [importOpen,   setImportOpen]   = useState(false);
  const [impMode,      setImpMode]      = useState<"financeiro" | "upload">("financeiro");
  const [empresas,     setEmpresas]     = useState<Empresa[]>([]);
  const [impEmpresa,   setImpEmpresa]   = useState("");
  const [impDocs,      setImpDocs]      = useState<DocumentoFinanceiro[]>([]);
  const [impPeriodo,   setImpPeriodo]   = useState("");
  const [impDreId,     setImpDreId]     = useState("");
  const [impBalId,     setImpBalId]     = useState("");
  const [impLoading,   setImpLoading]   = useState(false);
  // Upload mode
  const [upDreFile,    setUpDreFile]    = useState<File | null>(null);
  const [upBalFile,    setUpBalFile]    = useState<File | null>(null);
  const [upDreParsed,  setUpDreParsed]  = useState<DreData | null>(null);
  const [upBalParsed,  setUpBalParsed]  = useState<BalanceteData | null>(null);
  const [upParsing,    setUpParsing]    = useState(false);
  const [upPeriodo,    setUpPeriodo]    = useState(() => new Date().toISOString().slice(0, 7));
  const upDreRef = useRef<HTMLInputElement>(null);
  const upBalRef = useRef<HTMLInputElement>(null);

  // Active analysis state
  const [empresaAtiva, setEmpresaAtiva] = useState<Empresa | null>(null);
  const [periodoAtivo, setPeriodoAtivo] = useState("");
  const [dreData,      setDreData]      = useState<DreData | null>(null);
  const [balData,      setBalData]      = useState<BalanceteData | null>(null);
  const [balNivel,     setBalNivel]     = useState(3);

  // Comparativo mensal — todos os DREs da empresa importada
  const [todosDocsEmpresa, setTodosDocsEmpresa] = useState<DocumentoFinanceiro[]>([]);

  // Load empresas
  useEffect(() => {
    if (!ownerUserId) return;
    supabase.from("empresas").select("id,razao_social")
      .order("razao_social")
      .then(({ data }) => setEmpresas((data ?? []) as Empresa[]));
  }, [ownerUserId]);

  // Load docs when empresa changes in dialog
  useEffect(() => {
    if (!impEmpresa || !ownerUserId) { setImpDocs([]); return; }
    setImpLoading(true);
    setImpPeriodo(""); setImpDreId(""); setImpBalId("");
    supabase.from("documentos_financeiros")
      .select("id,tipo,periodo,dados_parseados,arquivo_nome,created_at")
      .eq("empresa_id", impEmpresa)
      .order("periodo", { ascending: false })
      .then(({ data }) => { setImpDocs((data ?? []) as DocumentoFinanceiro[]); setImpLoading(false); });
  }, [impEmpresa, ownerUserId]);

  const periodos = useMemo(() => {
    const set = new Set(impDocs.map(d => d.periodo));
    return Array.from(set).sort().reverse();
  }, [impDocs]);

  const dreDocs  = useMemo(() => impDocs.filter(d => d.tipo === "dre"      && d.periodo === impPeriodo), [impDocs, impPeriodo]);
  const balDocs  = useMemo(() => impDocs.filter(d => (d.tipo === "balancete" || d.tipo === "balanco") && d.periodo === impPeriodo), [impDocs, impPeriodo]);

  useEffect(() => { setImpDreId(dreDocs.length === 1 ? dreDocs[0].id : ""); }, [dreDocs]);
  useEffect(() => { setImpBalId(balDocs.length === 1 ? balDocs[0].id : ""); }, [balDocs]);

  function handleImportar() {
    const dreDoc = impDocs.find(d => d.id === impDreId);
    const balDoc = impDocs.find(d => d.id === impBalId);
    const emp = empresas.find(e => e.id === impEmpresa);
    if (!dreDoc && !balDoc) { toast.error("Selecione ao menos um DRE ou Balancete."); return; }
    if (dreDoc) setDreData(dreDoc.dados_parseados as DreData);
    else setDreData(null);
    if (balDoc) setBalData(balDoc.dados_parseados as BalanceteData);
    else setBalData(null);
    if (emp) setEmpresaAtiva(emp);
    setPeriodoAtivo(impPeriodo);
    // Carrega todos os DREs da empresa para comparativo mensal
    setTodosDocsEmpresa(impDocs.filter(d => d.tipo === "dre"));
    setImportOpen(false);
    toast.success("Dados importados com sucesso!");
  }

  async function handleFileChange(tipo: "dre" | "bal", file: File) {
    setUpParsing(true);
    try {
      const text = await extractPdfText(file);
      if (tipo === "dre") {
        setUpDreFile(file);
        setUpDreParsed(parseDRE(text));
      } else {
        setUpBalFile(file);
        setUpBalParsed(parseBalancete(text));
      }
    } catch {
      toast.error("Erro ao ler o PDF.");
    } finally {
      setUpParsing(false);
    }
  }

  function handleImportarUpload() {
    if (!upDreParsed && !upBalParsed) { toast.error("Adicione ao menos um documento."); return; }
    if (upDreParsed) setDreData(upDreParsed);
    else setDreData(null);
    if (upBalParsed) setBalData(upBalParsed);
    else setBalData(null);
    setEmpresaAtiva(null);
    setPeriodoAtivo(upPeriodo);
    setTodosDocsEmpresa([]);
    setImportOpen(false);
    toast.success("PDF analisado com sucesso!");
  }

  function resetDialog() {
    setUpDreFile(null); setUpBalFile(null);
    setUpDreParsed(null); setUpBalParsed(null);
    setImpPeriodo(""); setImpDreId(""); setImpBalId("");
  }

  // ── Memos de análise ──────────────────────────────────────────────────────

  const despesasCat = useMemo(() => {
    if (!dreData) return [];
    return [
      { nome: "Pessoal",       valor: Math.abs(dreData.despesas_pessoal) },
      { nome: "Administrativo",valor: Math.abs(dreData.despesas_administrativas) },
      { nome: "Comercial",     valor: Math.abs(dreData.despesas_comerciais) },
      { nome: "Outras Op.",    valor: Math.abs(dreData.outras_despesas_op) },
      { nome: "Financeiro",    valor: Math.abs(dreData.despesas_financeiras) },
      { nome: "IR/CSLL",       valor: Math.abs(dreData.ir_csll) },
    ].filter(d => d.valor > 0)
     .sort((a, b) => b.valor - a.valor);
  }, [dreData]);

  const totalDesp = useMemo(() => despesasCat.reduce((s, d) => s + d.valor, 0), [despesasCat]);

  const receitaCascade = useMemo(() => {
    if (!dreData) return [];
    return [
      { nome: "Receita Bruta",    valor: dreData.receita_bruta },
      { nome: "(-) Deduções",     valor: dreData.deducoes },
      { nome: "Receita Líquida",  valor: dreData.receita_liquida },
      { nome: "(-) Custo",        valor: dreData.custo_servicos },
      { nome: "Lucro Bruto",      valor: dreData.lucro_bruto },
      { nome: "(-) Despesas Op.", valor: dreData.despesas_pessoal + dreData.despesas_administrativas + dreData.despesas_comerciais + dreData.outras_despesas_op },
      { nome: "EBITDA",           valor: dreData.ebitda },
      { nome: "Resultado Fin.",   valor: dreData.resultado_financeiro },
      { nome: "Lucro Líquido",    valor: dreData.lucro_liquido },
    ];
  }, [dreData]);

  const indicadores = useMemo(() => {
    if (!dreData) return null;
    const rl = dreData.receita_liquida || 1;
    return {
      margem_bruta:   dreData.lucro_bruto   / rl * 100,
      margem_ebitda:  dreData.ebitda        / rl * 100,
      margem_liquida: dreData.lucro_liquido / rl * 100,
      peso_pessoal:   Math.abs(dreData.despesas_pessoal)  / rl * 100,
      peso_adm:       Math.abs(dreData.despesas_administrativas) / rl * 100,
      peso_financeiro:Math.abs(dreData.despesas_financeiras) / rl * 100,
    };
  }, [dreData]);

  const balMaxNivel = useMemo(() => {
    if (!balData?.contas?.length) return 5;
    return Math.max(...balData.contas.map(c => c.nivel));
  }, [balData]);

  const balContasFiltradas = useMemo(() => {
    if (!balData?.contas) return [];
    return balData.contas.filter(c => c.nivel === balNivel);
  }, [balData, balNivel]);

  // Comparativo mensal — DREs ordenados por período
  const comparativoMensal = useMemo(() => {
    const dres = [...todosDocsEmpresa]
      .sort((a, b) => a.periodo.localeCompare(b.periodo))
      .map(d => ({ periodo: d.periodo, dre: d.dados_parseados as DreData }))
      .filter(d => d.dre?.receita_bruta !== undefined);
    return dres;
  }, [todosDocsEmpresa]);

  const comparativoChart = useMemo(() => {
    return comparativoMensal.map(({ periodo, dre }) => ({
      periodo: periodoLabel(periodo),
      "Receita Líquida": dre.receita_liquida,
      "Despesas Totais": Math.abs(dre.despesas_pessoal + dre.despesas_administrativas + dre.despesas_comerciais + dre.outras_despesas_op),
      "Lucro Líquido":   dre.lucro_liquido,
      "EBITDA":          dre.ebitda,
    }));
  }, [comparativoMensal]);

  const hasData = dreData !== null || balData !== null;

  // ── PDF Export ────────────────────────────────────────────────────────────

  function exportPDF() {
    if (!hasData) return;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = 210;

    doc.setFillColor(16, 20, 61);
    doc.rect(0, 0, W, 35, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Relatório Gerencial", 15, 15);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(empresaAtiva?.razao_social ?? "", 15, 23);
    doc.text(`Período: ${periodoLabel(periodoAtivo)}`, 15, 30);

    doc.setFillColor(237, 50, 55);
    doc.rect(0, 35, W, 2, "F");

    let y = 48;
    doc.setTextColor(16, 20, 61);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");

    if (dreData) {
      doc.text("DRE — Demonstração do Resultado", 15, y); y += 8;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);

      const rows: [string, number][] = [
        ["Receita Bruta",             dreData.receita_bruta],
        ["(-) Deduções",              dreData.deducoes],
        ["Receita Líquida",           dreData.receita_liquida],
        ["(-) Custo dos Serviços",    dreData.custo_servicos],
        ["Lucro Bruto",               dreData.lucro_bruto],
        ["(-) Desp. Pessoal",         dreData.despesas_pessoal],
        ["(-) Desp. Administrativas", dreData.despesas_administrativas],
        ["(-) Desp. Comerciais",      dreData.despesas_comerciais],
        ["(-) Outras Desp. Op.",      dreData.outras_despesas_op],
        ["EBITDA",                    dreData.ebitda],
        ["Resultado Financeiro",      dreData.resultado_financeiro],
        ["Lucro Antes IR",            dreData.lucro_antes_ir],
        ["(-) IR e CSLL",             dreData.ir_csll],
        ["Lucro Líquido",             dreData.lucro_liquido],
      ];

      for (const [label, val] of rows) {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text(label, 15, y);
        doc.text(fmtR(val), W - 15, y, { align: "right" });
        y += 6;
      }

      if (indicadores) {
        y += 6;
        doc.setTextColor(16, 20, 61);
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.text("Indicadores", 15, y); y += 8;
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(0, 0, 0);
        const inds: [string, number][] = [
          ["Margem Bruta",    indicadores.margem_bruta],
          ["Margem EBITDA",   indicadores.margem_ebitda],
          ["Margem Líquida",  indicadores.margem_liquida],
          ["Peso Pessoal / Receita", indicadores.peso_pessoal],
        ];
        for (const [label, val] of inds) {
          doc.text(label, 15, y);
          doc.text(fmtPct(val), W - 15, y, { align: "right" });
          y += 6;
        }
      }
    }

    const ts = new Date().toLocaleDateString("pt-BR");
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Gerado em ${ts} · Diretriz Soluções`, W / 2, 290, { align: "center" });

    doc.save(`relatorio_${periodoAtivo}_${empresaAtiva?.razao_social?.replace(/\s+/g, "_") ?? ""}.pdf`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Relatórios Gerenciais</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Análise de despesas, receitas e DRE por empresa e período
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasData && (
            <Button variant="outline" onClick={exportPDF}>
              <Download className="h-4 w-4 mr-2" /> Exportar PDF
            </Button>
          )}
          <Button onClick={() => setImportOpen(true)} style={{ background: NAVY }} className="text-white hover:opacity-90">
            <Import className="h-4 w-4 mr-2" />
            {hasData ? "Trocar / Reimportar" : "Importar Documentos"}
          </Button>
        </div>
      </div>

      {/* ── Empty state ── */}
      {!hasData && (
        <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed rounded-xl">
          <div className="h-16 w-16 rounded-full flex items-center justify-center mb-4"
            style={{ background: `${NAVY}12` }}>
            <FileBarChart className="h-8 w-8" style={{ color: NAVY }} />
          </div>
          <h3 className="text-lg font-semibold">Nenhum dado carregado</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Clique em "Importar do Finance Insight" para selecionar o DRE e Balancete que deseja analisar.
          </p>
          <Button className="mt-6" onClick={() => setImportOpen(true)} style={{ background: NAVY }}>
            <Import className="h-4 w-4 mr-2" /> Importar Dados
          </Button>
        </div>
      )}

      {/* ── Active header ── */}
      {hasData && (
        <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-50 rounded-xl border">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">{empresaAtiva?.razao_social}</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          <Badge variant="outline">{periodoLabel(periodoAtivo)}</Badge>
          {dreData   && <Badge className="bg-blue-100 text-blue-800 border-0">DRE</Badge>}
          {balData   && <Badge className="bg-purple-100 text-purple-800 border-0">Balancete</Badge>}
          <Button variant="ghost" size="sm" className="ml-auto text-xs text-muted-foreground" onClick={() => setImportOpen(true)}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Trocar dados
          </Button>
        </div>
      )}

      {/* ── Tabs ── */}
      {hasData && (
        <Tabs defaultValue="despesas" className="space-y-4">
          <TabsList className="bg-slate-100 flex flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="despesas">Análise de Despesas</TabsTrigger>
            <TabsTrigger value="receitas">Análise de Receitas</TabsTrigger>
            <TabsTrigger value="dre">DRE Analítico</TabsTrigger>
            {balData && <TabsTrigger value="balancete">Balancete</TabsTrigger>}
            <TabsTrigger value="indices">Índices</TabsTrigger>
            {comparativoMensal.length > 1 && <TabsTrigger value="comparativo">Comparativo Mensal</TabsTrigger>}
          </TabsList>

          {/* ── DESPESAS ── */}
          <TabsContent value="despesas" className="space-y-6">
            {!dreData && (
              <div className="text-sm text-muted-foreground text-center py-10">
                Importe um DRE para ver a análise de despesas.
              </div>
            )}
            {dreData && (
              <>
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <KpiCard title="Total Despesas" value={fmtR(totalDesp)} cor={RED} />
                  <KpiCard
                    title="% da Receita Líquida"
                    value={dreData.receita_liquida ? fmtPct(totalDesp / dreData.receita_liquida * 100) : "—"}
                    sub="quanto das receitas vai para despesas"
                    cor={AMBER}
                  />
                  <KpiCard
                    title="Maior Categoria"
                    value={despesasCat[0]?.nome ?? "—"}
                    sub={despesasCat[0] ? fmtR(despesasCat[0].valor) : ""}
                    cor={NAVY}
                  />
                  <KpiCard
                    title="Resultado Operacional"
                    value={fmtR(dreData.ebitda)}
                    up={dreData.ebitda >= 0}
                    sub="EBITDA"
                    cor={dreData.ebitda >= 0 ? GREEN : RED}
                  />
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Pie */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold" style={{ color: NAVY }}>
                        Composição das Despesas
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie data={despesasCat} dataKey="valor" nameKey="nome"
                            cx="50%" cy="50%" outerRadius={90} label={({ nome, percent }) => `${nome} ${(percent*100).toFixed(0)}%`}
                            labelLine={false}>
                            {despesasCat.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v: any) => fmtR(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Bar */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold" style={{ color: NAVY }}>
                        Despesas por Categoria
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={despesasCat} layout="vertical" margin={{ left: 10, right: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" tickFormatter={v => fmtR(v)} tick={{ fontSize: 10 }} />
                          <YAxis type="category" dataKey="nome" tick={{ fontSize: 11 }} width={110} />
                          <Tooltip formatter={(v: any) => fmtR(v)} />
                          <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                            {despesasCat.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                {/* Table */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold" style={{ color: NAVY }}>
                      Detalhamento — % sobre Receita Líquida
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-slate-50">
                          <th className="text-left py-2 px-4 font-medium text-muted-foreground">Categoria</th>
                          <th className="text-right py-2 px-4 font-medium text-muted-foreground">Valor</th>
                          <th className="text-right py-2 px-4 font-medium text-muted-foreground">% Desp.</th>
                          <th className="text-right py-2 px-4 font-medium text-muted-foreground">% Receita</th>
                        </tr>
                      </thead>
                      <tbody>
                        {despesasCat.map((d, i) => (
                          <tr key={d.nome} className="border-b last:border-0 hover:bg-slate-50">
                            <td className="py-2 px-4">
                              <span className="inline-block w-2.5 h-2.5 rounded-full mr-2"
                                style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                              {d.nome}
                            </td>
                            <td className="py-2 px-4 text-right tabular-nums">{fmtR(d.valor)}</td>
                            <td className="py-2 px-4 text-right tabular-nums text-muted-foreground">
                              {totalDesp ? fmtPct(d.valor / totalDesp * 100) : "—"}
                            </td>
                            <td className="py-2 px-4 text-right tabular-nums text-muted-foreground">
                              {dreData.receita_liquida ? fmtPct(d.valor / dreData.receita_liquida * 100) : "—"}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-slate-50 font-semibold">
                          <td className="py-2 px-4">Total</td>
                          <td className="py-2 px-4 text-right tabular-nums">{fmtR(totalDesp)}</td>
                          <td className="py-2 px-4 text-right">100%</td>
                          <td className="py-2 px-4 text-right tabular-nums text-muted-foreground">
                            {dreData.receita_liquida ? fmtPct(totalDesp / dreData.receita_liquida * 100) : "—"}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ── RECEITAS ── */}
          <TabsContent value="receitas" className="space-y-6">
            {!dreData && (
              <div className="text-sm text-muted-foreground text-center py-10">
                Importe um DRE para ver a análise de receitas.
              </div>
            )}
            {dreData && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <KpiCard title="Receita Bruta"    value={fmtR(dreData.receita_bruta)}   cor={NAVY} />
                  <KpiCard title="Receita Líquida"  value={fmtR(dreData.receita_liquida)} cor="#3b82f6" />
                  <KpiCard title="Margem Bruta"     value={indicadores ? fmtPct(indicadores.margem_bruta) : "—"}
                    sub={fmtR(dreData.lucro_bruto)} cor={GREEN} up={indicadores ? indicadores.margem_bruta > 0 : null} />
                  <KpiCard title="Margem Líquida"   value={indicadores ? fmtPct(indicadores.margem_liquida) : "—"}
                    sub={fmtR(dreData.lucro_liquido)}
                    cor={dreData.lucro_liquido >= 0 ? GREEN : RED}
                    up={dreData.lucro_liquido >= 0} />
                </div>

                {/* Cascade bar */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold" style={{ color: NAVY }}>
                      Cascata de Resultado
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={receitaCascade} margin={{ bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="nome" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" />
                        <YAxis tickFormatter={v => fmtR(v)} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: any) => fmtR(v)} />
                        <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
                          {receitaCascade.map((entry, i) => (
                            <Cell key={i} fill={entry.valor >= 0 ? (i % 2 === 0 ? NAVY : "#3b82f6") : RED} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Revenue detail table */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold" style={{ color: NAVY }}>
                      Análise de Margens
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-slate-50">
                          <th className="text-left py-2 px-4 font-medium text-muted-foreground">Linha</th>
                          <th className="text-right py-2 px-4 font-medium text-muted-foreground">Valor</th>
                          <th className="text-right py-2 px-4 font-medium text-muted-foreground">% Receita Líq.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: "Receita Bruta",   value: dreData.receita_bruta,   bold: false },
                          { label: "(-) Deduções",    value: dreData.deducoes,         bold: false },
                          { label: "Receita Líquida", value: dreData.receita_liquida, bold: true  },
                          { label: "(-) Custo",       value: dreData.custo_servicos,   bold: false },
                          { label: "Lucro Bruto",     value: dreData.lucro_bruto,      bold: true  },
                          { label: "(-) Desp. Operacionais", value: dreData.despesas_pessoal + dreData.despesas_administrativas + dreData.despesas_comerciais + dreData.outras_despesas_op, bold: false },
                          { label: "EBITDA",          value: dreData.ebitda,           bold: true  },
                          { label: "Resultado Fin.",  value: dreData.resultado_financeiro, bold: false },
                          { label: "Lucro Líquido",   value: dreData.lucro_liquido,    bold: true  },
                        ].map((row) => {
                          const pct = dreData.receita_liquida ? row.value / dreData.receita_liquida * 100 : 0;
                          return (
                            <tr key={row.label} className={`border-b last:border-0 ${row.bold ? "font-semibold bg-slate-50" : ""}`}>
                              <td className="py-2 px-4">{row.label}</td>
                              <td className="py-2 px-4 text-right tabular-nums" style={{ color: row.value < 0 ? RED : undefined }}>{fmtR(row.value)}</td>
                              <td className="py-2 px-4 text-right tabular-nums text-muted-foreground">{dreData.receita_liquida ? fmtPct(pct) : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ── DRE ANALÍTICO ── */}
          <TabsContent value="dre" className="space-y-4">
            {!dreData && (
              <div className="text-sm text-muted-foreground text-center py-10">Importe um DRE para visualizar.</div>
            )}
            {dreData && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold" style={{ color: NAVY }}>
                    DRE — {periodoLabel(periodoAtivo)} · {empresaAtiva?.razao_social}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-slate-50">
                        <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground w-[55%]">Descrição</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Valor</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">% R.L.</th>
                      </tr>
                    </thead>
                    <tbody>
                      <DreRow label="Receita Bruta"               value={dreData.receita_bruta}              receita={dreData.receita_liquida} bold />
                      <DreRow label="(-) Deduções"                value={dreData.deducoes}                   receita={dreData.receita_liquida} indent={1} />
                      <DreRow label="Receita Líquida"             value={dreData.receita_liquida}            receita={dreData.receita_liquida} bold highlight="blue" />
                      <DreRow label="(-) Custo dos Serviços"      value={dreData.custo_servicos}             receita={dreData.receita_liquida} indent={1} />
                      <DreRow label="Lucro Bruto"                 value={dreData.lucro_bruto}                receita={dreData.receita_liquida} bold highlight={dreData.lucro_bruto >= 0 ? "green" : "red"} />
                      <DreRow label="(-) Despesas de Pessoal"     value={dreData.despesas_pessoal}           receita={dreData.receita_liquida} indent={1} />
                      <DreRow label="(-) Despesas Administrativas"value={dreData.despesas_administrativas}   receita={dreData.receita_liquida} indent={1} />
                      <DreRow label="(-) Despesas Comerciais"     value={dreData.despesas_comerciais}        receita={dreData.receita_liquida} indent={1} />
                      <DreRow label="(-) Outras Despesas Op."     value={dreData.outras_despesas_op}         receita={dreData.receita_liquida} indent={1} />
                      <DreRow label="EBITDA"                      value={dreData.ebitda}                     receita={dreData.receita_liquida} bold highlight={dreData.ebitda >= 0 ? "green" : "red"} />
                      <DreRow label="(-) Depreciação/Amortização" value={dreData.depreciacao_amortizacao}    receita={dreData.receita_liquida} indent={1} />
                      <DreRow label="EBIT"                        value={dreData.ebit}                       receita={dreData.receita_liquida} bold />
                      <DreRow label="(+) Receitas Financeiras"    value={dreData.receitas_financeiras}       receita={dreData.receita_liquida} indent={1} />
                      <DreRow label="(-) Despesas Financeiras"    value={dreData.despesas_financeiras}       receita={dreData.receita_liquida} indent={1} />
                      <DreRow label="Resultado Financeiro"        value={dreData.resultado_financeiro}       receita={dreData.receita_liquida} bold />
                      <DreRow label="Lucro Antes do IR"           value={dreData.lucro_antes_ir}             receita={dreData.receita_liquida} bold />
                      <DreRow label="(-) IR e CSLL"               value={dreData.ir_csll}                    receita={dreData.receita_liquida} indent={1} />
                      <DreRow label="Lucro Líquido"               value={dreData.lucro_liquido}              receita={dreData.receita_liquida} bold highlight={dreData.lucro_liquido >= 0 ? "green" : "red"} />
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── BALANCETE ── */}
          {balData && (
            <TabsContent value="balancete" className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Label className="text-sm font-medium">Grau:</Label>
                {Array.from({ length: balMaxNivel }, (_, i) => i + 1).map(n => (
                  <Button
                    key={n}
                    size="sm"
                    variant={balNivel === n ? "default" : "outline"}
                    className="h-7 min-w-[28px] px-2 text-xs"
                    style={balNivel === n ? { background: NAVY } : {}}
                    onClick={() => setBalNivel(n)}
                  >
                    {n}
                  </Button>
                ))}
                <span className="text-xs text-muted-foreground ml-1">
                  {balContasFiltradas.length} conta{balContasFiltradas.length !== 1 ? "s" : ""}
                  {balData ? ` / ${balData.contas.length} total` : ""}
                </span>
              </div>
              <Card>
                <CardContent className="p-0">
                  <ScrollArea className="h-[520px]">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-white z-10">
                        <tr className="border-b bg-slate-50">
                          <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground w-32">Código</th>
                          <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Conta</th>
                          <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Saldo Ant.</th>
                          <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Débitos</th>
                          <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Créditos</th>
                          <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Saldo Atual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {balContasFiltradas.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                              Nenhuma conta no grau {balNivel}. Tente outro grau.
                            </td>
                          </tr>
                        )}
                        {balContasFiltradas.map((c) => (
                          <tr key={c.codigo} className="border-b last:border-0 hover:bg-slate-50">
                            <td className="py-1.5 px-3 text-xs text-muted-foreground font-mono">{c.codigo}</td>
                            <td className="py-1.5 px-3 font-medium">{c.nome}</td>
                            <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground text-xs">
                              {c.saldo_anterior > 0 ? fmtR(c.saldo_anterior) : "—"}
                            </td>
                            <td className="py-1.5 px-3 text-right tabular-nums">{c.debitos > 0 ? fmtR(c.debitos) : "—"}</td>
                            <td className="py-1.5 px-3 text-right tabular-nums">{c.creditos > 0 ? fmtR(c.creditos) : "—"}</td>
                            <td className="py-1.5 px-3 text-right tabular-nums font-semibold">
                              {fmtR(c.saldo_atual)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* ── ÍNDICES ── */}
          <TabsContent value="indices" className="space-y-4">
            {!indicadores && (
              <div className="text-sm text-muted-foreground text-center py-10">Importe um DRE para calcular os índices.</div>
            )}
            {indicadores && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: "Margem Bruta",         value: indicadores.margem_bruta,    ref: 30, desc: "Lucro Bruto / Receita Líquida" },
                  { label: "Margem EBITDA",         value: indicadores.margem_ebitda,   ref: 15, desc: "EBITDA / Receita Líquida" },
                  { label: "Margem Líquida",        value: indicadores.margem_liquida,  ref: 8,  desc: "Lucro Líquido / Receita Líquida" },
                  { label: "Peso Pessoal",          value: indicadores.peso_pessoal,    ref: 30, desc: "Desp. Pessoal / Receita Líquida", inverso: true },
                  { label: "Peso Administrativo",  value: indicadores.peso_adm,         ref: 15, desc: "Desp. Admin / Receita Líquida", inverso: true },
                  { label: "Peso Financeiro",       value: indicadores.peso_financeiro, ref: 5,  desc: "Desp. Fin / Receita Líquida", inverso: true },
                ].map((ind) => {
                  const ok = ind.inverso ? ind.value <= ind.ref : ind.value >= ind.ref;
                  return (
                    <Card key={ind.label} className="overflow-hidden">
                      <div className="h-1" style={{ background: ok ? GREEN : (ind.value > 0 ? AMBER : RED) }} />
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{ind.label}</p>
                            <p className="text-2xl font-bold mt-1" style={{ color: NAVY }}>{fmtPct(ind.value)}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{ind.desc}</p>
                          </div>
                          {ok
                            ? <CheckCircle className="h-5 w-5 mt-1 shrink-0" style={{ color: GREEN }} />
                            : <AlertTriangle className="h-5 w-5 mt-1 shrink-0" style={{ color: ind.value > 0 ? AMBER : RED }} />
                          }
                        </div>
                        <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(Math.abs(ind.value) / (ind.ref * 2) * 100, 100)}%`,
                              background: ok ? GREEN : AMBER,
                            }} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Referência: {ind.inverso ? "≤" : "≥"} {ind.ref}%
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── COMPARATIVO MENSAL ── */}
          {comparativoMensal.length > 1 && (
            <TabsContent value="comparativo" className="space-y-6">
              {/* Line chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold" style={{ color: NAVY }}>
                    Evolução Mensal — Receita, Despesas e Lucro
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={comparativoChart} margin={{ left: 10, right: 10, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="periodo" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={v => fmtR(v)} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: any) => fmtR(v)} />
                      <Legend />
                      <Line type="monotone" dataKey="Receita Líquida" stroke={NAVY}   strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="Despesas Totais"  stroke={RED}    strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="Lucro Líquido"    stroke={GREEN}  strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="EBITDA"           stroke={AMBER}  strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 2" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Bar comparativo */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold" style={{ color: NAVY }}>
                    Comparativo de Receita e Despesas por Mês
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={comparativoChart} margin={{ bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="periodo" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={v => fmtR(v)} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: any) => fmtR(v)} />
                      <Legend />
                      <Bar dataKey="Receita Líquida" fill={NAVY}  radius={[3,3,0,0]} />
                      <Bar dataKey="Despesas Totais"  fill={RED}   radius={[3,3,0,0]} />
                      <Bar dataKey="Lucro Líquido"    fill={GREEN} radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Tabela comparativa */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold" style={{ color: NAVY }}>
                    Tabela Comparativa — DRE por Mês
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-sm min-w-[600px]">
                    <thead>
                      <tr className="border-b bg-slate-50">
                        <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground w-44">Linha</th>
                        {comparativoMensal.map(({ periodo }) => (
                          <th key={periodo} className="text-right py-2 px-3 text-xs font-medium" style={{ color: NAVY }}>
                            {periodoLabel(periodo)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { key: "receita_bruta",        label: "Receita Bruta",          bold: false },
                        { key: "receita_liquida",       label: "Receita Líquida",         bold: true  },
                        { key: "lucro_bruto",           label: "Lucro Bruto",             bold: true  },
                        { key: "despesas_pessoal",      label: "Desp. Pessoal",           bold: false },
                        { key: "despesas_administrativas", label: "Desp. Admin.",         bold: false },
                        { key: "despesas_comerciais",   label: "Desp. Comerciais",        bold: false },
                        { key: "ebitda",                label: "EBITDA",                  bold: true  },
                        { key: "resultado_financeiro",  label: "Resultado Fin.",          bold: false },
                        { key: "lucro_liquido",         label: "Lucro Líquido",           bold: true  },
                      ].map(row => (
                        <tr key={row.key} className={`border-b last:border-0 ${row.bold ? "font-semibold bg-slate-50" : ""}`}>
                          <td className="py-1.5 px-3">{row.label}</td>
                          {comparativoMensal.map(({ periodo, dre }) => {
                            const v = (dre as any)[row.key] ?? 0;
                            return (
                              <td key={periodo} className="py-1.5 px-3 text-right tabular-nums"
                                style={{ color: v < 0 && row.bold ? RED : undefined }}>
                                {fmtR(v)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      )}

      {/* ── Import Dialog ── */}
      <Dialog open={importOpen} onOpenChange={v => { setImportOpen(v); if (!v) resetDialog(); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle style={{ color: NAVY }} className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" style={{ color: RED }} /> Importar Documentos
            </DialogTitle>
          </DialogHeader>

          {/* Mode toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
            <button
              onClick={() => { setImpMode("financeiro"); resetDialog(); }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${impMode === "financeiro" ? "bg-white shadow text-[#10143D]" : "text-slate-500 hover:text-slate-700"}`}
            >
              <Import className="h-4 w-4" /> Finance Insight
            </button>
            <button
              onClick={() => { setImpMode("upload"); resetDialog(); }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${impMode === "upload" ? "bg-white shadow text-[#10143D]" : "text-slate-500 hover:text-slate-700"}`}
            >
              <Upload className="h-4 w-4" /> Upload de PDF
            </button>
          </div>

          {/* ── Finance Insight mode ── */}
          {impMode === "financeiro" && (
            <div className="space-y-4">
              <div>
                <Label>Empresa</Label>
                <Select value={impEmpresa} onValueChange={setImpEmpresa}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione a empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.razao_social}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {impEmpresa && (
                <div>
                  <Label>Período</Label>
                  {impLoading ? <Skeleton className="h-9 mt-1" /> : periodos.length === 0 ? (
                    <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-3">
                      Nenhum documento encontrado. Use <strong>Upload de PDF</strong> ou acesse o Finance Insight para gerar documentos.
                    </div>
                  ) : (
                    <Select value={impPeriodo} onValueChange={setImpPeriodo}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Selecione o período" />
                      </SelectTrigger>
                      <SelectContent>
                        {periodos.map(p => <SelectItem key={p} value={p}>{periodoLabel(p)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {impPeriodo && (
                <div className="grid grid-cols-2 gap-3">
                  {/* DRE card */}
                  {(["DRE", "Balancete"] as const).map(tipo => {
                    const docs = tipo === "DRE" ? dreDocs : balDocs;
                    const selId = tipo === "DRE" ? impDreId : impBalId;
                    const setSel = tipo === "DRE" ? setImpDreId : setImpBalId;
                    const active = !!selId;
                    return (
                      <div key={tipo}
                        className={`rounded-xl border-2 p-4 cursor-pointer transition-all ${active ? "border-[#10143D] bg-blue-50" : docs.length === 0 ? "border-dashed border-slate-200 opacity-60" : "border-slate-200 hover:border-slate-400"}`}
                        onClick={() => { if (docs.length === 0) return; setSel(active ? "" : docs[0].id); }}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4" style={{ color: active ? NAVY : "#94a3b8" }} />
                            <span className="text-sm font-semibold" style={{ color: active ? NAVY : "#64748b" }}>{tipo}</span>
                          </div>
                          <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${active ? "border-[#10143D] bg-[#10143D]" : "border-slate-300"}`}>
                            {active && <CheckCircle className="h-3.5 w-3.5 text-white" />}
                          </div>
                        </div>
                        {docs.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Nenhum disponível</p>
                        ) : (
                          <p className="text-xs text-muted-foreground">{docs.length} documento{docs.length > 1 ? "s" : ""} disponível{docs.length > 1 ? "s" : ""}</p>
                        )}
                        {docs.length > 1 && active && (
                          <Select value={selId} onValueChange={setSel} onClick={e => e.stopPropagation()}>
                            <SelectTrigger className="mt-2 h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {docs.map(d => (
                                <SelectItem key={d.id} value={d.id} className="text-xs">
                                  {d.arquivo_nome ?? `${tipo} ${periodoLabel(d.periodo)}`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button>
                <Button onClick={handleImportar} disabled={!impPeriodo || (!impDreId && !impBalId)}
                  style={{ background: NAVY }} className="text-white">
                  <Import className="h-4 w-4 mr-2" /> Importar e Analisar
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* ── Upload PDF mode ── */}
          {impMode === "upload" && (
            <div className="space-y-4">
              <div>
                <Label>Período de referência</Label>
                <input type="month" value={upPeriodo} onChange={e => setUpPeriodo(e.target.value)}
                  className="mt-1 block w-44 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* DRE upload zone */}
                {(["DRE", "Balancete"] as const).map(tipo => {
                  const file   = tipo === "DRE" ? upDreFile   : upBalFile;
                  const parsed = tipo === "DRE" ? upDreParsed : upBalParsed;
                  const ref    = tipo === "DRE" ? upDreRef    : upBalRef;
                  const clear  = () => tipo === "DRE" ? (setUpDreFile(null), setUpDreParsed(null)) : (setUpBalFile(null), setUpBalParsed(null));
                  return (
                    <div key={tipo}>
                      <input ref={ref} type="file" accept=".pdf" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileChange(tipo === "DRE" ? "dre" : "bal", f); e.target.value = ""; }} />
                      <div
                        onClick={() => !file && ref.current?.click()}
                        className={`rounded-xl border-2 border-dashed p-4 text-center transition-all min-h-[130px] flex flex-col items-center justify-center gap-2
                          ${parsed ? "border-green-400 bg-green-50" : "border-slate-300 hover:border-[#10143D] hover:bg-slate-50 cursor-pointer"}`}
                      >
                        {upParsing && !file ? (
                          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                        ) : parsed ? (
                          <>
                            <CheckCircle className="h-6 w-6 text-green-500" />
                            <p className="text-xs font-semibold text-green-700">{tipo} lido com sucesso</p>
                            <p className="text-[10px] text-muted-foreground truncate max-w-full px-2">{file?.name}</p>
                            {tipo === "DRE" && upDreParsed && (
                              <p className="text-[10px] text-green-700 font-medium">
                                Receita: {fmtR(upDreParsed.receita_liquida)}
                              </p>
                            )}
                            {tipo === "Balancete" && upBalParsed && (
                              <p className="text-[10px] text-green-700 font-medium">
                                {upBalParsed.contas.length} contas
                              </p>
                            )}
                            <button onClick={e => { e.stopPropagation(); clear(); }}
                              className="text-[10px] text-red-500 hover:underline flex items-center gap-0.5 mt-1">
                              <X className="h-3 w-3" /> remover
                            </button>
                          </>
                        ) : (
                          <>
                            <Upload className="h-6 w-6 text-slate-400" />
                            <p className="text-xs font-semibold text-slate-600">{tipo}</p>
                            <p className="text-[10px] text-muted-foreground">Arraste ou clique para selecionar PDF</p>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground bg-blue-50 border border-blue-100 rounded p-2">
                O sistema lê o texto do PDF e extrai automaticamente os valores do DRE e Balancete usando inteligência de reconhecimento contábil.
              </p>

              <DialogFooter>
                <Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button>
                <Button onClick={handleImportarUpload}
                  disabled={upParsing || (!upDreParsed && !upBalParsed)}
                  style={{ background: NAVY }} className="text-white">
                  {upParsing
                    ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Lendo PDF...</>
                    : <><Sparkles className="h-4 w-4 mr-2" /> Analisar</>
                  }
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
