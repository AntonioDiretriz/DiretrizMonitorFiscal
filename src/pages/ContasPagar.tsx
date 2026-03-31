import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { format, differenceInDays, addDays } from "date-fns";
import {
  Plus, Search, CreditCard, Trash2, Pencil, CheckCircle,
  AlertTriangle, Clock, XCircle, DollarSign, Filter,
} from "lucide-react";
import { ExportButton } from "@/components/ExportButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  useContasPagar, useCreateContaPagar, useUpdateContaPagar, useDeleteContaPagar,
  type ContaPagar, type ContaPagarInsert, type ContaPagarStatus,
} from "@/hooks/useContasPagar";

const NAVY  = "#10143D";
const RED   = "#ED3237";
const GREEN = "#22c55e";
const AMBER = "#f59e0b";
const GRAY  = "#6b7280";

const STATUS_CONFIG: Record<ContaPagarStatus, { label: string; color: string; icon: React.ElementType }> = {
  pendente:  { label: "Pendente",  color: AMBER, icon: Clock       },
  aprovado:  { label: "Aprovado",  color: NAVY,  icon: CheckCircle },
  pago:      { label: "Pago",      color: GREEN, icon: CheckCircle },
  vencido:   { label: "Vencido",   color: RED,   icon: AlertTriangle },
  cancelado: { label: "Cancelado", color: GRAY,  icon: XCircle     },
};

function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function StatusBadge({ status }: { status: ContaPagarStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <Badge style={{ backgroundColor: cfg.color + "20", color: cfg.color, border: `1px solid ${cfg.color}40` }}>
      {cfg.label}
    </Badge>
  );
}

const EMPTY_FORM: ContaPagarInsert = {
  fornecedor: "",
  cnpj_fornecedor: "",
  valor: 0,
  data_emissao: "",
  data_vencimento: "",
  empresa_id: null,
  plano_conta_id: null,
  forma_pagamento: "",
  descricao: "",
  observacao: "",
};

interface Empresa { id: string; razao_social: string; }
interface PlanoConta { id: string; codigo: string; nome: string; tipo: string; }

