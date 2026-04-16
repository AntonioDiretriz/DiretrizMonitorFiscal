import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Plus, MailOpen, AlertTriangle, XCircle, CheckCircle2,
  Pencil, RefreshCw, History, Ban, Loader2,
  ChevronsUpDown, ChevronUp, ChevronDown,
  Mail, MousePointerClick, Clock,
} from "lucide-react";
import { ExportButton } from "@/components/ExportButton";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, differenceInDays } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";

function formatPhoneNumber(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 9);
  if (d.length <= 4) return d;
  if (d.length <= 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function parsePhone(tel: string | null): { ddd: string; numero: string } {
  if (!tel) return { ddd: "", numero: "" };
  const d = tel.replace(/\D/g, "");
  return { ddd: d.slice(0, 2), numero: d.slice(2) };
}

type CaixaPostal = Tables<"caixas_postais">;
type Historico    = Tables<"caixas_postais_historico">;

type EmpresaLookup = { id: string; cnpj: string; razao_social: string };

const EMPTY_FORM = {
  numero: "",
  cnpj: "",
  empresa: "",
  empresa_id: "",
  nome_responsavel: "",
  telefone_ddd: "",
  telefone_numero: "",
  email_responsavel: "",
  data_inicio: format(new Date(), "yyyy-MM-dd"),
  valor_atual: "",
  gratuidade: false,
};

const EMPTY_RENOVACAO = {
  data_renovacao: format(new Date(), "yyyy-MM-dd"),
  valor_pago: "",
  observacao: "",
};

type SortCol = "empresa" | "vencimento" | "dias" | "numero";
type SortDir = "asc" | "desc";

function SortHeader({
  col, children, className, sortCol, sortDir, onSort,
}: {
  col: SortCol; children: React.ReactNode; className?: string;
  sortCol: SortCol; sortDir: SortDir; onSort: (c: SortCol) => void;
}) {
  const active = sortCol === col;
  const Icon = active ? (sortDir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <TableHead className={`cursor-pointer select-none hover:bg-muted/40 ${className ?? ""}`} onClick={() => onSort(col)}>
      <span className="inline-flex items-center gap-1">
        {children}
        <Icon className={`h-3.5 w-3.5 ${active ? "text-primary" : "text-muted-foreground/40"}`} />
      </span>
    </TableHead>
  );
}

export default function CaixasPostais() {
  const { user, ownerUserId } = useAuth();
  const { toast } = useToast();

  const [caixas, setCaixas]       = useState<CaixaPostal[]>([]);
  const [empresas, setEmpresas]   = useState<EmpresaLookup[]>([]);
  const [historicos, setHistoricos] = useState<Record<string, Historico[]>>({});

  const [dialogOpen, setDialogOpen]           = useState(false);
  const [historicoOpen, setHistoricoOpen]     = useState(false);
  const [renovacaoOpen, setRenovacaoOpen]     = useState(false);

  const [editingId, setEditingId]             = useState<string | null>(null);
  const [selectedId, setSelectedId]           = useState<string | null>(null);

  const [loadingCnpj, setLoadingCnpj]         = useState(false);
  const [statusFilter, setStatusFilter]       = useState<string | null>(null);
  const [search, setSearch]                   = useState("");
  const [searchParams]                        = useSearchParams();

  const [sortCol, setSortCol] = useState<SortCol>("vencimento");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [emailNotificacoes, setEmailNotificacoes] = useState<any[]>([]);

  const loadEmailNotificacoes = useCallback(async () => {
    if (!user) return;
    const { data } = await (supabase as any)
      .from("email_notificacoes")
      .select("*")
      .eq("tipo", "caixa_postal")
      .order("enviado_em", { ascending: false })
      .limit(50);
    setEmailNotificacoes(data || []);
  }, [user]);

  useEffect(() => { loadEmailNotificacoes(); }, [loadEmailNotificacoes]);

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  // Aplica filtro vindo da URL (?filtro=a_vencer)
  useEffect(() => {
    const f = searchParams.get("filtro");
    if (f) setStatusFilter(f);
  }, [searchParams]);

  const [form, setForm]               = useState(EMPTY_FORM);
  const [renovacaoForm, setRenovacaoForm] = useState(EMPTY_RENOVACAO);

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadCaixas = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("caixas_postais")
      .select("*")
      .order("numero", { ascending: true });
    setCaixas(data || []);
  }, [user]);

  const loadEmpresas = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("empresas")
      .select("id, cnpj, razao_social");
    setEmpresas(data || []);
  }, [user]);

  useEffect(() => { loadCaixas(); loadEmpresas(); }, [loadCaixas, loadEmpresas]);

  useEffect(() => {
    if (!ownerUserId) return;
    const channel = supabase
      .channel("caixas-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "caixas_postais" }, () => { loadCaixas(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [ownerUserId, loadCaixas]);

  // ── Status helpers ─────────────────────────────────────────────────────────

  const toDate = (s: string) => new Date(s + "T12:00:00");

  const getDias = (dataVencimento: string) =>
    differenceInDays(toDate(dataVencimento), toDate(format(new Date(), "yyyy-MM-dd")));

  const getStatus = (c: CaixaPostal) => {
    if (c.contrato_status === "rescindido")
      return { label: "Rescindida", color: "text-gray-500", bg: "bg-gray-100", icon: Ban,          id: "rescindido" };
    const d = getDias(c.data_vencimento);
    if (d < 0)   return { label: "Vencida",  color: "text-destructive",  bg: "bg-destructive/10", icon: XCircle,      id: "vencida"    };
    if (d <= 30) return { label: "A Vencer", color: "text-amber-600",    bg: "bg-amber-100",      icon: AlertTriangle, id: "a_vencer"  };
    return              { label: "Ativa",    color: "text-green-600",    bg: "bg-green-100",      icon: CheckCircle2,  id: "ativa"     };
  };

  // ── Sequential numbering ───────────────────────────────────────────────────

  const getProximoNumero = useCallback(() => {
    if (caixas.length === 0) return 1;
    const rescindidos = caixas
      .filter(c => c.contrato_status === "rescindido")
      .map(c => c.numero)
      .sort((a, b) => a - b);
    if (rescindidos.length > 0) return rescindidos[0];
    return Math.max(...caixas.map(c => c.numero)) + 1;
  }, [caixas]);

  const numerosDisponiveis = caixas
    .filter(c => c.contrato_status === "rescindido")
    .map(c => c.numero)
    .sort((a, b) => a - b);

  // ── CNPJ lookup ────────────────────────────────────────────────────────────

  const formatCnpj = (digits: string) =>
    digits
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1/$2")
      .replace(/(\d{4})(\d)/, "$1-$2")
      .slice(0, 18);

  const handleCnpjChange = async (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 14);
    const formatted = formatCnpj(digits);

    // Update formatted value immediately
    setForm(prev => ({ ...prev, cnpj: formatted }));

    if (digits.length !== 14) return;

    // 1. Try local empresas table first (links empresa_id)
    const local = empresas.find(e => e.cnpj.replace(/\D/g, "") === digits);
    if (local) {
      setForm(prev => ({ ...prev, cnpj: formatted, empresa: local.razao_social, empresa_id: local.id }));
      return;
    }

    // 2. Fallback: BrasilAPI (same as Empresas page)
    setLoadingCnpj(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
      if (!res.ok) throw new Error("não encontrado");
      const data = await res.json();
      const nome = data.razao_social || data.nome_fantasia || "";
      setForm(prev => ({ ...prev, cnpj: formatted, empresa: nome, empresa_id: "" }));
      toast({ title: "Empresa encontrada!", description: nome });
    } catch {
      // CNPJ not in BrasilAPI — clear empresa field and allow manual entry
      setForm(prev => ({ ...prev, cnpj: formatted, empresa: "", empresa_id: "" }));
      toast({
        title: "Empresa não encontrada automaticamente",
        description: "Preencha o nome da empresa manualmente.",
      });
    } finally {
      setLoadingCnpj(false);
    }
  };

  // ── Dialog handlers ────────────────────────────────────────────────────────

  const handleOpenNew = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, numero: String(getProximoNumero()), data_inicio: format(new Date(), "yyyy-MM-dd") });
    setDialogOpen(true);
  };

  const handleEdit = (c: CaixaPostal) => {
    setEditingId(c.id);
    setForm({
      numero:           String(c.numero),
      cnpj:             c.cnpj,
      empresa:          c.empresa,
      empresa_id:       c.empresa_id || "",
      nome_responsavel: c.nome_responsavel,
      telefone_ddd:     parsePhone(c.telefone).ddd,
      telefone_numero:  parsePhone(c.telefone).numero,
      email_responsavel: c.email_responsavel || "",
      data_inicio:      c.data_inicio,
      valor_atual:      c.valor_atual != null ? String(c.valor_atual) : "",
      gratuidade:       c.gratuidade ?? false,
    });
    setDialogOpen(true);
  };

  // ── CRUD ───────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const numero        = parseInt(form.numero);
    const dataVencimento = format(addDays(toDate(form.data_inicio), 365), "yyyy-MM-dd");

    // Bloqueia duplicata: mesma empresa ativa
    if (!editingId) {
      const cnpjNorm = form.cnpj.replace(/\D/g, "");
      const duplicata = caixas.find(c => {
        if (c.contrato_status === "rescindido") return false;
        const cCnpj = ((c as any).cnpj || "").replace(/\D/g, "");
        if (cnpjNorm && cCnpj) return cCnpj === cnpjNorm;
        return c.empresa.toLowerCase() === form.empresa.toLowerCase().trim();
      });
      if (duplicata) {
        toast({
          title: "Caixa postal duplicada",
          description: `Já existe uma caixa postal ativa para "${form.empresa}". Edite o registro existente.`,
          variant: "destructive",
        });
        return;
      }
    }

    // Check if the chosen number belongs to a rescinded box (re-rental)
    const existente = caixas.find(c => c.numero === numero && c.contrato_status === "rescindido");

    const payload = {
      user_id:          ownerUserId!,
      numero,
      cnpj:             form.cnpj,
      empresa:          form.empresa.trim(),
      empresa_id:       form.empresa_id || null,
      nome_responsavel: form.nome_responsavel.trim(),
      telefone:         form.telefone_ddd && form.telefone_numero
                          ? `(${form.telefone_ddd}) ${formatPhoneNumber(form.telefone_numero)}`
                          : null,
      email_responsavel: form.email_responsavel.trim() || null,
      data_inicio:      form.data_inicio,
      data_vencimento:  dataVencimento,
      valor_atual:      form.gratuidade ? 0 : (form.valor_atual ? parseFloat(form.valor_atual) : null),
      gratuidade:       form.gratuidade,
      contrato_status:  "ativo" as const,
      data_rescisao:    null,
    };

    let error: { message: string } | null;
    if (editingId) {
      ({ error } = await supabase.from("caixas_postais").update(payload).eq("id", editingId));
    } else if (existente) {
      // Re-rent: update the existing rescinded record
      ({ error } = await supabase.from("caixas_postais").update(payload).eq("id", existente.id));
    } else {
      ({ error } = await supabase.from("caixas_postais").insert(payload));
    }

    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingId ? "Caixa postal atualizada!" : "Caixa postal cadastrada!" });
    setDialogOpen(false);
    loadCaixas();
  };

  const handleRescindir = async (c: CaixaPostal) => {
    const { error } = await supabase
      .from("caixas_postais")
      .update({ contrato_status: "rescindido", data_rescisao: format(new Date(), "yyyy-MM-dd") })
      .eq("id", c.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Contrato rescindido", description: `Caixa nº ${c.numero} disponível para novo aluguel.` });
    loadCaixas();
  };

  const handleOpenHistorico = async (c: CaixaPostal) => {
    setSelectedId(c.id);
    const { data } = await supabase
      .from("caixas_postais_historico")
      .select("*")
      .eq("caixa_postal_id", c.id)
      .order("data_renovacao", { ascending: false });
    setHistoricos(prev => ({ ...prev, [c.id]: data || [] }));
    setHistoricoOpen(true);
  };

  const handleRenovar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedId) return;

    const { error: histErr } = await supabase.from("caixas_postais_historico").insert({
      caixa_postal_id: selectedId,
      user_id:         ownerUserId!,
      data_renovacao:  renovacaoForm.data_renovacao,
      valor_pago:      renovacaoForm.valor_pago ? parseFloat(renovacaoForm.valor_pago) : null,
      observacao:      renovacaoForm.observacao || null,
    });
    if (histErr) { toast({ title: "Erro", description: histErr.message, variant: "destructive" }); return; }

    const novoVencimento = format(addDays(toDate(renovacaoForm.data_renovacao), 365), "yyyy-MM-dd");
    await supabase.from("caixas_postais").update({
      data_inicio:     renovacaoForm.data_renovacao,
      data_vencimento: novoVencimento,
      contrato_status: "ativo",
    }).eq("id", selectedId);

    toast({ title: "Renovação registrada!", description: `Novo vencimento: ${format(toDate(novoVencimento), "dd/MM/yyyy")}.` });
    setRenovacaoOpen(false);
    setRenovacaoForm(EMPTY_RENOVACAO);
    loadCaixas();
  };

  // ── Derived data ───────────────────────────────────────────────────────────

  const caixasPorBusca = caixas.filter(c =>
    c.empresa.toLowerCase().includes(search.toLowerCase()) ||
    c.cnpj.includes(search) ||
    String(c.numero).includes(search) ||
    c.nome_responsavel.toLowerCase().includes(search.toLowerCase())
  );

  const ativas      = caixasPorBusca.filter(c => getStatus(c).id === "ativa").length;
  const aVencer     = caixasPorBusca.filter(c => getStatus(c).id === "a_vencer").length;
  const vencidas    = caixasPorBusca.filter(c => getStatus(c).id === "vencida").length;
  const rescindidas = caixasPorBusca.filter(c => getStatus(c).id === "rescindido").length;

  const caixasFiltradas = caixasPorBusca
    .filter(c => !statusFilter || statusFilter === "todos" || getStatus(c).id === statusFilter)
    .sort((a, b) => {
      let va: any, vb: any;
      if (sortCol === "empresa")    { va = a.empresa.toLowerCase(); vb = b.empresa.toLowerCase(); }
      else if (sortCol === "vencimento") { va = a.data_vencimento; vb = b.data_vencimento; }
      else if (sortCol === "dias")  { va = getDias(a.data_vencimento); vb = getDias(b.data_vencimento); }
      else                          { va = a.numero; vb = b.numero; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

  const selectedCaixa = caixas.find(c => c.id === selectedId);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Caixas Postais</h1>
          <p className="text-muted-foreground">Controle de contratos e vencimentos anuais.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            data={caixasFiltradas}
            filename="caixas_postais"
            title="Caixas Postais"
            columns={[
              { header: "Número",       value: r => r.numero },
              { header: "CNPJ",         value: r => r.cnpj, width: 1.2 },
              { header: "Responsável",  value: r => r.nome_responsavel, width: 1.5 },
              { header: "E-mail",       value: r => r.email_responsavel, width: 1.5 },
              { header: "Tel",          value: r => r.telefone ?? "—" },
              { header: "Início",       value: r => r.data_inicio ? format(new Date(r.data_inicio + "T12:00:00"), "dd/MM/yyyy") : "—" },
              { header: "Valor (R$)",   value: r => r.valor_atual != null ? Number(r.valor_atual).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—" },
              { header: "Status",       value: r => r.contrato_status },
            ]}
          />
          <Button onClick={handleOpenNew}>
            <Plus className="mr-2 h-4 w-4" /> Nova Caixa Postal
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { id: "ativa",      label: "Ativas",          count: ativas,      icon: CheckCircle2,  cardCls: "bg-green-50/40 border-green-200",    selCls: "ring-2 ring-green-500 bg-green-50",    textCls: "text-green-700"   },
          { id: "a_vencer",   label: "A Vencer (30d)",  count: aVencer,     icon: AlertTriangle, cardCls: "bg-amber-50/40 border-amber-200",    selCls: "ring-2 ring-amber-500 bg-amber-50",    textCls: "text-amber-700"   },
          { id: "vencida",    label: "Vencidas",         count: vencidas,    icon: XCircle,       cardCls: "bg-red-50/40 border-red-200",        selCls: "ring-2 ring-red-500 bg-red-50",        textCls: "text-destructive" },
          { id: "rescindido", label: "Rescindidas",      count: rescindidas, icon: Ban,           cardCls: "bg-gray-50/60 border-gray-200",      selCls: "ring-2 ring-gray-400 bg-gray-100",     textCls: "text-gray-600"    },
        ].map(({ id, label, count, icon: Icon, cardCls, selCls, textCls }) => (
          <Card
            key={id}
            onClick={() => setStatusFilter(statusFilter === id ? null : id)}
            className={`cursor-pointer transition-all hover:scale-[1.02] ${statusFilter === id ? selCls : cardCls}`}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className={`text-sm font-medium ${textCls}`}>{label}</CardTitle>
              <Icon className={`h-4 w-4 ${textCls}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${textCls}`}>{count}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Available numbers banner */}
      {numerosDisponiveis.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-700">
          <MailOpen className="h-4 w-4 shrink-0" />
          <span className="font-medium">Números disponíveis para novo contrato:</span>
          {numerosDisponiveis.map(n => (
            <Badge
              key={n}
              variant="outline"
              className="cursor-pointer bg-white border-blue-300 text-blue-700 hover:bg-blue-100"
              onClick={() => {
                setEditingId(null);
                setForm({ ...EMPTY_FORM, numero: String(n), data_inicio: format(new Date(), "yyyy-MM-dd") });
                setDialogOpen(true);
              }}
            >
              #{n}
            </Badge>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <Input
          placeholder="Buscar por nº, empresa, CNPJ ou responsável..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-96 bg-white"
        />
        <div className="flex items-center gap-2">
          {statusFilter && (
            <Button variant="outline" size="sm" onClick={() => setStatusFilter(null)}>Exibir Todos</Button>
          )}
          <Select value={statusFilter || "todos"} onValueChange={v => setStatusFilter(v === "todos" ? null : v)}>
            <SelectTrigger className="w-[180px] bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="ativa">Ativas</SelectItem>
              <SelectItem value="a_vencer">A Vencer</SelectItem>
              <SelectItem value="vencida">Vencidas</SelectItem>
              <SelectItem value="rescindido">Rescindidas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHeader col="numero" className="w-14" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Nº</SortHeader>
                <SortHeader col="empresa" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Empresa</SortHeader>
                <TableHead>CNPJ</TableHead>
                <TableHead>Responsável</TableHead>
                <SortHeader col="vencimento" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Vencimento</SortHeader>
                <SortHeader col="dias" className="w-20" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Dias</SortHeader>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {caixasFiltradas.length > 0 ? caixasFiltradas.map(c => {
                const st   = getStatus(c);
                const dias = c.contrato_status === "ativo" ? getDias(c.data_vencimento) : null;
                const Icon = st.icon;
                return (
                  <TableRow key={c.id} className={c.contrato_status === "rescindido" ? "opacity-55" : ""}>
                    <TableCell className="font-bold text-primary">#{c.numero}</TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {c.empresa}
                        {c.gratuidade && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-700 border border-violet-200">
                            GRATUIDADE
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">{c.cnpj}</TableCell>
                    <TableCell className="text-sm">{c.nome_responsavel}</TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {c.contrato_status === "rescindido"
                        ? <span className="text-muted-foreground italic">Rescindido {c.data_rescisao ? format(toDate(c.data_rescisao), "dd/MM/yyyy") : ""}</span>
                        : format(toDate(c.data_vencimento), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell>
                      {dias !== null && (
                        <span className={`font-semibold tabular-nums text-sm ${dias < 0 ? "text-destructive" : dias <= 10 ? "text-amber-600" : dias <= 30 ? "text-amber-500" : "text-green-600"}`}>
                          {dias < 0 ? "Vencido" : `${dias}d`}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${st.bg} ${st.color}`}>
                        <Icon className="mr-1.5 h-3.5 w-3.5" />{st.label}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        {c.contrato_status === "ativo" && (
                          <Button variant="ghost" size="icon" title="Renovar contrato" onClick={() => {
                            setSelectedId(c.id);
                            setRenovacaoForm(EMPTY_RENOVACAO);
                            setRenovacaoOpen(true);
                          }}>
                            <RefreshCw className="h-4 w-4 text-green-600" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" title="Histórico de renovações" onClick={() => handleOpenHistorico(c)}>
                          <History className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Editar" onClick={() => handleEdit(c)}>
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        {c.contrato_status === "ativo" && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" title="Rescindir contrato">
                                <Ban className="h-4 w-4 text-amber-600" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Rescindir contrato?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  A Caixa Postal <strong>nº {c.numero}</strong> ({c.empresa}) será marcada como rescindida e o número ficará disponível para novo contrato.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleRescindir(c)}
                                  className="bg-amber-600 hover:bg-amber-700"
                                >
                                  Rescindir
                                </AlertDialogAction>
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
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                    <MailOpen className="mx-auto h-8 w-8 mb-2 opacity-40" />
                    Nenhuma caixa postal encontrada.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Cadastro / Edição Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) setEditingId(null); setDialogOpen(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Caixa Postal" : "Nova Caixa Postal"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Número da Caixa Postal</Label>
                <Input
                  type="number" min="1"
                  value={form.numero}
                  onChange={e => setForm({ ...form, numero: e.target.value })}
                  required
                />
                {numerosDisponiveis.length > 0 && !editingId && (
                  <p className="text-xs text-blue-600">
                    Disponíveis: {numerosDisponiveis.map(n => `#${n}`).join(", ")}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Data de Início</Label>
                <Input
                  type="date"
                  value={form.data_inicio}
                  min="2000-01-01"
                  max="2099-12-31"
                  onChange={e => {
                    const val = e.target.value;
                    if (val && val.split("-")[0]?.length > 4) return;
                    setForm({ ...form, data_inicio: val });
                  }}
                  required
                />
              </div>
            </div>

            {/* Gratuidade toggle */}
            <div className={`flex items-center justify-between rounded-lg border p-3 ${form.gratuidade ? "border-violet-300 bg-violet-50" : "border-border bg-muted/20"}`}>
              <div>
                <p className="text-sm font-medium">Gratuidade</p>
                <p className="text-xs text-muted-foreground">Cliente ou parceiro com isenção de pagamento</p>
              </div>
              <Switch
                checked={form.gratuidade}
                onCheckedChange={checked =>
                  setForm({ ...form, gratuidade: checked, valor_atual: checked ? "0" : "" })
                }
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                CNPJ da Empresa
                {loadingCnpj && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </Label>
              <Input
                placeholder="00.000.000/0000-00"
                value={form.cnpj}
                onChange={e => handleCnpjChange(e.target.value)}
                maxLength={18}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Empresa (preenchido automaticamente pelo CNPJ)</Label>
              <Input
                value={form.empresa}
                readOnly={!!form.empresa_id}
                className={form.empresa_id ? "bg-muted/50 font-medium" : ""}
                onChange={e => !form.empresa_id ? setForm({ ...form, empresa: e.target.value }) : undefined}
                placeholder="Digite o CNPJ acima ou preencha manualmente"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Nome do Responsável</Label>
              <Input
                value={form.nome_responsavel}
                onChange={e => setForm({ ...form, nome_responsavel: e.target.value })}
                placeholder="Nome completo"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Telefone do Responsável</Label>
                <div className="flex gap-2">
                  <Input
                    className="w-16 text-center"
                    placeholder="DDD"
                    value={form.telefone_ddd}
                    maxLength={2}
                    onChange={e => {
                      const ddd = e.target.value.replace(/\D/g, "").slice(0, 2);
                      setForm({ ...form, telefone_ddd: ddd });
                    }}
                  />
                  <Input
                    placeholder="00000-0000"
                    value={formatPhoneNumber(form.telefone_numero)}
                    onChange={e => {
                      const num = e.target.value.replace(/\D/g, "").slice(0, 9);
                      setForm({ ...form, telefone_numero: num });
                    }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Valor do Contrato (R$)</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={form.gratuidade ? "0" : form.valor_atual}
                  onChange={e => setForm({ ...form, valor_atual: e.target.value })}
                  placeholder="0,00"
                  disabled={form.gratuidade}
                  className={form.gratuidade ? "bg-muted/50 text-muted-foreground" : ""}
                />
                {form.gratuidade && (
                  <p className="text-xs text-violet-600 font-medium">Isento — gratuidade aplicada</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>E-mail do Responsável</Label>
              <Input
                type="email"
                value={form.email_responsavel}
                onChange={e => setForm({ ...form, email_responsavel: e.target.value })}
                placeholder="responsavel@empresa.com.br"
              />
              <p className="text-xs text-muted-foreground">
                Alertas automáticos serão enviados 30 dias antes do vencimento.
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={!form.empresa}>
              {editingId ? "Salvar Alterações" : "Cadastrar Caixa Postal"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Renovação Dialog ── */}
      <Dialog open={renovacaoOpen} onOpenChange={setRenovacaoOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Renovar Contrato — Caixa #{selectedCaixa?.numero}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRenovar} className="space-y-4">
            <div className="space-y-2">
              <Label>Data da Renovação</Label>
              <Input
                type="date"
                value={renovacaoForm.data_renovacao}
                onChange={e => setRenovacaoForm({ ...renovacaoForm, data_renovacao: e.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground">Novo vencimento = data acima + 365 dias.</p>
            </div>
            <div className="space-y-2">
              <Label>Valor Pago (R$)</Label>
              <Input
                type="number" step="0.01" min="0"
                value={renovacaoForm.valor_pago}
                onChange={e => setRenovacaoForm({ ...renovacaoForm, valor_pago: e.target.value })}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-2">
              <Label>Observação (opcional)</Label>
              <Input
                value={renovacaoForm.observacao}
                onChange={e => setRenovacaoForm({ ...renovacaoForm, observacao: e.target.value })}
                placeholder="Ex: renovação anual 2025"
              />
            </div>
            <Button type="submit" className="w-full">Confirmar Renovação</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Histórico Dialog ── */}
      <Dialog open={historicoOpen} onOpenChange={setHistoricoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Histórico — Caixa #{selectedCaixa?.numero} · {selectedCaixa?.empresa}
            </DialogTitle>
          </DialogHeader>
          {selectedId && historicos[selectedId] ? (
            historicos[selectedId].length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data Renovação</TableHead>
                    <TableHead>Valor Pago</TableHead>
                    <TableHead>Observação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historicos[selectedId].map(h => (
                    <TableRow key={h.id}>
                      <TableCell className="tabular-nums">
                        {format(toDate(h.data_renovacao), "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell>
                        {h.valor_pago != null
                          ? `R$ ${h.valor_pago.toFixed(2).replace(".", ",")}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{h.observacao || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center py-8 text-muted-foreground text-sm">
                Nenhuma renovação registrada ainda.
              </p>
            )
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Rastreamento de Notificações por Email */}
      {emailNotificacoes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4 text-blue-500" />
              Notificações de Email Enviadas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Aviso</TableHead>
                  <TableHead>Enviado em</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aberto em</TableHead>
                  <TableHead>Clicou em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emailNotificacoes.map((n: any) => {
                  const caixa = caixas.find(c => c.id === n.referencia_id);
                  return (
                    <TableRow key={n.id}>
                      <TableCell className="font-medium">{n.destinatario_nome || caixa?.empresa || "—"}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${n.dias_aviso <= 7 ? "bg-red-100 text-red-700" : n.dias_aviso <= 15 ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                          {n.dias_aviso} dias
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(n.enviado_em), "dd/MM/yyyy HH:mm")}
                      </TableCell>
                      <TableCell>
                        {n.status === "clicou" ? (
                          <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
                            <MousePointerClick className="h-3.5 w-3.5" /> WhatsApp
                          </span>
                        ) : n.status === "aberto" ? (
                          <span className="inline-flex items-center gap-1 text-blue-600 text-xs font-medium">
                            <MailOpen className="h-3.5 w-3.5" /> Aberto
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                            <Clock className="h-3.5 w-3.5" /> Enviado
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {n.aberto_em ? format(new Date(n.aberto_em), "dd/MM HH:mm") : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {n.clicou_em ? format(new Date(n.clicou_em), "dd/MM HH:mm") : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
