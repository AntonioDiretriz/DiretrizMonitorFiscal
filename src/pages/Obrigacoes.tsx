import { useState, useEffect, useCallback } from "react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus, ChevronLeft, ChevronRight, CheckCircle, AlertTriangle,
  Clock, Pencil, Trash2, Search, Filter,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

// ── Palette ───────────────────────────────────────────────────────────────────
const NAVY  = "#10143D";
const RED   = "#ED3237";
const GREEN = "#22c55e";
const AMBER = "#f59e0b";
const GRAY  = "#6b7280";

// ── Tipos de obrigação ────────────────────────────────────────────────────────
const TIPOS: { value: string; label: string; grupo: string }[] = [
  // Federal
  { value: "das",    label: "DAS — Simples Nacional",       grupo: "Federal" },
  { value: "darf",   label: "DARF — Impostos Federais",     grupo: "Federal" },
  { value: "irpj",   label: "IRPJ",                         grupo: "Federal" },
  { value: "csll",   label: "CSLL",                         grupo: "Federal" },
  { value: "pis",    label: "PIS/PASEP",                    grupo: "Federal" },
  { value: "cofins", label: "COFINS",                       grupo: "Federal" },
  { value: "inss",   label: "INSS — Contribuição",          grupo: "Federal" },
  { value: "fgts",   label: "FGTS",                         grupo: "Federal" },
  // Acessórias
  { value: "dctf",   label: "DCTF",                         grupo: "Acessória" },
  { value: "sped",   label: "SPED Fiscal / Contábil",       grupo: "Acessória" },
  { value: "ecf",    label: "ECF — Escrituração Cont. Fiscal", grupo: "Acessória" },
  { value: "ecd",    label: "ECD — Escrituração Cont. Digital", grupo: "Acessória" },
  { value: "dirf",   label: "DIRF",                         grupo: "Acessória" },
  { value: "rais",   label: "RAIS",                         grupo: "Acessória" },
  { value: "caged",  label: "CAGED",                        grupo: "Acessória" },
  // Municipal / Estadual
  { value: "iss",    label: "ISS",                          grupo: "Municipal" },
  { value: "icms",   label: "ICMS / SPED ICMS",             grupo: "Estadual" },
  // Outro
  { value: "outro",  label: "Outro",                        grupo: "Outro" },
];

const TIPO_LABEL: Record<string, string> = Object.fromEntries(TIPOS.map(t => [t.value, t.label]));

// ── Types ─────────────────────────────────────────────────────────────────────
interface Obrigacao {
  id: string;
  user_id: string;
  empresa_id: string | null;
  tipo: string;
  competencia: string;
  data_vencimento: string;
  data_cumprimento: string | null;
  valor: number | null;
  status: string;
  observacao: string | null;
  created_at: string;
  empresas?: { razao_social: string } | null;
}

interface Empresa { id: string; razao_social: string; }

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pendente:  { label: "Pendente",  color: AMBER, icon: Clock         },
  cumprida:  { label: "Cumprida",  color: GREEN, icon: CheckCircle   },
  vencida:   { label: "Vencida",   color: RED,   icon: AlertTriangle },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: GRAY, icon: Clock };
  return (
    <Badge style={{ backgroundColor: cfg.color + "20", color: cfg.color, border: `1px solid ${cfg.color}40` }}>
      {cfg.label}
    </Badge>
  );
}

function formatCurrency(v: number | null) {
  if (v === null || v === undefined) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Empty form ────────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  tipo: "das",
  empresa_id: "",
  competencia: format(startOfMonth(new Date()), "yyyy-MM-dd"),
  data_vencimento: "",
  valor: "",
  observacao: "",
};