export default function ContasPagar() {
  const { user, podeIncluir, podeEditar, podeExcluir } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pagamentoDialogId, setPagamentoDialogId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ContaPagarInsert>(EMPTY_FORM);
  const [dataPagamento, setDataPagamento] = useState("");
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [planoContas, setPlanoContas] = useState<PlanoConta[]>([]);

  const { data: contas = [], isLoading } = useContasPagar();
  const createConta = useCreateContaPagar();
  const updateConta = useUpdateContaPagar();
  const deleteConta = useDeleteContaPagar();

  useEffect(() => {
    if (!user) return;
    supabase.from("empresas").select("id, razao_social").eq("user_id", user.id).order("razao_social")
      .then(({ data }) => setEmpresas(data ?? []));
    supabase.from("plano_contas").select("id, codigo, nome, tipo").eq("user_id", user.id).order("codigo")
      .then(({ data }) => setPlanoContas(data ?? []));
  }, [user]);

  const today = new Date();
  const in7   = addDays(today, 7);

  // KPIs
  const totalPendente = contas.filter(c => c.status === "pendente" || c.status === "aprovado").reduce((s, c) => s + Number(c.valor), 0);
  const vencendo7d    = contas.filter(c => ["pendente","aprovado"].includes(c.status) && new Date(c.data_vencimento + "T12:00:00") <= in7 && new Date(c.data_vencimento + "T12:00:00") >= today).length;
  const vencidas      = contas.filter(c => c.status === "vencido").length;
  const pagoMes       = contas.filter(c => c.status === "pago" && c.data_pagamento?.startsWith(format(today, "yyyy-MM"))).reduce((s, c) => s + Number(c.valor), 0);

  const filtroParam = searchParams.get("filtro");
  const filtroLabels: Record<string, string> = {
    vencendo: "Vencendo em 7 dias",
    vencidas: "Vencidas",
    pendente: "Pendentes",
  };

  const filtered = contas.filter(c => {
    const matchSearch = c.fornecedor.toLowerCase().includes(search.toLowerCase()) ||
      (c.descricao ?? "").toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filtroParam === "vencendo") return ["pendente","aprovado"].includes(c.status) && new Date(c.data_vencimento + "T12:00:00") <= in7 && new Date(c.data_vencimento + "T12:00:00") >= today;
    if (filtroParam === "vencidas") return c.status === "vencido";
    if (filtroParam === "pendente") return c.status === "pendente" || c.status === "aprovado";
    if (statusFiltro !== "todos") return c.status === statusFiltro;
    return true;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fornecedor || !form.data_vencimento || !form.valor) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    try {
      if (editingId) {
        await updateConta.mutateAsync({ id: editingId, ...form });
        toast({ title: "Conta atualizada!" });
      } else {
        await createConta.mutateAsync(form);
        toast({ title: "Conta cadastrada!" });
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      setDialogOpen(false);
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    }
  };

  const handleEdit = (c: ContaPagar) => {
    setEditingId(c.id);
    setForm({
      fornecedor: c.fornecedor,
      cnpj_fornecedor: c.cnpj_fornecedor ?? "",
      valor: c.valor,
      data_emissao: c.data_emissao ?? "",
      data_vencimento: c.data_vencimento,
      empresa_id: c.empresa_id ?? null,
      plano_conta_id: c.plano_conta_id ?? null,
      forma_pagamento: c.forma_pagamento ?? "",
      descricao: c.descricao ?? "",
      observacao: c.observacao ?? "",
    });
    setDialogOpen(true);
  };

  const handleRegistrarPagamento = async (id: string) => {
    if (!dataPagamento) { toast({ title: "Informe a data de pagamento", variant: "destructive" }); return; }
    try {
      await updateConta.mutateAsync({ id, status: "pago", data_pagamento: dataPagamento });
      toast({ title: "Pagamento registrado!" });
      setPagamentoDialogId(null);
      setDataPagamento("");
    } catch {
      toast({ title: "Erro ao registrar pagamento", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteConta.mutateAsync(id);
      toast({ title: "Conta removida" });
    } catch {
      toast({ title: "Erro ao remover", variant: "destructive" });
    }
  };

  const kpis = [
    { label: "Total Pendente",      value: formatCurrency(totalPendente), icon: CreditCard,   color: NAVY,  bg: "#f0f1f8", filtro: "pendente" },
    { label: "Vencendo em 7 dias",  value: String(vencendo7d),            icon: Clock,        color: AMBER, bg: "#fffbeb", filtro: "vencendo" },
    { label: "Vencidas",            value: String(vencidas),              icon: AlertTriangle,color: RED,   bg: "#fff1f1", filtro: "vencidas" },
    { label: "Pago no mês",         value: formatCurrency(pagoMes),       icon: CheckCircle,  color: GREEN, bg: "#f0fdf4", filtro: null },
  ];

  const planoContaLabel = (id: string | null) => {
    const p = planoContas.find(p => p.id === id);
    return p ? `${p.codigo} — ${p.nome}` : null;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contas a Pagar</h1>
          <p className="text-muted-foreground">Gerencie seus títulos e vencimentos</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            data={filtered}
            filename="contas_pagar"
            title="Contas a Pagar"
            columns={[
              { header: "Fornecedor",  value: r => r.fornecedor, width: 2 },
              { header: "CNPJ",        value: r => r.cnpj_fornecedor },
              { header: "Valor",       value: r => r.valor?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
              { header: "Vencimento",  value: r => r.data_vencimento ? format(new Date(r.data_vencimento + "T12:00:00"), "dd/MM/yyyy") : "—" },
              { header: "Status",      value: r => STATUS_CONFIG[r.status as ContaPagarStatus]?.label ?? r.status },
              { header: "Descrição",   value: r => r.descricao, width: 1.5 },
            ]}
          />
        <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setEditingId(null); setForm(EMPTY_FORM); } setDialogOpen(o); }}>
          {podeIncluir && (
            <DialogTrigger asChild>
              <Button onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}>
                <Plus className="mr-2 h-4 w-4" /> Nova Conta
              </Button>
            </DialogTrigger>
          )}
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Conta" : "Nova Conta a Pagar"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label>Fornecedor *</Label>
                  <Input placeholder="Nome do fornecedor" value={form.fornecedor} onChange={e => setForm({ ...form, fornecedor: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>CNPJ/CPF</Label>
                  <Input placeholder="00.000.000/0001-00" value={form.cnpj_fornecedor ?? ""} onChange={e => setForm({ ...form, cnpj_fornecedor: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Valor (R$) *</Label>
                  <Input type="number" step="0.01" min="0" placeholder="0,00" value={form.valor || ""} onChange={e => setForm({ ...form, valor: parseFloat(e.target.value) || 0 })} required />
                </div>
                <div className="space-y-2">
                  <Label>Data de Emissão</Label>
                  <Input type="date" value={form.data_emissao ?? ""} onChange={e => setForm({ ...form, data_emissao: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Data de Vencimento *</Label>
                  <Input type="date" value={form.data_vencimento} onChange={e => setForm({ ...form, data_vencimento: e.target.value })} required />
                </div>

                {/* Empresa */}
                {empresas.length > 0 && (
                  <div className="space-y-2 col-span-2">
                    <Label>Empresa</Label>
                    <Select
                      value={form.empresa_id ?? "none"}
                      onValueChange={v => setForm({ ...form, empresa_id: v === "none" ? null : v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma</SelectItem>
                        {empresas.map(e => (
                          <SelectItem key={e.id} value={e.id}>{e.razao_social}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Plano de contas */}
                {planoContas.length > 0 && (
                  <div className="space-y-2 col-span-2">
                    <Label>Categoria (Plano de Contas)</Label>
                    <Select
                      value={form.plano_conta_id ?? "none"}
                      onValueChange={v => setForm({ ...form, plano_conta_id: v === "none" ? null : v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Nenhuma categoria" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma categoria</SelectItem>
                        {planoContas.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.codigo} — {p.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Forma de Pagamento</Label>
                  <Select value={form.forma_pagamento ?? ""} onValueChange={v => setForm({ ...form, forma_pagamento: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="boleto">Boleto</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                      <SelectItem value="cartao">Cartão</SelectItem>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Input placeholder="Descrição opcional" value={form.descricao ?? ""} onChange={e => setForm({ ...form, descricao: e.target.value })} />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={createConta.isPending || updateConta.isPending}>
                {editingId ? "Salvar Alterações" : "Cadastrar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ label, value, icon: Icon, color, bg, filtro }) => (
          <Card
            key={label}
            className={`border-0 shadow-sm ${filtro ? "cursor-pointer hover:scale-[1.02] hover:shadow-md transition-transform" : ""}`}
            style={{ backgroundColor: bg }}
            onClick={() => filtro && setSearchParams({ filtro })}
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

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por fornecedor ou descrição..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFiltro} onValueChange={v => { setStatusFiltro(v); setSearchParams({}); }}>
          <SelectTrigger className="w-40">
            <Filter className="mr-2 h-3.5 w-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="pendente">Pendentes</SelectItem>
            <SelectItem value="aprovado">Aprovados</SelectItem>
            <SelectItem value="vencido">Vencidos</SelectItem>
            <SelectItem value="pago">Pagos</SelectItem>
            <SelectItem value="cancelado">Cancelados</SelectItem>
          </SelectContent>
        </Select>
        {filtroParam && filtroLabels[filtroParam] && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700">
            <span>Filtro: <strong>{filtroLabels[filtroParam]}</strong></span>
            <button className="ml-1 hover:text-amber-900 font-bold" onClick={() => setSearchParams({})}>✕</button>
          </div>
        )}
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-28"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <CreditCard className="mx-auto h-8 w-8 mb-2 opacity-40" />
                    Nenhuma conta encontrada
                  </TableCell>
                </TableRow>
              ) : filtered.map(c => {
                const venc = new Date(c.data_vencimento + "T12:00:00");
                const dias = differenceInDays(venc, today);
                const vencendoHoje = dias === 0 && c.status !== "pago";
                const atrasado = dias < 0 && c.status !== "pago" && c.status !== "cancelado";
                const categoriaLabel = planoContaLabel(c.plano_conta_id);
                return (
                  <TableRow key={c.id} className={atrasado ? "bg-red-50/50" : vencendoHoje ? "bg-amber-50/50" : ""}>
                    <TableCell>
                      <div className="font-medium">{c.fornecedor}</div>
                      {c.descricao && <div className="text-xs text-muted-foreground">{c.descricao}</div>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.empresas?.razao_social || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {categoriaLabel || "—"}
                    </TableCell>
                    <TableCell>
                      <div className={atrasado ? "text-red-600 font-medium" : vencendoHoje ? "text-amber-600 font-medium" : ""}>
                        {format(venc, "dd/MM/yyyy")}
                      </div>
                      {c.status !== "pago" && c.status !== "cancelado" && (
                        <div className="text-xs text-muted-foreground">
                          {dias < 0 ? `${Math.abs(dias)}d em atraso` : dias === 0 ? "Vence hoje" : `${dias}d restantes`}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{formatCurrency(Number(c.valor))}</TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        {podeEditar && c.status !== "pago" && c.status !== "cancelado" && (
                          <Dialog open={pagamentoDialogId === c.id} onOpenChange={o => { setPagamentoDialogId(o ? c.id : null); if (!o) setDataPagamento(""); }}>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="icon" title="Registrar pagamento">
                                <DollarSign className="h-4 w-4 text-green-600" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-xs">
                              <DialogHeader><DialogTitle>Registrar Pagamento</DialogTitle></DialogHeader>
                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <Label>Data do Pagamento</Label>
                                  <Input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} />
                                </div>
                                <Button className="w-full" onClick={() => handleRegistrarPagamento(c.id)}>Confirmar Pagamento</Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        )}
                        {podeEditar && (
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(c)}>
                            <Pencil className="h-4 w-4 text-muted-foreground hover:text-primary" />
                          </Button>
                        )}
                        {podeExcluir && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir conta?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  A conta de <strong>{c.fornecedor}</strong> no valor de <strong>{formatCurrency(Number(c.valor))}</strong> será removida permanentemente.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(c.id)} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
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
    </div>
  );
}
