import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Building2, Trash2, Loader2, Pencil, MapPin, UserPlus, Cake, Users2, Banknote, Upload, Monitor, Landmark, RefreshCw, Wifi, Copy, CheckCheck, ExternalLink } from "lucide-react";
import { BankLogo } from "@/components/BankLogo";
import { ExportButton } from "@/components/ExportButton";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import * as XLSX from "xlsx";

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatCNPJ(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function validateCNPJ(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (s: string, w: number[]) => w.reduce((sum, n, i) => sum + Number(s[i]) * n, 0);
  const r1 = calc(d, [5,4,3,2,9,8,7,6,5,4,3,2]) % 11;
  const r2 = calc(d, [6,5,4,3,2,9,8,7,6,5,4,3,2]) % 11;
  return Number(d[12]) === (r1 < 2 ? 0 : 11 - r1) && Number(d[13]) === (r2 < 2 ? 0 : 11 - r2);
}

function formatPhone(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 9);
  if (d.length <= 4) return d;
  if (d.length <= 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function parsePhone(tel: string | null) {
  if (!tel) return { ddd: "", numero: "" };
  const d = tel.replace(/\D/g, "");
  return { ddd: d.slice(0, 2), numero: d.slice(2) };
}

function formatCPF(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatCEP(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.replace(/(\d{5})(\d)/, "$1-$2");
}

const UF_LIST = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

// ── Plano de Contas TXT helpers ───────────────────────────────────────────────

type PlanoContaTipo = "receita" | "despesa" | "investimento" | "imposto";

function detectTipoPC(nome: string): PlanoContaTipo {
  const n = nome.toLowerCase();
  if (n.includes("receita") || n.includes("faturamento") || n.includes("venda")) return "receita";
  if (n.includes("imposto") || n.includes("tributo") || n.includes("das") || n.includes("irpj") || n.includes("csll") || n.includes("pis") || n.includes("cofins") || n.includes("iss") || n.includes("inss") || n.includes("fgts")) return "imposto";
  if (n.includes("investimento") || n.includes("ativo") || n.includes("imobilizado")) return "investimento";
  return "despesa";
}

// Verifica se um valor parece um código contábil (tem dígito, curto, não é número sequencial puro)
function isCodigoContabil(v: string): boolean {
  if (!v || !/\d/.test(v) || v.length > 20) return false;
  // Aceita formatos: "1", "1.1", "1.01.001", "101001", "1-01-001"
  return /^[\d][.\d-]*$/.test(v);
}

// Verifica se um valor parece um nome de conta (texto com letras, comprimento razoável)
function isNomeConta(v: string): boolean {
  return v.length >= 2 && /[A-Za-zÀ-ú]/.test(v);
}

// Converte código Domínio sem pontos (11201009) → classificação dotada (1.1.2.01.009)
function toDottedPC(code: string, grau: number): string {
  const LENS = [1, 1, 1, 2, 3, 3];
  const parts: string[] = [];
  let pos = 0;
  for (let i = 0; i < grau && i < LENS.length && pos < code.length; i++) {
    parts.push(code.slice(pos, pos + LENS[i]));
    pos += LENS[i];
  }
  return parts.join(".");
}

function parseTxtPC(txt: string): { codigo: string; classificacao: string; natureza: string; grau: number; nome: string; tipo: PlanoContaTipo }[] {
  const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const result: { codigo: string; classificacao: string; natureza: string; grau: number; nome: string; tipo: PlanoContaTipo }[] = [];

  for (const line of lines) {
    if (/classificaç[aã]o|c[oó]digo|descri[cç][aã]o/i.test(line)) continue;
    if (!line.trim()) continue;

    const tokens = line.split(/\s+/).filter(Boolean);

    // ── Formato Domínio (arquivo TXT exportado) ─────────────────────────────
    // empCod  seqNo  NOME  dominioCode  [S|A]  mascara  EMPRESA  cnpjEmp  grau  [cnpjCliente]
    if (tokens.length >= 9 && /^\d+$/.test(tokens[0]) && /^\d+$/.test(tokens[1])) {
      let ri = tokens.length - 1;
      if (/^\d{11,14}$/.test(tokens[ri]) && ri > 9) {
        const prev = tokens[ri - 1];
        if (/^\d{1,2}$/.test(prev) && +prev >= 1 && +prev <= 9) ri--;
      }
      const grau = parseInt(tokens[ri]); ri--;
      if (isNaN(grau) || grau < 1 || grau > 9) continue;
      if (!/^\d{11,14}$/.test(tokens[ri])) continue;
      ri--;
      let mascaraIdx = -1;
      for (let i = ri; i >= 4; i--) {
        if (/^\d[\d.]+\d$/.test(tokens[i]) && tokens[i].includes(".")) { mascaraIdx = i; break; }
      }
      if (mascaraIdx < 0) continue;
      const natureza = tokens[mascaraIdx - 1];
      if (!/^[SA]$/i.test(natureza)) continue;
      const dominioCode = tokens[mascaraIdx - 2];
      if (!/^\d+$/.test(dominioCode)) continue;
      const nome = tokens.slice(2, mascaraIdx - 2).join(" ").trim();
      if (!nome) continue;
      const classificacao = toDottedPC(dominioCode, grau);
      result.push({ codigo: tokens[1], classificacao, natureza: natureza.toUpperCase(), grau, nome, tipo: detectTipoPC(classificacao.split(".")[0] === "1" ? "ativo" : nome) });
      continue;
    }

    // ── Formato Excel/CSV com colunas: Classificação;Código;T;Descrição;CNPJ;Grau ─
    let parts: string[] = [];
    if (line.includes("\t"))     parts = line.split("\t").map(p => p.trim());
    else if (line.includes(";")) parts = line.split(";").map(p => p.trim());
    else {
      const m = line.match(/^([\d.]+)\s+(\d+)\s+([SA])\s+(.+?)(?:\s+\d{11,14})?\s*(\d+)?\s*$/i);
      if (m) parts = [m[1], m[2], m[3], m[4].trim(), "", m[5] ?? ""];
    }
    if (parts.length < 2) continue;
    const rawCode  = parts[0];
    if (!/^[\d.]+$/.test(rawCode)) continue;
    const codigo   = parts[1] || parts[0];
    const natureza = (parts[2] || "A").toUpperCase() === "S" ? "S" : "A";
    const nome     = (parts[3] || "").trim();
    const grauRaw  = parseInt(parts[5] ?? "");
    const grau     = !isNaN(grauRaw) && grauRaw > 0 ? grauRaw : rawCode.split(".").length;
    if (!nome || /^\d+$/.test(nome)) continue;
    const classificacao = /^\d+$/.test(rawCode) ? toDottedPC(rawCode, grau) : rawCode;
    result.push({ codigo, classificacao, natureza, grau, nome, tipo: detectTipoPC(classificacao.split(".")[0] === "1" ? "ativo" : nome) });
  }
  return result;
}

// ── Types ────────────────────────────────────────────────────────────────────

type Socio = {
  nome: string;
  cpf: string;
  data_nascimento: string;
  email: string;
  cargo: string;
};

const EMPTY_SOCIO: Socio = { nome: "", cpf: "", data_nascimento: "", email: "", cargo: "" };

// Resolve código do perfil baseado nos atributos da empresa
function resolvePerfilCodigo(regime: string, atividade: string, prolabore: boolean, funcionario: boolean): string {
  const r = regime === "simples" ? "SN" : regime === "presumido" ? "LP" : regime === "real" ? "LR" : null;
  const a = atividade === "servico" ? "SERV" : atividade === "comercio" ? "COM" : atividade === "misto" ? "MIX" : null;
  if (!r || !a) return "—";
  return `${r}-${a}-PL-${funcionario ? "CF" : "SF"}`;
}

// ── Perfis pré-definidos ──────────────────────────────────────────────────────
const PERFIS_PREDEFINIDOS = [
  // Simples Nacional
  { codigo: "SN-SERV-PL-SF",  label: "Serviço — Simples Nacional — c/ Pró-labore — s/ Funcionário",          regime: "simples",   atividade: "servico",  prolabore: true,  funcionario: false },
  { codigo: "SN-SERV-PL-CF",  label: "Serviço — Simples Nacional — c/ Pró-labore — c/ Funcionário",          regime: "simples",   atividade: "servico",  prolabore: true,  funcionario: true  },
  { codigo: "SN-COM-PL-SF",   label: "Comércio — Simples Nacional — c/ Pró-labore — s/ Funcionário",         regime: "simples",   atividade: "comercio", prolabore: true,  funcionario: false },
  { codigo: "SN-COM-PL-CF",   label: "Comércio — Simples Nacional — c/ Pró-labore — c/ Funcionário",         regime: "simples",   atividade: "comercio", prolabore: true,  funcionario: true  },
  { codigo: "SN-MIX-PL-SF",   label: "Serviço e Comércio — Simples Nacional — c/ Pró-labore — s/ Funcionário", regime: "simples",  atividade: "misto",    prolabore: true,  funcionario: false },
  { codigo: "SN-MIX-PL-CF",   label: "Serviço e Comércio — Simples Nacional — c/ Pró-labore — c/ Funcionário", regime: "simples",  atividade: "misto",    prolabore: true,  funcionario: true  },
  // Lucro Presumido
  { codigo: "LP-SERV-PL-SF",  label: "Serviço — Lucro Presumido — c/ Pró-labore — s/ Funcionário",           regime: "presumido", atividade: "servico",  prolabore: true,  funcionario: false },
  { codigo: "LP-SERV-PL-CF",  label: "Serviço — Lucro Presumido — c/ Pró-labore — c/ Funcionário",           regime: "presumido", atividade: "servico",  prolabore: true,  funcionario: true  },
  { codigo: "LP-COM-PL-SF",   label: "Comércio — Lucro Presumido — c/ Pró-labore — s/ Funcionário",          regime: "presumido", atividade: "comercio", prolabore: true,  funcionario: false },
  { codigo: "LP-COM-PL-CF",   label: "Comércio — Lucro Presumido — c/ Pró-labore — c/ Funcionário",          regime: "presumido", atividade: "comercio", prolabore: true,  funcionario: true  },
  { codigo: "LP-MIX-PL-SF",   label: "Serviço e Comércio — Lucro Presumido — c/ Pró-labore — s/ Funcionário", regime: "presumido", atividade: "misto",   prolabore: true,  funcionario: false },
  { codigo: "LP-MIX-PL-CF",   label: "Serviço e Comércio — Lucro Presumido — c/ Pró-labore — c/ Funcionário", regime: "presumido", atividade: "misto",   prolabore: true,  funcionario: true  },
  // Lucro Real
  { codigo: "LR-SERV-PL-SF",  label: "Serviço — Lucro Real — c/ Pró-labore — s/ Funcionário",                regime: "real",      atividade: "servico",  prolabore: true,  funcionario: false },
  { codigo: "LR-SERV-PL-CF",  label: "Serviço — Lucro Real — c/ Pró-labore — c/ Funcionário",                regime: "real",      atividade: "servico",  prolabore: true,  funcionario: true  },
  { codigo: "LR-COM-PL-SF",   label: "Comércio — Lucro Real — c/ Pró-labore — s/ Funcionário",               regime: "real",      atividade: "comercio", prolabore: true,  funcionario: false },
  { codigo: "LR-COM-PL-CF",   label: "Comércio — Lucro Real — c/ Pró-labore — c/ Funcionário",               regime: "real",      atividade: "comercio", prolabore: true,  funcionario: true  },
  { codigo: "LR-MIX-PL-SF",   label: "Serviço e Comércio — Lucro Real — c/ Pró-labore — s/ Funcionário",     regime: "real",      atividade: "misto",    prolabore: true,  funcionario: false },
  { codigo: "LR-MIX-PL-CF",   label: "Serviço e Comércio — Lucro Real — c/ Pró-labore — c/ Funcionário",     regime: "real",      atividade: "misto",    prolabore: true,  funcionario: true  },
];

// ── Componente: seletor de perfil tributário ──────────────────────────────────
function PerfilTributarioSelector({
  form,
  setForm,
}: {
  form: any;
  setForm: React.Dispatch<React.SetStateAction<any>>;
}) {
  const [personalizar, setPersonalizar] = useState(false);

  // Detecta o código do perfil atual para pré-selecionar o dropdown
  const codigoAtual = resolvePerfilCodigo(
    form.regime_tributario, form.atividade, form.possui_prolabore, form.possui_funcionario
  );
  const perfilSelecionado = PERFIS_PREDEFINIDOS.find(p => p.codigo === codigoAtual);

  function handleSelectPerfil(codigo: string) {
    if (codigo === "_personalizar") {
      setPersonalizar(true);
      return;
    }
    const perfil = PERFIS_PREDEFINIDOS.find(p => p.codigo === codigo);
    if (!perfil) return;
    setPersonalizar(false);
    setForm((prev: any) => ({
      ...prev,
      regime_tributario: perfil.regime,
      atividade: perfil.atividade,
      possui_prolabore: perfil.prolabore,
      possui_funcionario: perfil.funcionario,
    }));
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Perfil Tributário</Label>
        <Select
          value={personalizar ? "_personalizar" : (perfilSelecionado?.codigo ?? "")}
          onValueChange={handleSelectPerfil}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione o perfil da empresa..." />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {PERFIS_PREDEFINIDOS.map(p => (
              <SelectItem key={p.codigo} value={p.codigo}>{p.label}</SelectItem>
            ))}
            <SelectItem value="_personalizar">— Personalizar manualmente —</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Campos manuais: só aparecem em "Personalizar" */}
      {personalizar && (
        <div className="rounded-lg border border-dashed p-4 space-y-3">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Configuração manual</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Regime Tributário</Label>
              <Select value={form.regime_tributario} onValueChange={v => setForm((p: any) => ({ ...p, regime_tributario: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="simples">Simples Nacional</SelectItem>
                  <SelectItem value="presumido">Lucro Presumido</SelectItem>
                  <SelectItem value="real">Lucro Real</SelectItem>
                  <SelectItem value="mei">MEI</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Atividade</Label>
              <Select value={form.atividade} onValueChange={v => setForm((p: any) => ({ ...p, atividade: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="servico">Serviço</SelectItem>
                  <SelectItem value="comercio">Comércio</SelectItem>
                  <SelectItem value="misto">Misto (Serv + Com)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Checkbox id="possui_prolabore" checked={form.possui_prolabore}
                onCheckedChange={v => setForm((p: any) => ({ ...p, possui_prolabore: !!v }))} />
              <label htmlFor="possui_prolabore" className="text-sm cursor-pointer select-none">Pró-labore</label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="possui_funcionario" checked={form.possui_funcionario}
                onCheckedChange={v => setForm((p: any) => ({ ...p, possui_funcionario: !!v }))} />
              <label htmlFor="possui_funcionario" className="text-sm cursor-pointer select-none">Funcionários CLT</label>
            </div>
          </div>
        </div>
      )}

      {/* Flags adicionais — sempre visíveis */}
      <div className="rounded-lg bg-muted/40 px-4 py-3 space-y-2">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Obrigações adicionais</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <Checkbox id="tem_retencoes" checked={form.tem_retencoes}
              onCheckedChange={v => setForm((p: any) => ({ ...p, tem_retencoes: !!v }))} />
            <label htmlFor="tem_retencoes" className="text-sm cursor-pointer select-none">Retenções na fonte</label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="tem_reinf" checked={form.tem_reinf}
              onCheckedChange={v => setForm((p: any) => ({ ...p, tem_reinf: !!v }))} />
            <label htmlFor="tem_reinf" className="text-sm cursor-pointer select-none">EFD-Reinf</label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="contribuinte_iss" checked={form.contribuinte_iss}
              onCheckedChange={v => setForm((p: any) => ({ ...p, contribuinte_iss: !!v }))} />
            <label htmlFor="contribuinte_iss" className="text-sm cursor-pointer select-none">Contribuinte ISS</label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="contribuinte_icms" checked={form.contribuinte_icms}
              onCheckedChange={v => setForm((p: any) => ({ ...p, contribuinte_icms: !!v }))} />
            <label htmlFor="contribuinte_icms" className="text-sm cursor-pointer select-none">Contribuinte ICMS</label>
          </div>
        </div>
      </div>

      {/* Badge de código do perfil */}
      {!personalizar && perfilSelecionado && (
        <p className="text-xs text-muted-foreground">
          Código:{" "}
          <Badge variant="outline" className="text-xs font-mono">{perfilSelecionado.codigo}</Badge>
        </p>
      )}
    </div>
  );
}

const EMPTY_FORM = {
  cnpj: "", razao_social: "",
  // endereço
  cep: "", logradouro: "", numero: "", complemento: "", bairro: "",
  municipio: "", uf: "",
  // dados
  regime_tributario: "",
  telefone_ddd: "", telefone_numero: "", email_responsavel: "",
  inscricao_municipal: "", inscricao_estadual: "", isento_ie: false,
  // perfil operacional
  atividade: "servico",
  possui_prolabore: true,
  possui_funcionario: false,
  tem_retencoes: false,
  tem_reinf: false,
  contribuinte_iss: false,
  contribuinte_icms: false,
  // financeiro / integração Domínio
  codigo_dominio: "", plano_contas_dominio: "", codigo_contabil: "",
  // monitoramento — responsáveis por departamento
  responsavel_fiscal_id:   "",
  responsavel_contabil_id: "",
  responsavel_pessoal_id:  "",
};

// ── Component ────────────────────────────────────────────────────────────────

export default function Empresas() {
  const { user, podeIncluir: PODE_INCLUIR, podeEditar: PODE_EDITAR, podeExcluir: PODE_EXCLUIR, ownerUserId } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [empresas,   setEmpresas]   = useState<Tables<"empresas">[]>([]);
  const [sociosMap,  setSociosMap]  = useState<Record<string, Socio[]>>({});
  const [contasMap,  setContasMap]  = useState<Record<string, { banco: string; conta: string | null }[]>>({});
  const [search,     setSearch]     = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [page,       setPage]       = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const [socios,    setSocios]    = useState<Socio[]>([]);
  const [socioForm, setSocioForm] = useState<Socio>(EMPTY_SOCIO);
  const [activeTab, setActiveTab] = useState("empresa");
  const [equipe,    setEquipe]    = useState<{ id: string; nome: string }[]>([]);

  const [loadingCnpj, setLoadingCnpj] = useState(false);
  const [loadingCep,  setLoadingCep]  = useState(false);

  const [pcPreview,       setPcPreview]       = useState<{ codigo: string; nome: string; tipo: PlanoContaTipo }[]>([]);
  const [pcDialogOpen,    setPcDialogOpen]    = useState(false);
  const [pcImporting,     setPcImporting]     = useState(false);
  const [pcContas,        setPcContas]        = useState<{ id: string; codigo: string; nome: string; tipo: string }[]>([]);
  const pcFileRef = useRef<HTMLInputElement>(null);

  // ── Contas Bancárias da Empresa ───────────────────────────────────────────
  const EMPTY_CB = { banco: "", agencia: "", conta: "", tipo: "corrente", descricao: "", saldo_inicial: "", codigo_dominio: "" };
  const [cbsEmpresa,    setCbsEmpresa]    = useState<{ id: string; banco: string; agencia: string | null; conta: string | null; tipo: string; descricao: string | null; saldo_inicial: number; codigo_dominio: string | null }[]>([]);
  const [cbForm,        setCbForm]        = useState(EMPTY_CB);
  const [cbEditingId,   setCbEditingId]   = useState<string | null>(null);
  const [cbSaving,      setCbSaving]      = useState(false);

  const loadCbsEmpresa = async (empresaId: string) => {
    const { data } = await supabase.from("contas_bancarias").select("id, banco, agencia, conta, tipo, descricao, saldo_inicial, codigo_dominio").eq("empresa_id", empresaId).order("banco");
    setCbsEmpresa(data ?? []);
    const ids = (data ?? []).map(c => c.id);
    if (ids.length) {
      const { data: conns } = await (supabase as any).from("pluggy_connections").select("conta_bancaria_id, item_id, status").in("conta_bancaria_id", ids);
      const map: Record<string, { item_id: string; status: string }> = {};
      for (const c of conns ?? []) map[c.conta_bancaria_id] = { item_id: c.item_id, status: c.status };
      setPluggyConns(map);
    } else {
      setPluggyConns({});
    }
  };

  const handleCbSubmit = async () => {
    if (!cbForm.banco.trim() || !editingId) return;
    setCbSaving(true);
    const payload = {
      user_id: ownerUserId!, empresa_id: editingId,
      banco: cbForm.banco.trim(), agencia: cbForm.agencia || null,
      conta: cbForm.conta || null, tipo: cbForm.tipo,
      descricao: cbForm.descricao || null,
      saldo_inicial: parseFloat(cbForm.saldo_inicial as string) || 0,
      codigo_dominio: cbForm.codigo_dominio.trim() || null,
    };

    if (cbEditingId) {
      const { error } = await supabase.from("contas_bancarias").update(payload).eq("id", cbEditingId);
      setCbSaving(false);
      if (error) { toast({ title: "Erro ao salvar conta", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Conta atualizada!" });
      setCbForm(EMPTY_CB); setCbEditingId(null);
      loadCbsEmpresa(editingId);
    } else {
      const { data: nova, error } = await supabase.from("contas_bancarias").insert(payload).select("id").single();
      setCbSaving(false);
      if (error || !nova) { toast({ title: "Erro ao salvar conta", description: error?.message, variant: "destructive" }); return; }
      setCbForm(EMPTY_CB);
      await loadCbsEmpresa(editingId);
      // Abre o dialog de integração bancária automaticamente para o contador gerar o link ao cliente
      setGerarLinkContaId(nova.id);
      setGerarLinkUrl(null);
      setGerarLinkCopied(false);
      setGerarLinkOpen(true);
    }
  };

  const handleCbDelete = async (id: string) => {
    await supabase.from("contas_bancarias").delete().eq("id", id);
    setCbsEmpresa(prev => prev.filter(c => c.id !== id));
  };

  // ── Integração Bancária (Inter / Open Finance) ────────────────────────────
  const EMPTY_IB = { client_id: "", client_secret: "", certificado_pem: "", chave_pem: "" };
  const [ibContaId,  setIbContaId]  = useState<string | null>(null);
  const [ibForm,     setIbForm]     = useState(EMPTY_IB);
  const [ibSaving,   setIbSaving]   = useState(false);
  const [ibExisting, setIbExisting] = useState<{ ultima_sincronizacao: string | null } | null>(null);
  const certFileRef = useRef<HTMLInputElement>(null);
  const keyFileRef  = useRef<HTMLInputElement>(null);

  const loadIb = async (contaId: string) => {
    const { data } = await supabase.from("integracoes_bancarias" as any).select("*").eq("conta_bancaria_id", contaId).maybeSingle();
    if (data) {
      setIbForm({ client_id: data.client_id, client_secret: data.client_secret, certificado_pem: data.certificado_pem, chave_pem: data.chave_pem });
      setIbExisting({ ultima_sincronizacao: data.ultima_sincronizacao });
    } else {
      setIbForm(EMPTY_IB);
      setIbExisting(null);
    }
    setIbContaId(contaId);
  };

  const handleIbSave = async () => {
    if (!ibContaId || !ibForm.client_id.trim() || !ibForm.client_secret.trim() || !ibForm.certificado_pem.trim() || !ibForm.chave_pem.trim()) {
      toast({ title: "Preencha todos os campos da integração", variant: "destructive" }); return;
    }
    setIbSaving(true);
    const payload = {
      user_id: ownerUserId!, conta_bancaria_id: ibContaId, banco: "inter",
      client_id: ibForm.client_id.trim(), client_secret: ibForm.client_secret.trim(),
      certificado_pem: ibForm.certificado_pem.trim(), chave_pem: ibForm.chave_pem.trim(),
      ativo: true,
    };
    const { error } = await (supabase as any).from("integracoes_bancarias").upsert(payload, { onConflict: "conta_bancaria_id" });
    setIbSaving(false);
    if (error) { toast({ title: "Erro ao salvar integração", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Integração configurada com sucesso!" });
    await loadIb(ibContaId);
  };

  const handleGerarLink = async () => {
    if (!gerarLinkContaId || !ownerUserId) return;
    setGerarLinkLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("pluggy-token", { body: {} });
      if (error || (data as any)?.error) throw new Error((data as any)?.error ?? error?.message ?? "Erro ao gerar token");
      const token = (data as any).connectToken as string;
      const url = `${window.location.origin}/auth/banco?token=${encodeURIComponent(token)}&conta=${gerarLinkContaId}&user=${ownerUserId}`;
      setGerarLinkUrl(url);
    } catch (e: any) {
      toast({ title: "Erro ao gerar link", description: e.message, variant: "destructive" });
    } finally {
      setGerarLinkLoading(false);
    }
  };

  const handlePluggyDireto = async () => {
    if (!gerarLinkContaId || !ownerUserId) return;
    setPluggyDirectLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("pluggy-token", { body: {} });
      if (error || (data as any)?.error) throw new Error((data as any)?.error ?? error?.message ?? "Erro ao gerar token");
      const { PluggyConnect } = await import("pluggy-connect-sdk");
      const widget = new PluggyConnect({
        connectToken: (data as any).connectToken,
        includeSandbox: true,
        onSuccess: async ({ item }) => {
          const { data: sd, error: se } = await supabase.functions.invoke("sync-pluggy", {
            body: { item_id: item.id, conta_bancaria_id: gerarLinkContaId, user_id: ownerUserId },
          });
          if (se || (sd as any)?.error) {
            toast({ title: "Erro ao sincronizar", description: (sd as any)?.error ?? se?.message, variant: "destructive" });
            return;
          }
          toast({ title: "Banco conectado!", description: `${(sd as any).banco ?? ""} · ${(sd as any).total ?? 0} transações importadas` });
          setGerarLinkOpen(false);
          if (editingId) await loadCbsEmpresa(editingId);
        },
        onError: ({ message }) => {
          toast({ title: "Erro na conexão", description: message, variant: "destructive" });
        },
      });
      await widget.init();
    } catch (e: any) {
      toast({ title: "Erro ao inicializar widget", description: e.message, variant: "destructive" });
    } finally {
      setPluggyDirectLoading(false);
    }
  };

  const readFileAsText = (file: File): Promise<string> =>
    new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target?.result as string); r.onerror = rej; r.readAsText(file); });

  // ── Pluggy Open Finance — status de conexão por conta ────────────────────
  const [pluggyConns,       setPluggyConns]       = useState<Record<string, { item_id: string; status: string } | null>>({});
  const [gerarLinkOpen,     setGerarLinkOpen]     = useState(false);
  const [gerarLinkContaId,  setGerarLinkContaId]  = useState<string | null>(null);
  const [gerarLinkLoading,  setGerarLinkLoading]  = useState(false);
  const [gerarLinkUrl,      setGerarLinkUrl]      = useState<string | null>(null);
  const [gerarLinkCopied,   setGerarLinkCopied]   = useState(false);
  const [pluggyDirectLoading, setPluggyDirectLoading] = useState(false);

  const PAGE_SIZE = 20;

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadEmpresas = useCallback(async () => {
    if (!user) return;
    const from = page * PAGE_SIZE;
    const { data, count } = await supabase
      .from("empresas")
      .select("*", { count: "exact" })
      .order("razao_social")
      .range(from, from + PAGE_SIZE - 1);
    setEmpresas(data || []);
    setTotalCount(count ?? 0);

    if (data && data.length > 0) {
      const ids = data.map(e => e.id);
      const [{ data: sd }, { data: cbd }] = await Promise.all([
        (supabase as any).from("socios").select("*").in("empresa_id", ids),
        (supabase as any).from("contas_bancarias").select("id, empresa_id, banco, conta").in("empresa_id", ids).order("banco"),
      ]);
      const map: Record<string, Socio[]> = {};
      for (const s of sd ?? []) {
        if (!map[s.empresa_id]) map[s.empresa_id] = [];
        map[s.empresa_id].push({ nome: s.nome, cpf: s.cpf || "", data_nascimento: s.data_nascimento || "", email: s.email || "", cargo: s.cargo || "" });
      }
      setSociosMap(map);
      const cbMap: Record<string, { banco: string; conta: string | null }[]> = {};
      for (const c of cbd ?? []) {
        if (!cbMap[c.empresa_id]) cbMap[c.empresa_id] = [];
        cbMap[c.empresa_id].push({ banco: c.banco, conta: c.conta });
      }
      setContasMap(cbMap);
    }
  }, [user, page]);

  useEffect(() => { loadEmpresas(); }, [loadEmpresas]);

  // Carrega todos os membros da equipe (sem filtro de papel)
  useEffect(() => {
    if (!ownerUserId) return;
    (supabase as any)
      .from("usuarios_perfil")
      .select("id, nome")
      .eq("escritorio_owner_id", ownerUserId)
      .order("nome")
      .then(({ data }: any) => setEquipe(data ?? []));
  }, [ownerUserId]);

  useEffect(() => {
    if (!ownerUserId) return;
    const channel = supabase
      .channel("empresas-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "empresas" }, () => { loadEmpresas(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [ownerUserId, loadEmpresas]);

  // ── CNPJ lookup (BrasilAPI) ───────────────────────────────────────────────

  const fetchCnpjData = async (cnpjNumeric: string) => {
    if (cnpjNumeric.length !== 14) return;
    setLoadingCnpj(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjNumeric}`);
      if (!res.ok) throw new Error();
      const d = await res.json();
      setForm(prev => ({
        ...prev,
        razao_social: d.razao_social    || prev.razao_social,
        cep:          d.cep?.replace(/\D/g, "") || prev.cep,
        logradouro:   d.logradouro      || prev.logradouro,
        numero:       d.numero          || prev.numero,
        complemento:  d.complemento     || prev.complemento,
        bairro:       d.bairro          || prev.bairro,
        municipio:    d.municipio       || prev.municipio,
        uf:           d.uf              || prev.uf,
      }));
      toast({ title: "Dados encontrados!" });
    } catch {
      toast({ title: "CNPJ não encontrado", variant: "destructive" });
    } finally {
      setLoadingCnpj(false);
    }
  };

  // ── CEP lookup (ViaCEP) ───────────────────────────────────────────────────

  const fetchCep = async (digits: string) => {
    if (digits.length !== 8) return;
    setLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const d = await res.json();
      if (!d.erro) {
        setForm(prev => ({
          ...prev,
          logradouro: d.logradouro || prev.logradouro,
          bairro:     d.bairro     || prev.bairro,
          municipio:  d.localidade || prev.municipio,
          uf:         d.uf         || prev.uf,
        }));
        toast({ title: "Endereço preenchido!" });
      }
    } catch {}
    setLoadingCep(false);
  };

  // ── Edit ──────────────────────────────────────────────────────────────────

  const handleEdit = async (emp: Tables<"empresas">) => {
    setEditingId(emp.id);
    const { ddd, numero } = parsePhone(emp.telefone);
    const e = emp as any;
    setForm({
      cnpj:              emp.cnpj,
      razao_social:      emp.razao_social,
      cep:               e.cep          || "",
      logradouro:        e.logradouro   || "",
      numero:            e.numero       || "",
      complemento:       e.complemento  || "",
      bairro:            e.bairro       || "",
      municipio:         emp.municipio  || "",
      uf:                emp.uf         || "",
      regime_tributario: emp.regime_tributario  || "",
      telefone_ddd:      ddd,
      telefone_numero:   numero,
      email_responsavel: emp.email_responsavel  || "",
      inscricao_municipal: emp.inscricao_municipal || "",
      inscricao_estadual:  emp.inscricao_estadual  || "",
      isento_ie:            emp.inscricao_estadual === "ISENTO",
      atividade:            e.atividade         || "servico",
      possui_prolabore:     e.possui_prolabore  ?? true,
      possui_funcionario:   e.possui_funcionario ?? false,
      tem_retencoes:        e.tem_retencoes     ?? false,
      tem_reinf:            e.tem_reinf         ?? false,
      contribuinte_iss:     e.contribuinte_iss  ?? false,
      contribuinte_icms:    e.contribuinte_icms ?? false,
      codigo_dominio:       e.codigo_dominio       || "",
      plano_contas_dominio: e.plano_contas_dominio || "",
      codigo_contabil:      e.codigo_contabil      || "",
      responsavel_fiscal_id:   e.responsavel_fiscal_id   || "",
      responsavel_contabil_id: e.responsavel_contabil_id || "",
      responsavel_pessoal_id:  e.responsavel_pessoal_id  || "",
    });
    const { data: sd } = await (supabase as any).from("socios").select("*").eq("empresa_id", emp.id).order("nome");
    setSocios((sd || []).map(s => ({
      nome:            s.nome,
      cpf:             s.cpf             || "",
      data_nascimento: s.data_nascimento || "",
      email:           s.email           || "",
      cargo:           s.cargo           || "",
    })));
    setActiveTab("empresa");
    loadPcContas(emp.id);
    loadCbsEmpresa(emp.id);
    setDialogOpen(true);
  };

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateCNPJ(form.cnpj)) {
      toast({ title: "CNPJ inválido", variant: "destructive" });
      return;
    }
    const currentCnpj = form.cnpj.replace(/\D/g, "");
    if (empresas.some(em => em.cnpj === currentCnpj && em.id !== editingId)) {
      toast({ title: "CNPJ já cadastrado", variant: "destructive" });
      return;
    }

    const telefone = form.telefone_ddd && form.telefone_numero
      ? `(${form.telefone_ddd}) ${formatPhone(form.telefone_numero)}`
      : null;

    const payload: Record<string, any> = {
      user_id:             ownerUserId!,
      cnpj:                currentCnpj,
      razao_social:        form.razao_social.trim(),
      cep:                 form.cep.replace(/\D/g, "") || null,
      logradouro:          form.logradouro.trim()  || null,
      numero:              form.numero.trim()       || null,
      complemento:         form.complemento.trim()  || null,
      bairro:              form.bairro.trim()       || null,
      municipio:           form.municipio.trim()    || null,
      uf:                  form.uf                  || null,
      regime_tributario:   form.regime_tributario   || null,
      telefone,
      email_responsavel:   form.email_responsavel.trim()    || null,
      inscricao_municipal:  form.inscricao_municipal.trim()  || null,
      inscricao_estadual:   form.isento_ie ? "ISENTO" : form.inscricao_estadual.trim() || null,
      codigo_dominio:       form.codigo_dominio.trim()       || null,
      plano_contas_dominio: form.plano_contas_dominio.trim() || null,
      codigo_contabil:      form.codigo_contabil.trim()      || null,
      atividade:            form.atividade,
      possui_prolabore:     form.possui_prolabore,
      possui_funcionario:   form.possui_funcionario,
      tem_retencoes:        form.tem_retencoes,
      tem_reinf:            form.tem_reinf,
      contribuinte_iss:     form.contribuinte_iss,
      contribuinte_icms:    form.contribuinte_icms,
      responsavel_fiscal_id:   form.responsavel_fiscal_id   || null,
      responsavel_contabil_id: form.responsavel_contabil_id || null,
      responsavel_pessoal_id:  form.responsavel_pessoal_id  || null,
    };

    let empresaId: string | null = editingId;

    // Try save with address columns; fallback without them if migration not run yet
    const save = async (p: Record<string, any>) => {
      if (editingId) {
        return (supabase as any).from("empresas").update(p).eq("id", editingId);
      }
      return (supabase as any).from("empresas").insert(p).select("id").single();
    };

    let { data: saved, error } = await save(payload);

    if (error?.message && ["cep","logradouro","numero","complemento","bairro"].some(c => error!.message.includes(c))) {
      const { cep: _c, logradouro: _l, numero: _n, complemento: _co, bairro: _b, ...base } = payload;
      ({ data: saved, error } = await save(base));
      if (!error) toast({ title: "Atenção", description: "Execute a migration 20260331_socios_endereco.sql para habilitar os campos de endereço.", variant: "destructive" });
    }

    if (error?.message && ["responsavel_fiscal_id","responsavel_contabil_id","responsavel_pessoal_id"].some(c => error!.message.includes(c))) {
      const { responsavel_fiscal_id: _f, responsavel_contabil_id: _c2, responsavel_pessoal_id: _p, ...base } = payload;
      ({ data: saved, error } = await save(base));
    }

    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    if (!editingId) empresaId = (saved as any)?.id ?? null;

    // Sync socios
    if (empresaId) {
      await (supabase as any).from("socios").delete().eq("empresa_id", empresaId);
      if (socios.length > 0) {
        const { error: se } = await (supabase as any).from("socios").insert(
          socios.map(s => ({
            empresa_id:      empresaId,
            user_id:         ownerUserId!,
            nome:            s.nome,
            cpf:             s.cpf             || null,
            data_nascimento: s.data_nascimento || null,
            email:           s.email           || null,
            cargo:           s.cargo           || null,
          }))
        );
        if (se) toast({ title: "Empresa salva, mas erro ao salvar sócios", description: se.message, variant: "destructive" });
      }
    }

    toast({ title: editingId ? "Empresa atualizada!" : "Empresa cadastrada!" });
    setForm(EMPTY_FORM); setSocios([]); setSocioForm(EMPTY_SOCIO);
    setEditingId(null); setDialogOpen(false);
    loadEmpresas();
  };

  const loadPcContas = async (empresaId: string) => {
    const { data } = await supabase.from("plano_contas").select("id, codigo, nome, tipo").eq("empresa_id", empresaId).order("codigo");
    setPcContas(data ?? []);
  };

  const handlePcDeleteConta = async (id: string) => {
    await supabase.from("plano_contas").delete().eq("id", id);
    setPcContas(prev => prev.filter(c => c.id !== id));
  };

  const handlePcFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

    const finish = (parsed: ReturnType<typeof parseTxtPC>) => {
      if (parsed.length === 0) {
        toast({ title: "Nenhuma conta encontrada", description: "Verifique o formato do arquivo.", variant: "destructive" });
        return;
      }
      setPcPreview(parsed as any);
      setPcDialogOpen(true);
    };

    const getWs = (wb: XLSX.WorkBook): XLSX.WorkSheet | undefined => {
      const name = wb.SheetNames[0];
      return (name ? wb.Sheets[name] : undefined) ||
        Object.values(wb.Sheets).find((s: any) => s && s["!ref"]) ||
        Object.values(wb.Sheets)[0];
    };

    const processRows = (rows: any[][]) => {
      const norm = (s: string) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      let cClassif = 0, cCodigo = 1, cNat = 2, cNome = 3, cGrau = 5, dataStart = 0;
      for (let ri = 0; ri < Math.min(rows.length, 20); ri++) {
        const row: any[] = rows[ri] ?? [];
        let found = false;
        for (let ci = 0; ci < row.length; ci++) {
          const h = norm(row[ci]);
          if (h.includes("classific")) { cClassif = ci; found = true; }
          else if (h.includes("descri") || h.includes("nome")) { cNome = ci; found = true; }
          else if (h === "t" || h === "nat" || h === "natureza") cNat = ci;
          else if (h === "grau") cGrau = ci;
          else if (h === "cod" || h === "codigo") cCodigo = ci;
        }
        if (found) { dataStart = ri + 1; break; }
      }
      const estimaGrau = (code: string) => {
        const parts = code.split(".");
        if (parts.length > 1) return parts.length;
        const l = code.length;
        if (l <= 1) return 1; if (l <= 2) return 2; if (l <= 3) return 3;
        if (l <= 5) return 4; return 5;
      };
      const result: ReturnType<typeof parseTxtPC> = [];
      for (let ri = dataStart; ri < rows.length; ri++) {
        const row: any[] = rows[ri] ?? [];
        const rawCode   = String(row[cClassif] ?? "").trim();
        const codigoRed = String(row[cCodigo]  ?? "").trim();
        const natureza  = String(row[cNat]      ?? "").trim();
        const nome      = String(row[cNome]     ?? "").trim();
        const grauRaw   = String(row[cGrau]     ?? "").trim();
        if (!rawCode || (!(/^\d+$/.test(rawCode)) && !(/^[\d.]+$/.test(rawCode)))) continue;
        if (!nome || /^\d+$/.test(nome)) continue;
        const nat = /^s/i.test(natureza) ? "S" : "A";
        const grau = parseInt(grauRaw) || estimaGrau(rawCode);
        const classificacao = /^\d+$/.test(rawCode) ? toDottedPC(rawCode, grau) : rawCode;
        result.push({ codigo: codigoRed || rawCode, classificacao, natureza: nat, grau, nome, tipo: detectTipoPC(classificacao.split(".")[0] === "1" ? "ativo" : nome) });
      }
      if (result.length === 0) {
        const preview = rows.slice(0, 5).map((r: any[]) =>
          (r ?? []).slice(0, 7).map((c: any) => String(c ?? "").substring(0, 20)).join(" | ")
        ).join("\n");
        toast({ title: `Arquivo lido (${rows.length} linhas) — nenhuma conta reconhecida`, description: `Linhas:\n${preview}\nColunas: classif=${cClassif} nome=${cNome} nat=${cNat} grau=${cGrau}`, variant: "destructive", duration: 30000 });
        return;
      }
      finish(result);
    };

    const reader = new FileReader();

    if (ext === "xlsx") {
      reader.onload = ev => {
        let wb: XLSX.WorkBook | null = null;
        try { wb = XLSX.read(new Uint8Array(ev.target?.result as ArrayBuffer), { type: "array" }); } catch { wb = null; }
        if (!wb) { toast({ title: "Erro ao ler .xlsx", variant: "destructive" }); return; }
        const ws = getWs(wb);
        if (!ws) { toast({ title: "Planilha vazia", description: `Abas: [${wb.SheetNames.join(", ")}]`, variant: "destructive" }); return; }
        processRows(XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" }));
      };
      reader.readAsArrayBuffer(file);
    } else if (ext === "xls") {
      reader.onload = ev => {
        const arr = new Uint8Array(ev.target?.result as ArrayBuffer);
        // Tenta BIFF8 binário primeiro
        let wb: XLSX.WorkBook | null = null;
        try { wb = XLSX.read(arr, { type: "array" }); } catch { wb = null; }
        // Domínio às vezes exporta HTML com extensão .xls — tenta DOMParser
        if (!wb || !getWs(wb)) {
          try {
            const text = new TextDecoder("latin1").decode(arr);
            const doc  = new DOMParser().parseFromString(text, "text/html");
            const table = doc.querySelector("table");
            if (table) {
              const rows: any[][] = [];
              for (const tr of table.querySelectorAll("tr")) {
                const row: any[] = [];
                for (const td of tr.querySelectorAll("td, th")) row.push(td.textContent?.trim() ?? "");
                rows.push(row);
              }
              processRows(rows);
              return;
            }
          } catch { /* ignora */ }
        }
        if (!wb) { toast({ title: "Erro ao ler .xls", variant: "destructive" }); return; }
        const ws = getWs(wb);
        if (!ws) { toast({ title: "Planilha vazia", description: `Abas: [${wb.SheetNames.join(", ")}]`, variant: "destructive" }); return; }
        processRows(XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" }));
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = ev => finish(parseTxtPC(ev.target?.result as string));
      reader.readAsText(file, "latin1");
    }

    e.target.value = "";
  };

  const handlePcImportConfirm = async () => {
    if (!editingId) {
      toast({ title: "Salve a empresa primeiro", description: "Cadastre a empresa antes de importar o plano de contas.", variant: "destructive" });
      return;
    }
    setPcImporting(true);
    // Apaga plano anterior desta empresa antes de reimportar
    await supabase.from("plano_contas").delete().eq("empresa_id", editingId);
    const payload = pcPreview.map(c => ({ user_id: ownerUserId!, empresa_id: editingId, codigo: c.codigo, classificacao: c.classificacao, natureza: c.natureza, grau: c.grau, nome: c.nome, tipo: c.tipo, parent_id: null }));
    const { error } = await supabase.from("plano_contas").insert(payload);
    setPcImporting(false);
    if (error) { toast({ title: "Erro ao importar", description: error.message, variant: "destructive" }); return; }
    toast({ title: `${pcPreview.length} contas importadas com sucesso!` });
    setPcDialogOpen(false);
    setPcPreview([]);
    loadPcContas(editingId);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("empresas").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Empresa removida" });
    loadEmpresas();
  };

  // ── Socios helpers ────────────────────────────────────────────────────────

  const addSocio = () => {
    if (!socioForm.nome.trim()) { toast({ title: "Nome do sócio é obrigatório", variant: "destructive" }); return; }
    setSocios(prev => [...prev, { ...socioForm }]);
    setSocioForm(EMPTY_SOCIO);
  };

  const removeSocio = (i: number) => setSocios(prev => prev.filter((_, idx) => idx !== i));

  const isBirthdayToday = (dataNasc: string | null) => {
    if (!dataNasc) return false;
    const today = new Date();
    const [, mm, dd] = dataNasc.split("-");
    return mm === String(today.getMonth() + 1).padStart(2, "0") && dd === String(today.getDate()).padStart(2, "0");
  };

  // ── Filters ───────────────────────────────────────────────────────────────

  const filtroParam = searchParams.get("filtro");
  const filtroLabels: Record<string, string> = {
    sem_regime: "Sem Regime Tributário", sem_municipio: "Sem Endereço",
    sem_telefone: "Sem Telefone",        sem_email: "Sem E-mail",
  };

  const filtered = empresas.filter(e => {
    const ok = e.razao_social.toLowerCase().includes(search.toLowerCase()) || e.cnpj.includes(search.replace(/\D/g, ""));
    if (!ok) return false;
    if (filtroParam === "sem_regime")    return !e.regime_tributario;
    if (filtroParam === "sem_municipio") return !e.municipio || !e.uf;
    if (filtroParam === "sem_telefone")  return !e.telefone;
    if (filtroParam === "sem_email")     return !e.email_responsavel;
    return true;
  });

  // ── Reset dialog ──────────────────────────────────────────────────────────

  const resetDialog = () => {
    setEditingId(null); setForm(EMPTY_FORM);
    setSocios([]); setSocioForm(EMPTY_SOCIO); setActiveTab("empresa");
    setPcContas([]); setCbsEmpresa([]); setCbForm(EMPTY_CB); setCbEditingId(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Empresas</h1>
          <p className="text-muted-foreground">Gerencie as empresas monitoradas</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            data={filtered}
            filename="empresas"
            title="Empresas"
            columns={[
              { header: "CNPJ",          value: r => formatCNPJ(r.cnpj), width: 1.2 },
              { header: "Razão Social",  value: r => r.razao_social, width: 2 },
              { header: "Endereço",      value: r => [(r as any).logradouro, (r as any).numero, (r as any).bairro].filter(Boolean).join(", "), width: 2 },
              { header: "Município/UF",  value: r => [r.municipio, r.uf].filter(Boolean).join("/") },
              { header: "Regime",        value: r => r.regime_tributario },

              { header: "E-mail",        value: r => r.email_responsavel, width: 1.5 },
              { header: "Sócios",        value: r => (sociosMap[r.id] ?? []).map(s => s.nome).join(", "), width: 2 },
            ]}
          />

          <Dialog open={dialogOpen} onOpenChange={open => { if (!open) resetDialog(); setDialogOpen(open); }}>
            {PODE_INCLUIR && (
              <DialogTrigger asChild>
                <Button onClick={resetDialog}><Plus className="mr-2 h-4 w-4" /> Nova Empresa</Button>
              </DialogTrigger>
            )}

            <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar Empresa" : "Cadastrar Empresa"}</DialogTitle>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Tabs value={activeTab} onValueChange={tab => {
                  setActiveTab(tab);
                  if (tab === "financeiro" && editingId) loadPcContas(editingId);
                  if (tab === "contas_bancarias" && editingId) loadCbsEmpresa(editingId);
                }}>
                  <TabsList className="flex w-full">
                    <TabsTrigger value="empresa" className="flex-1 min-w-0 text-xs px-1">Empresa</TabsTrigger>
                    <TabsTrigger value="endereco" className="flex-1 min-w-0 text-xs px-1">
                      <MapPin className="h-3.5 w-3.5 shrink-0 mr-0.5" /><span className="truncate hidden sm:inline">Endereço</span>
                    </TabsTrigger>
                    <TabsTrigger value="socios" className="flex-1 min-w-0 text-xs px-1">
                      <Users2 className="h-3.5 w-3.5 shrink-0 mr-0.5" /><span className="truncate">Sócios {socios.length > 0 && `(${socios.length})`}</span>
                    </TabsTrigger>
                    <TabsTrigger value="financeiro" className="flex-1 min-w-0 text-xs px-1">
                      <Banknote className="h-3.5 w-3.5 shrink-0 mr-0.5" /><span className="truncate hidden sm:inline">Financeiro</span>
                    </TabsTrigger>
                    <TabsTrigger value="contas_bancarias" className="flex-1 min-w-0 text-xs px-1" disabled={!editingId}>
                      <Landmark className="h-3.5 w-3.5 shrink-0 mr-0.5" /><span className="truncate">Bancos</span>
                    </TabsTrigger>
                    <TabsTrigger value="monitoramento" className="flex-1 min-w-0 text-xs px-1">
                      <Monitor className="h-3.5 w-3.5 shrink-0 mr-0.5" /><span className="truncate hidden sm:inline">Monitoram.</span>
                    </TabsTrigger>
                  </TabsList>

                  {/* ── Tab: Empresa ── */}
                  <TabsContent value="empresa" className="space-y-4 pt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          CNPJ *
                          {loadingCnpj && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                        </Label>
                        <Input
                          placeholder="00.000.000/0000-00"
                          value={formatCNPJ(form.cnpj)}
                          onChange={e => {
                            const val = e.target.value;
                            setForm(p => ({ ...p, cnpj: val }));
                            const n = val.replace(/\D/g, "");
                            if (n.length === 14 && n !== form.cnpj.replace(/\D/g, "")) fetchCnpjData(n);
                          }}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Razão Social *</Label>
                        <Input placeholder="Nome da empresa" value={form.razao_social} onChange={e => setForm(p => ({ ...p, razao_social: e.target.value }))} required />
                      </div>
                    </div>

                    <PerfilTributarioSelector form={form} setForm={setForm} />

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Telefone</Label>
                        <div className="flex gap-2">
                          <Input className="w-16 text-center" placeholder="DDD" maxLength={2}
                            value={form.telefone_ddd}
                            onChange={e => setForm(p => ({ ...p, telefone_ddd: e.target.value.replace(/\D/g, "").slice(0, 2) }))}
                          />
                          <Input placeholder="00000-0000"
                            value={formatPhone(form.telefone_numero)}
                            onChange={e => setForm(p => ({ ...p, telefone_numero: e.target.value.replace(/\D/g, "").slice(0, 9) }))}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>E-mail</Label>
                        <Input type="email" placeholder="email@empresa.com.br" value={form.email_responsavel} onChange={e => setForm(p => ({ ...p, email_responsavel: e.target.value }))} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Inscrição Municipal</Label>
                      <Input placeholder="Número da inscrição municipal" value={form.inscricao_municipal} onChange={e => setForm(p => ({ ...p, inscricao_municipal: e.target.value }))} />
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Inscrição Estadual</Label>
                        <Input
                          placeholder="Número da inscrição estadual"
                          value={form.isento_ie ? "" : form.inscricao_estadual}
                          disabled={form.isento_ie}
                          onChange={e => setForm(p => ({ ...p, inscricao_estadual: e.target.value }))}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox id="isento_ie" checked={form.isento_ie}
                          onCheckedChange={checked => setForm(p => ({ ...p, isento_ie: !!checked, inscricao_estadual: checked ? "" : p.inscricao_estadual }))}
                        />
                        <label htmlFor="isento_ie" className="text-sm text-muted-foreground cursor-pointer select-none">
                          Empresa isenta de Inscrição Estadual
                        </label>
                      </div>
                    </div>
                  </TabsContent>

                  {/* ── Tab: Endereço ── */}
                  <TabsContent value="endereco" className="space-y-4 pt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          CEP
                          {loadingCep && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                        </Label>
                        <Input
                          placeholder="00000-000"
                          value={formatCEP(form.cep)}
                          onChange={e => {
                            const val = e.target.value;
                            setForm(p => ({ ...p, cep: val }));
                            const d = val.replace(/\D/g, "");
                            if (d.length === 8) fetchCep(d);
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Bairro</Label>
                        <Input placeholder="Bairro" value={form.bairro} onChange={e => setForm(p => ({ ...p, bairro: e.target.value }))} />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="col-span-2 space-y-2">
                        <Label>Logradouro</Label>
                        <Input placeholder="Rua, Avenida, etc." value={form.logradouro} onChange={e => setForm(p => ({ ...p, logradouro: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Número</Label>
                        <Input placeholder="Nº" value={form.numero} onChange={e => setForm(p => ({ ...p, numero: e.target.value }))} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Complemento</Label>
                      <Input placeholder="Sala, Andar, etc." value={form.complemento} onChange={e => setForm(p => ({ ...p, complemento: e.target.value }))} />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="col-span-2 space-y-2">
                        <Label>Município</Label>
                        <Input placeholder="Cidade" value={form.municipio} onChange={e => setForm(p => ({ ...p, municipio: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>UF</Label>
                        <Select value={form.uf} onValueChange={v => setForm(p => ({ ...p, uf: v }))}>
                          <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                          <SelectContent>
                            {UF_LIST.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </TabsContent>

                  {/* ── Tab: Sócios ── */}
                  <TabsContent value="socios" className="space-y-4 pt-4">
                    {/* Lista */}
                    {socios.length > 0 && (
                      <div className="space-y-2">
                        {socios.map((s, i) => (
                          <div key={i} className="flex items-start justify-between p-3 rounded-lg border bg-muted/20">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm">{s.nome}</p>
                                {s.data_nascimento && isBirthdayToday(s.data_nascimento) && (
                                  <Cake className="h-4 w-4 text-pink-500" title="Aniversário hoje!" />
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {[
                                  s.cpf && `CPF: ${s.cpf}`,
                                  s.data_nascimento && `Nasc.: ${format(parseISO(s.data_nascimento), "dd/MM/yyyy")}`,
                                  s.cargo,
                                  s.email,
                                ].filter(Boolean).join(" · ")}
                              </p>
                            </div>
                            <Button variant="ghost" size="icon" type="button" onClick={() => removeSocio(i)}>
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Formulário de adição */}
                    <div className="border rounded-lg p-4 space-y-3 bg-muted/5">
                      <h5 className="font-semibold text-sm flex items-center gap-2">
                        <UserPlus className="h-4 w-4 text-primary" /> Adicionar Sócio
                      </h5>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Nome completo *</Label>
                          <Input placeholder="Nome do sócio" value={socioForm.nome}
                            onChange={e => setSocioForm(p => ({ ...p, nome: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">CPF</Label>
                          <Input placeholder="000.000.000-00" value={socioForm.cpf}
                            onChange={e => setSocioForm(p => ({ ...p, cpf: formatCPF(e.target.value) }))} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs flex items-center gap-1">
                            <Cake className="h-3 w-3 text-pink-500" /> Data de Nascimento
                          </Label>
                          <Input type="date" value={socioForm.data_nascimento}
                            onChange={e => setSocioForm(p => ({ ...p, data_nascimento: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">E-mail</Label>
                          <Input type="email" placeholder="email@socio.com" value={socioForm.email}
                            onChange={e => setSocioForm(p => ({ ...p, email: e.target.value }))} />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <Label className="text-xs">Cargo / Qualificação</Label>
                          <Input placeholder="Ex: Sócio Administrador, Sócio Quotista" value={socioForm.cargo}
                            onChange={e => setSocioForm(p => ({ ...p, cargo: e.target.value }))} />
                        </div>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={addSocio}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar à lista
                      </Button>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Sócios com data de nascimento receberão alertas automáticos de aniversário no sistema e por e-mail.
                    </p>
                  </TabsContent>

                  {/* ── Tab: Financeiro ── */}
                  <TabsContent value="financeiro" className="space-y-4 pt-4">
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-blue-50/50 border-blue-200">
                      <Banknote className="h-5 w-5 text-blue-600 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-blue-800">Integração com Sistema Contábil Domínio</p>
                        <p className="text-xs text-blue-600">Preencha os códigos para amarração automática com o Domínio</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Código da Empresa no Domínio</Label>
                        <Input
                          placeholder="Ex: 117"
                          value={form.codigo_dominio}
                          onChange={e => setForm(p => ({ ...p, codigo_dominio: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">Código de identificação da empresa no Domínio</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Código Contábil</Label>
                        <Input
                          placeholder="Ex: 001.001"
                          value={form.codigo_contabil}
                          onChange={e => setForm(p => ({ ...p, codigo_contabil: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">Código para lançamentos contábeis</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Plano de Contas (Domínio)</Label>
                      <Input
                        placeholder="Ex: PLANO_PADRAO ou código do plano"
                        value={form.plano_contas_dominio}
                        onChange={e => setForm(p => ({ ...p, plano_contas_dominio: e.target.value }))}
                      />
                      <p className="text-xs text-muted-foreground">Plano de contas utilizado por esta empresa no Domínio para amarração das contas a pagar</p>
                    </div>

                    <div className="border-t pt-4 space-y-3">
                      <div>
                        <p className="text-sm font-medium mb-1">Importar Plano de Contas (TXT)</p>
                        <p className="text-xs text-muted-foreground mb-2">
                          Faça upload de um arquivo TXT exportado do Domínio para importar automaticamente as contas no sistema.
                        </p>
                        <input ref={pcFileRef} type="file" accept=".txt,.csv,.xlsx,.xls" className="hidden" onChange={handlePcFile} />
                        <Button type="button" variant="outline" size="sm" onClick={() => pcFileRef.current?.click()}>
                          <Upload className="mr-2 h-3.5 w-3.5" /> Importar
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground bg-muted/30 rounded p-3 leading-relaxed">
                        <strong>Como funciona:</strong> Os códigos acima identificam a empresa e vinculam automaticamente os lançamentos financeiros ao plano de contas correto no sistema Domínio, evitando retrabalho de digitação.
                      </p>
                    </div>

                    {/* Lista de contas cadastradas para esta empresa */}
                    {pcContas.length > 0 && (
                      <div className="border-t pt-4 space-y-2">
                        <p className="text-sm font-medium">{pcContas.length} contas cadastradas</p>
                        <div className="max-h-48 overflow-y-auto rounded border divide-y text-xs">
                          {pcContas.map(c => (
                            <div key={c.id} className="flex items-center justify-between px-3 py-1.5 hover:bg-muted/30">
                              <span className="font-mono text-muted-foreground w-20 shrink-0">{c.codigo}</span>
                              <span className="flex-1 truncate">{c.nome}</span>
                              <Badge variant="outline" className="ml-2 text-[10px] shrink-0">{c.tipo}</Badge>
                              {PODE_EXCLUIR && (
                                <button type="button" onClick={() => handlePcDeleteConta(c.id)} className="ml-2 text-muted-foreground hover:text-destructive shrink-0">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  {/* ── Tab: Contas Bancárias ── */}
                  <TabsContent value="contas_bancarias" className="space-y-4 pt-4">
                    {!editingId ? (
                      <p className="text-sm text-muted-foreground">Salve a empresa primeiro para cadastrar contas bancárias.</p>
                    ) : (
                      <>
                        {/* Lista */}
                        {cbsEmpresa.length > 0 && (
                          <div className="space-y-2">
                            {cbsEmpresa.map(cb => (
                              <div key={cb.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/10">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <BankLogo banco={cb.banco} size={28} />
                                  <div className="min-w-0">
                                    <p className="font-medium text-sm">{cb.banco}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {[cb.tipo, cb.agencia && `Ag: ${cb.agencia}`, cb.conta && `Cc: ${cb.conta}`, cb.descricao, cb.codigo_dominio && `Domínio: ${cb.codigo_dominio}`].filter(Boolean).join(" · ")}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    title="Configurar integração bancária via Open Finance"
                                    onClick={() => { setGerarLinkContaId(cb.id); setGerarLinkUrl(null); setGerarLinkCopied(false); setGerarLinkOpen(true); }}
                                    className={`text-xs px-2 py-0.5 rounded-full font-medium border transition-colors ${
                                      pluggyConns[cb.id]?.status === "connected"
                                        ? "bg-green-100 text-green-700 border-green-200 hover:bg-green-200"
                                        : "bg-orange-100 text-orange-600 border-orange-200 hover:bg-orange-200"
                                    }`}
                                  >
                                    {pluggyConns[cb.id]?.status === "connected" ? "● Conectado" : "● Integração"}
                                  </button>
                                  {PODE_EDITAR && (
                                    <Button variant="ghost" size="icon" type="button" onClick={() => {
                                      setCbEditingId(cb.id);
                                      setCbForm({ banco: cb.banco, agencia: cb.agencia ?? "", conta: cb.conta ?? "", tipo: cb.tipo, descricao: cb.descricao ?? "", saldo_inicial: String(cb.saldo_inicial), codigo_dominio: cb.codigo_dominio ?? "" });
                                    }}>
                                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                    </Button>
                                  )}
                                  {PODE_EXCLUIR && (
                                    <Button variant="ghost" size="icon" type="button" onClick={() => handleCbDelete(cb.id)}>
                                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Formulário */}
                        {PODE_INCLUIR && (
                          <div className="border rounded-lg p-4 space-y-3 bg-muted/5">
                            <h5 className="font-semibold text-sm flex items-center gap-2">
                              <Landmark className="h-4 w-4 text-primary" />
                              {cbEditingId ? "Editar Conta Bancária" : "Adicionar Conta Bancária"}
                            </h5>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="col-span-2 space-y-1">
                                <Label className="text-xs">Banco *</Label>
                                <Input placeholder="Ex: Bradesco, Itaú, Nubank..." value={cbForm.banco} onChange={e => setCbForm(p => ({ ...p, banco: e.target.value }))} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Agência</Label>
                                <Input placeholder="0000" value={cbForm.agencia} onChange={e => setCbForm(p => ({ ...p, agencia: e.target.value }))} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Conta</Label>
                                <Input placeholder="00000-0" value={cbForm.conta} onChange={e => setCbForm(p => ({ ...p, conta: e.target.value }))} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Tipo</Label>
                                <Select value={cbForm.tipo} onValueChange={v => setCbForm(p => ({ ...p, tipo: v }))}>
                                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="corrente">Corrente</SelectItem>
                                    <SelectItem value="poupanca">Poupança</SelectItem>
                                    <SelectItem value="pagamento">Pagamento</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Saldo Inicial (R$)</Label>
                                <Input type="number" step="0.01" placeholder="0,00" value={cbForm.saldo_inicial} onChange={e => setCbForm(p => ({ ...p, saldo_inicial: e.target.value }))} />
                              </div>
                              <div className="col-span-2 space-y-1">
                                <Label className="text-xs">Apelido</Label>
                                <Input placeholder="Ex: Conta Principal" value={cbForm.descricao} onChange={e => setCbForm(p => ({ ...p, descricao: e.target.value }))} />
                              </div>
                              <div className="col-span-2 space-y-1">
                                <Label className="text-xs">Código no Domínio</Label>
                                <Input placeholder="Ex: 1.1.1.01.0001" value={cbForm.codigo_dominio} onChange={e => setCbForm(p => ({ ...p, codigo_dominio: e.target.value }))} />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button type="button" size="sm" disabled={cbSaving} onClick={handleCbSubmit}>
                                {cbSaving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
                                {cbEditingId ? "Salvar" : "Adicionar"}
                              </Button>
                              {cbEditingId && (
                                <Button type="button" size="sm" variant="outline" onClick={() => { setCbEditingId(null); setCbForm(EMPTY_CB); }}>
                                  Cancelar
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      {/* ── Integração Automática ── */}
                      {cbsEmpresa.length > 0 && (
                        <div className="border rounded-lg p-4 space-y-3 bg-blue-50/30">
                          <h5 className="font-semibold text-sm flex items-center gap-2">
                            <RefreshCw className="h-4 w-4 text-blue-600" />
                            Integração Automática (Open Finance / API Inter)
                          </h5>
                          {/* Selecionar qual conta configurar */}
                          <div className="space-y-1">
                            <Label className="text-xs">Conta bancária</Label>
                            <Select value={ibContaId ?? ""} onValueChange={v => loadIb(v)}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione a conta..." /></SelectTrigger>
                              <SelectContent>
                                {cbsEmpresa.map(cb => (
                                  <SelectItem key={cb.id} value={cb.id}>{cb.banco}{cb.conta ? ` — ${cb.conta}` : ""}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {ibContaId && (
                            <>
                              {ibExisting?.ultima_sincronizacao && (
                                <div className="text-xs text-muted-foreground">
                                  Última sincronização: {new Date(ibExisting.ultima_sincronizacao).toLocaleString("pt-BR")}
                                </div>
                              )}
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <Label className="text-xs">Client ID *</Label>
                                  <Input placeholder="client_id do Inter" value={ibForm.client_id} onChange={e => setIbForm(p => ({ ...p, client_id: e.target.value }))} />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Client Secret *</Label>
                                  <Input type="password" placeholder="client_secret" value={ibForm.client_secret} onChange={e => setIbForm(p => ({ ...p, client_secret: e.target.value }))} />
                                </div>
                                <div className="col-span-2 space-y-1">
                                  <Label className="text-xs">Certificado (.pem / .crt) *</Label>
                                  <div className="flex gap-2">
                                    <Input
                                      className="h-8 text-xs font-mono flex-1"
                                      placeholder="Conteúdo do certificado ou clique em Carregar..."
                                      value={ibForm.certificado_pem ? "✓ Certificado carregado" : ""}
                                      readOnly
                                    />
                                    <Button type="button" size="sm" variant="outline" onClick={() => certFileRef.current?.click()}>
                                      <Upload className="h-3.5 w-3.5 mr-1" />Carregar
                                    </Button>
                                    <input ref={certFileRef} type="file" accept=".pem,.crt,.cer" className="hidden"
                                      onChange={async e => { const f = e.target.files?.[0]; if (f) setIbForm(p => ({ ...p, certificado_pem: "" })) || readFileAsText(f).then(t => setIbForm(p => ({ ...p, certificado_pem: t }))); }} />
                                  </div>
                                </div>
                                <div className="col-span-2 space-y-1">
                                  <Label className="text-xs">Chave Privada (.key / .pem) *</Label>
                                  <div className="flex gap-2">
                                    <Input
                                      className="h-8 text-xs font-mono flex-1"
                                      placeholder="Conteúdo da chave privada ou clique em Carregar..."
                                      value={ibForm.chave_pem ? "✓ Chave carregada" : ""}
                                      readOnly
                                    />
                                    <Button type="button" size="sm" variant="outline" onClick={() => keyFileRef.current?.click()}>
                                      <Upload className="h-3.5 w-3.5 mr-1" />Carregar
                                    </Button>
                                    <input ref={keyFileRef} type="file" accept=".key,.pem" className="hidden"
                                      onChange={async e => { const f = e.target.files?.[0]; if (f) readFileAsText(f).then(t => setIbForm(p => ({ ...p, chave_pem: t }))); }} />
                                  </div>
                                </div>
                              </div>
                              <div className="text-xs text-muted-foreground bg-blue-50 p-2 rounded border border-blue-200">
                                Gere o certificado em <strong>developers.bancointer.com.br</strong> → Minha Aplicação → Certificado. Baixe o <code>.crt</code> e a chave <code>.key</code>.
                              </div>
                              <Button type="button" size="sm" disabled={ibSaving} onClick={handleIbSave}>
                                {ibSaving ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />Salvando...</> : "Salvar Integração"}
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                      </>
                    )}
                  </TabsContent>

                  {/* ── Tab: Monitoramento ── */}
                  <TabsContent value="monitoramento" className="space-y-5 pt-4">
                    <div className="rounded-lg border bg-blue-50/50 p-4 text-sm text-muted-foreground">
                      Defina qual membro da equipe é responsável por cada setor nesta empresa.
                      As tarefas geradas automaticamente serão atribuídas a eles.
                    </div>

                    {equipe.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-8 text-center space-y-3">
                        <p className="text-sm text-muted-foreground">
                          Nenhum membro cadastrado na equipe ainda.
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Cadastre os funcionários em <strong>Configuração → Equipe</strong> para poder vinculá-los às empresas.
                        </p>
                        <button
                          type="button"
                          onClick={() => { setDialogOpen(false); navigate("/configuracao/equipe"); }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white"
                          style={{ backgroundColor: "#10143D" }}
                        >
                          Ir para Configuração → Equipe
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {[
                          { label: "Responsável pelo setor Fiscal",   field: "responsavel_fiscal_id",   color: "text-blue-700" },
                          { label: "Responsável pelo setor Contábil", field: "responsavel_contabil_id", color: "text-purple-700" },
                          { label: "Responsável pelo Depto. Pessoal", field: "responsavel_pessoal_id",  color: "text-amber-700" },
                        ].map(({ label, field, color }) => (
                          <div key={field} className="space-y-1.5">
                            <Label className={`font-medium ${color}`}>{label}</Label>
                            <Select
                              value={(form as any)[field] || "_nenhum"}
                              onValueChange={v => setForm(p => ({ ...p, [field]: v === "_nenhum" ? "" : v }))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecionar responsável..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="_nenhum">— Não atribuído —</SelectItem>
                                {equipe.map(m => (
                                  <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>

                <Button type="submit" className="w-full" disabled={loadingCnpj || loadingCep}>
                  {(loadingCnpj || loadingCep) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingId ? "Salvar Alterações" : "Cadastrar"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search + filter chip */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou CNPJ..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {filtroParam && filtroLabels[filtroParam] && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700">
            <span>Filtro ativo: <strong>{filtroLabels[filtroParam]}</strong></span>
            <button className="ml-1 hover:text-amber-900 font-bold" onClick={() => setSearchParams({})}>✕</button>
          </div>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Regime</TableHead>
                <TableHead>Sócios</TableHead>
                <TableHead>Bancos</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length > 0 ? filtered.map(emp => {
                const empSocios = sociosMap[emp.id] ?? [];
                const hasBirthday = empSocios.some(s => isBirthdayToday(s.data_nascimento));
                const e = emp as any;
                const endereco = [e.logradouro, e.numero ? `nº ${e.numero}` : null, e.bairro].filter(Boolean).join(", ");

                return (
                  <TableRow key={emp.id} className={hasBirthday ? "bg-pink-50/40" : ""}>
                    <TableCell>
                      <div className="font-medium flex items-center gap-1.5">
                        {emp.razao_social}
                        {hasBirthday && <Cake className="h-3.5 w-3.5 text-pink-500 shrink-0" title="Aniversário de sócio hoje!" />}
                      </div>
                      {endereco && (
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {endereco}{emp.municipio ? `, ${emp.municipio}${emp.uf ? `/${emp.uf}` : ""}` : ""}
                        </div>
                      )}
                      {!endereco && (emp.municipio || emp.uf) && (
                        <div className="text-xs text-muted-foreground mt-0.5">{[emp.municipio, emp.uf].filter(Boolean).join("/")}</div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{formatCNPJ(emp.cnpj)}</TableCell>
                    <TableCell>
                      {emp.regime_tributario
                        ? <div className="space-y-1">
                            <Badge variant="secondary" className="capitalize">{emp.regime_tributario}</Badge>
                            <div className="font-mono text-xs text-muted-foreground">
                              {resolvePerfilCodigo(emp.regime_tributario, e.atividade || "servico", e.possui_prolabore ?? true, e.possui_funcionario ?? false)}
                            </div>
                          </div>
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {empSocios.length === 0 ? <span className="text-muted-foreground">—</span> : (
                        <div className="space-y-0.5">
                          {empSocios.slice(0, 2).map((s, i) => (
                            <div key={i} className="flex items-center gap-1">
                              {isBirthdayToday(s.data_nascimento) && <Cake className="h-3 w-3 text-pink-500 shrink-0" />}
                              <span className="truncate max-w-[150px] text-xs">{s.nome}</span>
                            </div>
                          ))}
                          {empSocios.length > 2 && (
                            <span className="text-xs text-muted-foreground">+{empSocios.length - 2} mais</span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {(contasMap[emp.id] ?? []).length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="space-y-0.5">
                          {(contasMap[emp.id] ?? []).slice(0, 2).map((cb, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-xs">
                              <BankLogo banco={cb.banco} size={14} />
                              <span className="truncate max-w-[120px]">{cb.banco}{cb.conta ? ` — ${cb.conta}` : ""}</span>
                            </div>
                          ))}
                          {(contasMap[emp.id] ?? []).length > 2 && (
                            <span className="text-xs text-muted-foreground">+{(contasMap[emp.id] ?? []).length - 2} mais</span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {emp.telefone && <div>{emp.telefone}</div>}
                      {emp.email_responsavel && <div className="text-xs text-muted-foreground truncate max-w-[160px]">{emp.email_responsavel}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        {PODE_EDITAR && (
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(emp)}>
                            <Pencil className="h-4 w-4 text-muted-foreground hover:text-primary" />
                          </Button>
                        )}
                        {PODE_EXCLUIR && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir empresa?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação não pode ser desfeita. A empresa <strong>{emp.razao_social}</strong> e todos os seus dados serão removidos permanentemente.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(emp.id)} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <Building2 className="mx-auto h-8 w-8 mb-2 opacity-40" />
                    Nenhuma empresa cadastrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Integração Bancária — Gerar Link / Conectar Diretamente ── */}
      <Dialog open={gerarLinkOpen} onOpenChange={open => { if (!open) { setGerarLinkOpen(false); setGerarLinkUrl(null); setGerarLinkCopied(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wifi className="h-4 w-4" />
              Integração Bancária (Open Finance)
            </DialogTitle>
            <DialogDescription>
              {(() => {
                const cb = cbsEmpresa.find(c => c.id === gerarLinkContaId);
                if (cb) return `${cb.banco}${cb.conta ? ` — ${cb.conta}` : ""}`;
                return "Conectar conta bancária via Pluggy";
              })()}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {pluggyConns[gerarLinkContaId ?? ""]?.status === "connected" ? (
              <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
                ● Esta conta já está conectada. Você pode enviar um novo link para reconexão.
              </p>
            ) : (
              <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-2">
                Conta cadastrada! Agora envie o link ao cliente para ele autorizar o acesso ao banco pelo celular ou computador.
              </p>
            )}

            {/* Opção 1 — Solicitar ao cliente */}
            <div className="border rounded-lg p-4 space-y-3">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <ExternalLink className="h-4 w-4 text-primary" />
                Solicitar ao Cliente
              </h4>
              <p className="text-xs text-muted-foreground">
                Gere um link e envie ao cliente por WhatsApp ou e-mail. Ele abrirá no celular ou computador e autorizará o acesso à conta.
              </p>
              {!gerarLinkUrl ? (
                <Button size="sm" disabled={gerarLinkLoading} onClick={handleGerarLink}>
                  {gerarLinkLoading ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Gerando...</> : "Gerar Link"}
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      value={gerarLinkUrl}
                      readOnly
                      className="h-8 text-xs font-mono flex-1 border rounded px-2 bg-muted/30 outline-none select-all"
                      onClick={e => (e.target as HTMLInputElement).select()}
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(gerarLinkUrl);
                        setGerarLinkCopied(true);
                        setTimeout(() => setGerarLinkCopied(false), 2000);
                      }}
                    >
                      {gerarLinkCopied ? <CheckCheck className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  <p className="text-xs text-amber-600">
                    ⚠ Link válido por aprox. 30 minutos. Se expirar, gere um novo.
                  </p>
                  <Button size="sm" variant="outline" onClick={handleGerarLink} disabled={gerarLinkLoading}>
                    {gerarLinkLoading ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />Gerando...</> : "Gerar Novo Link"}
                  </Button>
                </div>
              )}
            </div>

            {/* Opção 2 — Conectar diretamente */}
            <div className="border rounded-lg p-4 space-y-3">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Wifi className="h-4 w-4 text-primary" />
                Conectar Diretamente
              </h4>
              <p className="text-xs text-muted-foreground">
                Conecte agora mesmo, neste dispositivo. Útil quando o contador está presente com o cliente.
              </p>
              <Button size="sm" variant="outline" disabled={pluggyDirectLoading} onClick={handlePluggyDireto}>
                {pluggyDirectLoading
                  ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Conectando...</>
                  : "Conectar Agora"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Plano de Contas TXT import preview dialog */}
      <Dialog open={pcDialogOpen} onOpenChange={open => { if (!open) { setPcDialogOpen(false); setPcPreview([]); } }}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Importar Plano de Contas</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{pcPreview.length} contas encontradas. Confirme para importar:</p>
          <div className="overflow-y-auto flex-1 border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Código</th>
                  <th className="px-3 py-2 text-left font-medium">Nome</th>
                  <th className="px-3 py-2 text-left font-medium">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {pcPreview.map((c, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-1.5 font-mono text-xs">{c.codigo}</td>
                    <td className="px-3 py-1.5">{c.nome}</td>
                    <td className="px-3 py-1.5 capitalize text-xs text-muted-foreground">{c.tipo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => { setPcDialogOpen(false); setPcPreview([]); }}>Cancelar</Button>
            <Button onClick={handlePcImportConfirm} disabled={pcImporting}>
              {pcImporting ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Importando...</> : `Importar ${pcPreview.length} contas`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pagination */}
      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Exibindo {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} de {totalCount} empresas</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= totalCount} onClick={() => setPage(p => p + 1)}>Próxima</Button>
          </div>
        </div>
      )}
    </div>
  );
}