// ── Calendar: mostra obrigações do mês em grade por dia ───────────────────────
function CalendarioMes({
  obrigacoes, mes, onCumprir,
}: {
  obrigacoes: Obrigacao[];
  mes: Date;
  onCumprir: (o: Obrigacao) => void;
}) {
  const start = startOfMonth(mes);
  const end   = endOfMonth(mes);
  const today = new Date();

  // group by data_vencimento
  const byDay: Record<string, Obrigacao[]> = {};
  obrigacoes.forEach(o => {
    const d = o.data_vencimento;
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(o);
  });

  const days: Date[] = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) {
    days.push(new Date(d));
  }

  // pad to start on correct weekday
  const firstDow = start.getDay(); // 0=Sun
  const padded = Array(firstDow).fill(null).concat(days);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground mb-1">
        {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map(d => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {padded.map((day, i) => {
          if (!day) return <div key={`pad-${i}`} />;
          const key = format(day, "yyyy-MM-dd");
          const items = byDay[key] ?? [];
          const isToday = format(day, "yyyy-MM-dd") === format(today, "yyyy-MM-dd");
          const hasPendente = items.some(o => o.status === "pendente");
          const hasVencida  = items.some(o => o.status === "vencida");
          return (
            <div
              key={key}
              className={`min-h-[64px] rounded-lg border p-1.5 text-xs ${
                isToday ? "border-blue-400 bg-blue-50/60" :
                hasVencida ? "border-red-200 bg-red-50/40" :
                hasPendente ? "border-amber-200 bg-amber-50/30" :
                items.length > 0 ? "border-green-200 bg-green-50/30" :
                "border-border bg-muted/10"
              }`}
            >
              <div className={`font-semibold mb-1 ${isToday ? "text-blue-600" : "text-foreground"}`}>
                {format(day, "d")}
              </div>
              {items.slice(0, 3).map(o => (
                <div
                  key={o.id}
                  className="truncate text-[10px] rounded px-1 mb-0.5 cursor-pointer"
                  style={{
                    backgroundColor: STATUS_CONFIG[o.status]?.color + "25" ?? GRAY + "25",
                    color: STATUS_CONFIG[o.status]?.color ?? GRAY,
                  }}
                  title={`${TIPO_LABEL[o.tipo] ?? o.tipo}${o.empresas ? " — " + o.empresas.razao_social : ""}`}
                  onClick={() => o.status === "pendente" && onCumprir(o)}
                >
                  {TIPO_LABEL[o.tipo] ?? o.tipo}
                </div>
              ))}
              {items.length > 3 && (
                <div className="text-[10px] text-muted-foreground">+{items.length - 3}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Obrigacoes() {
  const { user, podeIncluir, podeEditar, podeExcluir } = useAuth();
  const { toast } = useToast();

  const [obrigacoes, setObrigacoes] = useState<Obrigacao[]>([]);
  const [empresas, setEmpresas]     = useState<Empresa[]>([]);
  const [loading, setLoading]       = useState(true);
  const [mesCal, setMesCal]         = useState(startOfMonth(new Date()));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [cumprimDialog, setCumprimDialog] = useState<Obrigacao | null>(null);
  const [dataCumprimento, setDataCumprimento] = useState("");

  // Filtros lista
  const [filtroEmpresa, setFiltroEmpresa] = useState("todas");
  const [filtroStatus, setFiltroStatus]   = useState("todos");
  const [filtroTipo, setFiltroTipo]       = useState("todos");
  const [search, setSearch]               = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [obRes, empRes] = await Promise.all([
      supabase.from("obrigacoes")
        .select("*, empresas(razao_social)")
        .eq("user_id", user.id)
        .order("data_vencimento", { ascending: true }),
      supabase.from("empresas").select("id, razao_social").eq("user_id", user.id).order("razao_social"),
    ]);
    setObrigacoes((obRes.data ?? []) as Obrigacao[]);
    setEmpresas((empRes.data ?? []) as Empresa[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.tipo || !form.competencia || !form.data_vencimento) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    const payload = {
      user_id: user!.id,
      tipo: form.tipo,
      empresa_id: form.empresa_id || null,
      competencia: form.competencia,
      data_vencimento: form.data_vencimento,
      valor: form.valor ? parseFloat(String(form.valor)) : null,
      observacao: form.observacao || null,
      status: "pendente",
    };
    const { error } = editingId
      ? await supabase.from("obrigacoes").update(payload).eq("id", editingId)
      : await supabase.from("obrigacoes").insert(payload);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingId ? "Obrigação atualizada!" : "Obrigação cadastrada!" });
    setForm(EMPTY_FORM); setEditingId(null); setDialogOpen(false); load();
  };

  const handleEdit = (o: Obrigacao) => {
    setEditingId(o.id);
    setForm({
      tipo: o.tipo,
      empresa_id: o.empresa_id ?? "",
      competencia: o.competencia,
      data_vencimento: o.data_vencimento,
      valor: o.valor !== null ? String(o.valor) : "",
      observacao: o.observacao ?? "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("obrigacoes").delete().eq("id", id);
    if (error) { toast({ title: "Erro ao excluir", variant: "destructive" }); return; }
    toast({ title: "Obrigação removida" }); load();
  };

  const handleCumprir = async () => {
    if (!cumprimDialog) return;
    const data = dataCumprimento || format(new Date(), "yyyy-MM-dd");
    const { error } = await supabase.from("obrigacoes")
      .update({ status: "cumprida", data_cumprimento: data })
      .eq("id", cumprimDialog.id);
    if (error) { toast({ title: "Erro ao registrar", variant: "destructive" }); return; }
    toast({ title: "Obrigação cumprida!" });
    setCumprimDialog(null); setDataCumprimento(""); load();
  };

  // KPIs
  const today = new Date();
  const in7   = new Date(today.getTime() + 7 * 86400000);
  const total     = obrigacoes.length;
  const pendentes = obrigacoes.filter(o => o.status === "pendente").length;
  const vencendo  = obrigacoes.filter(o => o.status === "pendente" && new Date(o.data_vencimento + "T12:00:00") <= in7).length;
  const vencidas  = obrigacoes.filter(o => o.status === "vencida").length;
  const cumpridas = obrigacoes.filter(o => o.status === "cumprida").length;

  // Filtros para o calendário: só do mês exibido
  const obMes = obrigacoes.filter(o => {
    const d = new Date(o.data_vencimento + "T12:00:00");
    return d >= startOfMonth(mesCal) && d <= endOfMonth(mesCal);
  });

  // Filtros lista
  const filtered = obrigacoes.filter(o => {
    if (filtroEmpresa !== "todas" && o.empresa_id !== filtroEmpresa) return false;
    if (filtroStatus  !== "todos"  && o.status    !== filtroStatus)   return false;
    if (filtroTipo    !== "todos"  && o.tipo       !== filtroTipo)     return false;
    if (search) {
      const lbl = (TIPO_LABEL[o.tipo] ?? o.tipo).toLowerCase();
      const emp = (o.empresas?.razao_social ?? "").toLowerCase();
      if (!lbl.includes(search.toLowerCase()) && !emp.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Obrigações</h1>
          <p className="text-muted-foreground">Calendário de obrigações fiscais e trabalhistas</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={o => { if (!o) { setEditingId(null); setForm(EMPTY_FORM); } setDialogOpen(o); }}>
          {podeIncluir && (
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Nova Obrigação</Button>
            </DialogTrigger>
          )}
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editingId ? "Editar Obrigação" : "Nova Obrigação"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Federal","Acessória","Municipal","Estadual","Outro"].map(grupo => (
                      <div key={grupo}>
                        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase">{grupo}</div>
                        {TIPOS.filter(t => t.grupo === grupo).map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {empresas.length > 0 && (
                <div className="space-y-2">
                  <Label>Empresa</Label>
                  <Select value={form.empresa_id || "none"} onValueChange={v => setForm({ ...form, empresa_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.razao_social}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Competência *</Label>
                  <Input type="month"
                    value={form.competencia.slice(0, 7)}
                    onChange={e => setForm({ ...form, competencia: e.target.value + "-01" })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data de Vencimento *</Label>
                  <Input type="date" value={form.data_vencimento} onChange={e => setForm({ ...form, data_vencimento: e.target.value })} required />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Valor (R$)</Label>
                  <Input type="number" step="0.01" min="0" placeholder="0,00" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Observação</Label>
                  <Input placeholder="Observação opcional" value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} />
                </div>
              </div>
              <Button type="submit" className="w-full">{editingId ? "Salvar" : "Cadastrar"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total",             value: total,     color: NAVY,  bg: "#f0f1f8", icon: Clock         },
          { label: "Pendentes",         value: pendentes, color: AMBER, bg: "#fffbeb", icon: Clock         },
          { label: "Vencendo em 7 dias",value: vencendo,  color: RED,   bg: "#fff1f1", icon: AlertTriangle },
          { label: "Cumpridas",         value: cumpridas, color: GREEN, bg: "#f0fdf4", icon: CheckCircle   },
        ].map(({ label, value, color, bg, icon: Icon }) => (
          <Card key={label} className="border-0 shadow-sm" style={{ backgroundColor: bg }}>
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

      <Tabs defaultValue="calendario">
        <TabsList>
          <TabsTrigger value="calendario">Calendário</TabsTrigger>
          <TabsTrigger value="lista">Lista</TabsTrigger>
        </TabsList>

        {/* ── Calendário ── */}
        <TabsContent value="calendario" className="pt-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="icon" onClick={() => setMesCal(subMonths(mesCal, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <h2 className="font-semibold capitalize">
                  {format(mesCal, "MMMM 'de' yyyy", { locale: ptBR })}
                </h2>
                <Button variant="ghost" size="icon" onClick={() => setMesCal(addMonths(mesCal, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />Pendente</span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />Cumprida</span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />Vencida</span>
                <span className="ml-2 italic">Clique em uma pendente para registrar cumprimento</span>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
              ) : (
                <CalendarioMes
                  obrigacoes={obMes}
                  mes={mesCal}
                  onCumprir={o => { setCumprimDialog(o); setDataCumprimento(format(new Date(), "yyyy-MM-dd")); }}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Lista ── */}
        <TabsContent value="lista" className="pt-4 space-y-4">
          {/* Filtros */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar tipo ou empresa..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {empresas.length > 0 && (
              <Select value={filtroEmpresa} onValueChange={setFiltroEmpresa}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Empresa" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as empresas</SelectItem>
                  {empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.razao_social}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-36">
                <Filter className="mr-2 h-3.5 w-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendente">Pendentes</SelectItem>
                <SelectItem value="cumprida">Cumpridas</SelectItem>
                <SelectItem value="vencida">Vencidas</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                {TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Competência</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-28"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                        Nenhuma obrigação encontrada
                      </TableCell>
                    </TableRow>
                  ) : filtered.map(o => {
                    const venc = new Date(o.data_vencimento + "T12:00:00");
                    const dias = differenceInDays(venc, today);
                    const atrasada = dias < 0 && o.status === "pendente";
                    return (
                      <TableRow key={o.id} className={atrasada ? "bg-red-50/40" : ""}>
                        <TableCell>
                          <div className="font-medium text-sm">{TIPO_LABEL[o.tipo] ?? o.tipo}</div>
                          {o.observacao && <div className="text-xs text-muted-foreground">{o.observacao}</div>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{o.empresas?.razao_social || "—"}</TableCell>
                        <TableCell className="text-sm">{format(new Date(o.competencia + "T12:00:00"), "MM/yyyy")}</TableCell>
                        <TableCell>
                          <div className={`text-sm ${atrasada ? "text-red-600 font-medium" : ""}`}>
                            {format(venc, "dd/MM/yyyy")}
                          </div>
                          {o.status === "pendente" && (
                            <div className="text-xs text-muted-foreground">
                              {dias < 0 ? `${Math.abs(dias)}d em atraso` : dias === 0 ? "Vence hoje" : `${dias}d restantes`}
                            </div>
                          )}
                          {o.status === "cumprida" && o.data_cumprimento && (
                            <div className="text-xs text-green-600">
                              Cumprida em {format(new Date(o.data_cumprimento + "T12:00:00"), "dd/MM/yyyy")}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{formatCurrency(o.valor)}</TableCell>
                        <TableCell><StatusBadge status={o.status} /></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 justify-end">
                            {podeEditar && o.status === "pendente" && (
                              <Button
                                variant="ghost" size="icon" title="Marcar como cumprida"
                                onClick={() => { setCumprimDialog(o); setDataCumprimento(format(new Date(), "yyyy-MM-dd")); }}
                              >
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              </Button>
                            )}
                            {podeEditar && (
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(o)}>
                                <Pencil className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            )}
                            {podeExcluir && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir obrigação?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      <strong>{TIPO_LABEL[o.tipo] ?? o.tipo}</strong> de {format(new Date(o.competencia + "T12:00:00"), "MM/yyyy")} será removida.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDelete(o.id)} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog: registrar cumprimento */}
      <Dialog open={!!cumprimDialog} onOpenChange={o => { if (!o) setCumprimDialog(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Registrar Cumprimento</DialogTitle>
          </DialogHeader>
          {cumprimDialog && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                <strong>{TIPO_LABEL[cumprimDialog.tipo] ?? cumprimDialog.tipo}</strong>
                {cumprimDialog.empresas && ` — ${cumprimDialog.empresas.razao_social}`}
                {" "}({format(new Date(cumprimDialog.competencia + "T12:00:00"), "MM/yyyy")})
              </p>
              <div className="space-y-2">
                <Label>Data de Cumprimento</Label>
                <Input type="date" value={dataCumprimento} onChange={e => setDataCumprimento(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setCumprimDialog(null)}>Cancelar</Button>
                <Button className="flex-1" onClick={handleCumprir}>
                  <CheckCircle className="mr-2 h-4 w-4" /> Confirmar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
