import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Building2, Trash2, Loader2, Pencil, MapPin, UserPlus, Cake, Users2, Banknote, Upload } from "lucide-react";
import { ExportButton } from "@/components/ExportButton";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

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

function parseTxtPC(txt: string): { codigo: string; nome: string; tipo: PlanoContaTipo }[] {
  const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return [];

  // Detecta separador dominante
  const sep = lines[0].includes("\t") ? "\t"
    : lines[0].includes(";") ? ";"
    : lines[0].includes("|") ? "|"
    : null;

  // Converte todas as linhas em arrays de colunas
  const rows: string[][] = lines.map(line => {
    if (sep) return line.split(sep).map(p => p.trim());
    // Sem separador: tenta "código espaços nome"
    const m = line.match(/^([\d][.\d-]*)\s+(.+)$/);
    if (m) return [m[1], m[2]];
    return [line];
  });

  const maxCols = Math.max(...rows.map(r => r.length));
  if (maxCols < 2) return [];

  // Testa todos os pares (codeCol, nameCol) e escolhe o que produz mais linhas válidas
  let bestCode = 0, bestName = 1, bestCount = 0;

  for (let ci = 0; ci < maxCols; ci++) {
    for (let ni = 0; ni < maxCols; ni++) {
      if (ci === ni) continue;
      let count = 0;
      for (const row of rows) {
        if (isCodigoContabil(row[ci] ?? "") && isNomeConta(row[ni] ?? "")) count++;
      }
      if (count > bestCount) { bestCount = count; bestCode = ci; bestName = ni; }
    }
  }

  if (bestCount === 0) return [];

  const result: { codigo: string; nome: string; tipo: PlanoContaTipo }[] = [];
  for (const row of rows) {
    const codigo = row[bestCode] ?? "";
    const nome   = row[bestName] ?? "";
    if (!isCodigoContabil(codigo) || !isNomeConta(nome)) continue;
    result.push({ codigo, nome, tipo: detectTipoPC(nome) });
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
  // financeiro / integração Domínio
  codigo_dominio: "", plano_contas_dominio: "", codigo_contabil: "",
};

// ── Component ────────────────────────────────────────────────────────────────

export default function Empresas() {
  const { user, podeIncluir: PODE_INCLUIR, podeEditar: PODE_EDITAR, podeExcluir: PODE_EXCLUIR, ownerUserId } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [empresas,   setEmpresas]   = useState<Tables<"empresas">[]>([]);
  const [sociosMap,  setSociosMap]  = useState<Record<string, Socio[]>>({});
  const [search,     setSearch]     = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [page,       setPage]       = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const [socios,    setSocios]    = useState<Socio[]>([]);
  const [socioForm, setSocioForm] = useState<Socio>(EMPTY_SOCIO);
  const [activeTab, setActiveTab] = useState("empresa");

  const [loadingCnpj, setLoadingCnpj] = useState(false);
  const [loadingCep,  setLoadingCep]  = useState(false);

  const [pcPreview,       setPcPreview]       = useState<{ codigo: string; nome: string; tipo: PlanoContaTipo }[]>([]);
  const [pcDialogOpen,    setPcDialogOpen]    = useState(false);
  const [pcImporting,     setPcImporting]     = useState(false);
  const [pcContas,        setPcContas]        = useState<{ id: string; codigo: string; nome: string; tipo: string }[]>([]);
  const pcFileRef = useRef<HTMLInputElement>(null);

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
      const { data: sd } = await (supabase as any).from("socios").select("*").in("empresa_id", ids);
      const map: Record<string, Socio[]> = {};
      for (const s of sd ?? []) {
        if (!map[s.empresa_id]) map[s.empresa_id] = [];
        map[s.empresa_id].push({ nome: s.nome, cpf: s.cpf || "", data_nascimento: s.data_nascimento || "", email: s.email || "", cargo: s.cargo || "" });
      }
      setSociosMap(map);
    }
  }, [user, page]);

  useEffect(() => { loadEmpresas(); }, [loadEmpresas]);

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
      codigo_dominio:       e.codigo_dominio       || "",
      plano_contas_dominio: e.plano_contas_dominio || "",
      codigo_contabil:      e.codigo_contabil      || "",
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
    };

    let empresaId: string | null = editingId;

    // Try save with address columns; fallback without them if migration not run yet
    const save = async (p: Record<string, any>) => {
      if (editingId) {
        return supabase.from("empresas").update(p).eq("id", editingId);
      }
      return supabase.from("empresas").insert(p).select("id").single();
    };

    let { data: saved, error } = await save(payload);

    if (error?.message && ["cep","logradouro","numero","complemento","bairro"].some(c => error!.message.includes(c))) {
      const { cep: _c, logradouro: _l, numero: _n, complemento: _co, bairro: _b, ...base } = payload;
      ({ data: saved, error } = await save(base));
      if (!error) toast({ title: "Atenção", description: "Execute a migration 20260331_socios_endereco.sql para habilitar os campos de endereço.", variant: "destructive" });
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
    const reader = new FileReader();
    reader.onload = (ev) => {
      const txt = ev.target?.result as string;
      const parsed = parseTxtPC(txt);
      if (parsed.length === 0) {
        toast({ title: "Nenhuma conta encontrada", description: "Verifique o formato do arquivo. Cada linha deve ter: código e nome separados por ; | tab ou espaço.", variant: "destructive" });
        return;
      }
      setPcPreview(parsed);
      setPcDialogOpen(true);
    };
    reader.readAsText(file, "UTF-8");
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
    const payload = pcPreview.map(c => ({ user_id: ownerUserId!, empresa_id: editingId, codigo: c.codigo, nome: c.nome, tipo: c.tipo, parent_id: null }));
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
    setPcContas([]);
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

            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar Empresa" : "Cadastrar Empresa"}</DialogTitle>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Tabs value={activeTab} onValueChange={tab => { setActiveTab(tab); if (tab === "financeiro" && editingId) loadPcContas(editingId); }}>
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="empresa">Empresa</TabsTrigger>
                    <TabsTrigger value="endereco" className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" /> Endereço
                    </TabsTrigger>
                    <TabsTrigger value="socios" className="flex items-center gap-1">
                      <Users2 className="h-3.5 w-3.5" /> Sócios {socios.length > 0 && `(${socios.length})`}
                    </TabsTrigger>
                    <TabsTrigger value="financeiro" className="flex items-center gap-1">
                      <Banknote className="h-3.5 w-3.5" /> Financeiro
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

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Regime Tributário</Label>
                        <Select value={form.regime_tributario} onValueChange={v => setForm(p => ({ ...p, regime_tributario: v }))}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="simples">Simples Nacional</SelectItem>
                            <SelectItem value="presumido">Lucro Presumido</SelectItem>
                            <SelectItem value="real">Lucro Real</SelectItem>
                            <SelectItem value="mei">MEI</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Atividade Principal</Label>
                        <Select value={form.atividade} onValueChange={v => setForm(p => ({ ...p, atividade: v }))}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="servico">Serviço</SelectItem>
                            <SelectItem value="comercio">Comércio</SelectItem>
                            <SelectItem value="misto">Misto (Serv + Com)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Perfil Operacional</Label>
                      <div className="flex flex-wrap gap-4 pt-1">
                        <div className="flex items-center gap-2">
                          <Checkbox id="possui_prolabore" checked={form.possui_prolabore}
                            onCheckedChange={v => setForm(p => ({ ...p, possui_prolabore: !!v }))} />
                          <label htmlFor="possui_prolabore" className="text-sm cursor-pointer select-none">Pró-labore</label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox id="possui_funcionario" checked={form.possui_funcionario}
                            onCheckedChange={v => setForm(p => ({ ...p, possui_funcionario: !!v }))} />
                          <label htmlFor="possui_funcionario" className="text-sm cursor-pointer select-none">Funcionários CLT</label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox id="tem_retencoes" checked={form.tem_retencoes}
                            onCheckedChange={v => setForm(p => ({ ...p, tem_retencoes: !!v }))} />
                          <label htmlFor="tem_retencoes" className="text-sm cursor-pointer select-none">Retenções na fonte</label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox id="tem_reinf" checked={form.tem_reinf}
                            onCheckedChange={v => setForm(p => ({ ...p, tem_reinf: !!v }))} />
                          <label htmlFor="tem_reinf" className="text-sm cursor-pointer select-none">e-Social / EFD-Reinf</label>
                        </div>
                      </div>
                      {form.regime_tributario && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Perfil:{" "}
                          <Badge variant="outline" className="text-xs font-mono">
                            {resolvePerfilCodigo(form.regime_tributario, form.atividade, form.possui_prolabore, form.possui_funcionario)}
                          </Badge>
                        </p>
                      )}
                    </div>

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
                        <input ref={pcFileRef} type="file" accept=".txt,.csv" className="hidden" onChange={handlePcFile} />
                        <Button type="button" variant="outline" size="sm" onClick={() => pcFileRef.current?.click()}>
                          <Upload className="mr-2 h-3.5 w-3.5" /> Importar TXT
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
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <Building2 className="mx-auto h-8 w-8 mb-2 opacity-40" />
                    Nenhuma empresa cadastrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
