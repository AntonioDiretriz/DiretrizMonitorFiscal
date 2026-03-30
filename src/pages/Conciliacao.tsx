import { useState, useEffect, useRef, useCallback } from "react";
import { format, differenceInDays } from "date-fns";
import {
  Building2, Plus, Upload, CheckCircle, XCircle, Clock,
  Link, Unlink, RefreshCw, Trash2, Pencil, ChevronDown, ChevronRight,
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

const NAVY  = "#10143D";
const GREEN = "#22c55e";
const AMBER = "#f59e0b";
const RED   = "#ED3237";
const GRAY  = "#6b7280";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ContaBancaria {
  id: string;
  user_id: string;
  empresa_id: string | null;
  banco: string;
  agencia: string | null;
  conta: string | null;
  tipo: string;
  descricao: string | null;
  saldo_inicial: number;
  ativo: boolean;
  created_at: string;
  empresas?: { razao_social: string } | null;
}

interface Transacao {
  id: string;
  conta_bancaria_id: string;
  data: string;
  descricao: string;
  valor: number;
  tipo: string;
  status: string;
  importacao_id: string | null;
  created_at: string;
}

interface ContaPagar {
  id: string;
  fornecedor: string;
  valor: number;
  data_vencimento: string;
  status: string;
}

interface Empresa { id: string; razao_social: string; }

// ── OFX parser (client-side) ──────────────────────────────────────────────────
function parseOFX(text: string): { data: string; descricao: string; valor: number; tipo: string; hash: string }[] {
  const transactions: { data: string; descricao: string; valor: number; tipo: string; hash: string }[] = [];
  const stmttrn = text.match(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi) || [];
  stmttrn.forEach(block => {
    const trntype = (block.match(/<TRNTYPE>([^<\r\n]+)/i)?.[1] || "DEBIT").trim();
    const dtposted = block.match(/<DTPOSTED>([^<\r\n]+)/i)?.[1]?.trim() || "";
    const amt = parseFloat(block.match(/<TRNAMT>([^<\r\n]+)/i)?.[1]?.trim() || "0");
    const memo = (block.match(/<MEMO>([^<\r\n]+)/i)?.[1] || block.match(/<NAME>([^<\r\n]+)/i)?.[1] || "").trim();
    const fitid = block.match(/<FITID>([^<\r\n]+)/i)?.[1]?.trim() || "";
    if (!dtposted || isNaN(amt)) return;
    // Parse date YYYYMMDD
    const year  = dtposted.slice(0, 4);
    const month = dtposted.slice(4, 6);
    const day   = dtposted.slice(6, 8);
    const data  = `${year}-${month}-${day}`;
    transactions.push({
      data,
      descricao: memo || trntype,
      valor: Math.abs(amt),
      tipo: amt < 0 || trntype === "DEBIT" ? "debito" : "credito",
      hash: fitid || `${data}-${amt}-${memo}`,
    });
  });
  return transactions;
}

// ── CSV parser (client-side, common Brazilian bank format) ────────────────────
function parseCSV(text: string): { data: string; descricao: string; valor: number; tipo: string; hash: string }[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const results: { data: string; descricao: string; valor: number; tipo: string; hash: string }[] = [];
  // Try to auto-detect: date col, descricao col, value col
  for (const line of lines.slice(1)) {
    const cols = line.split(/[;,]/).map(c => c.replace(/"/g, "").trim());
    if (cols.length < 3) continue;
    // Heuristic: col[0]=date, col[1]=description, col[2]=value
    const [rawDate, rawDesc, rawVal] = cols;
    const dateParts = rawDate.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!dateParts) continue;
    const data = `${dateParts[3]}-${dateParts[2]}-${dateParts[1]}`;
    const valor = parseFloat(rawVal.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
    if (isNaN(valor)) continue;
    results.push({
      data,
      descricao: rawDesc,
      valor: Math.abs(valor),
      tipo: valor < 0 ? "debito" : "credito",
      hash: `${data}-${valor}-${rawDesc}`.slice(0, 120),
    });
  }
  return results;
}

// ── ContaBancaria form ────────────────────────────────────────────────────────
const EMPTY_CB = { banco: "", agencia: "", conta: "", tipo: "corrente", descricao: "", saldo_inicial: 0, empresa_id: "" };

function ContaBancariaDialog({
  open, onOpenChange, editingId, initial, empresas, onSaved,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  editingId: string | null; initial: typeof EMPTY_CB;
  empresas: Empresa[]; onSaved: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial), [initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.banco) { toast({ title: "Informe o banco", variant: "destructive" }); return; }
    const payload = {
      user_id: user!.id,
      banco: form.banco,
      agencia: form.agencia || null,
      conta: form.conta || null,
      tipo: form.tipo,
      descricao: form.descricao || null,
      saldo_inicial: form.saldo_inicial || 0,
      empresa_id: form.empresa_id || null,
    };
    const { error } = editingId
      ? await supabase.from("contas_bancarias").update(payload).eq("id", editingId)
      : await supabase.from("contas_bancarias").insert(payload);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingId ? "Conta atualizada!" : "Conta cadastrada!" });
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editingId ? "Editar Conta Bancária" : "Nova Conta Bancária"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2">
              <Label>Banco *</Label>
              <Input placeholder="Ex: Bradesco, Itaú, Nubank..." value={form.banco} onChange={e => setForm({ ...form, banco: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Agência</Label>
              <Input placeholder="0000" value={form.agencia} onChange={e => setForm({ ...form, agencia: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Conta</Label>
              <Input placeholder="00000-0" value={form.conta} onChange={e => setForm({ ...form, conta: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="corrente">Corrente</SelectItem>
                  <SelectItem value="poupanca">Poupança</SelectItem>
                  <SelectItem value="pagamento">Pagamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Saldo Inicial (R$)</Label>
              <Input type="number" step="0.01" value={form.saldo_inicial || ""} onChange={e => setForm({ ...form, saldo_inicial: parseFloat(e.target.value) || 0 })} />
            </div>
            {empresas.length > 0 && (
              <div className="space-y-2 col-span-2">
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
            <div className="space-y-2 col-span-2">
              <Label>Descrição / Apelido</Label>
              <Input placeholder="Ex: Conta Principal" value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} />
            </div>
          </div>
          <Button type="submit" className="w-full">{editingId ? "Salvar" : "Cadastrar"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Conciliacao() {
  const { user, podeIncluir, podeEditar, podeExcluir } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [contas, setContas]             = useState<ContaBancaria[]>([]);
  const [transacoes, setTransacoes]     = useState<Transacao[]>([]);
  const [contasPagar, setContasPagar]   = useState<ContaPagar[]>([]);
  const [empresas, setEmpresas]         = useState<Empresa[]>([]);
  const [selectedConta, setSelectedConta] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editingForm, setEditingForm]   = useState(EMPTY_CB);
  const [uploading, setUploading]       = useState(false);
  const [matchDialogId, setMatchDialogId] = useState<string | null>(null);
  const [selectedContaPagarId, setSelectedContaPagarId] = useState<string>("");
  const [loading, setLoading]           = useState(true);

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [cbRes, tRes, cpRes, empRes] = await Promise.all([
      supabase.from("contas_bancarias").select("*, empresas(razao_social)").eq("user_id", user.id).order("created_at"),
      supabase.from("transacoes_bancarias").select("*").eq("user_id", user.id).order("data", { ascending: false }).limit(500),
      supabase.from("contas_pagar").select("id, fornecedor, valor, data_vencimento, status").eq("user_id", user.id).in("status", ["pendente", "aprovado"]).order("data_vencimento"),
      supabase.from("empresas").select("id, razao_social").eq("user_id", user.id).order("razao_social"),
    ]);
    setContas((cbRes.data ?? []) as ContaBancaria[]);
    setTransacoes((tRes.data ?? []) as Transacao[]);
    setContasPagar((cpRes.data ?? []) as ContaPagar[]);
    setEmpresas((empRes.data ?? []) as Empresa[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleEdit = (c: ContaBancaria) => {
    setEditingId(c.id);
    setEditingForm({
      banco: c.banco, agencia: c.agencia ?? "", conta: c.conta ?? "",
      tipo: c.tipo, descricao: c.descricao ?? "",
      saldo_inicial: c.saldo_inicial, empresa_id: c.empresa_id ?? "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("contas_bancarias").delete().eq("id", id);
    if (error) { toast({ title: "Erro ao excluir", variant: "destructive" }); return; }
    toast({ title: "Conta removida" });
    loadAll();
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConta) return;
    e.target.value = "";
    setUploading(true);

    const text = await file.text();
    const ext  = file.name.split(".").pop()?.toLowerCase();
    let parsed: ReturnType<typeof parseOFX> = [];

    if (ext === "ofx" || ext === "ofc") {
      parsed = parseOFX(text);
    } else if (ext === "csv") {
      parsed = parseCSV(text);
    } else {
      toast({ title: "Formato não suportado", description: "Use arquivos OFX ou CSV.", variant: "destructive" });
      setUploading(false);
      return;
    }

    if (parsed.length === 0) {
      toast({ title: "Nenhuma transação encontrada no arquivo", variant: "destructive" });
      setUploading(false);
      return;
    }

    // Create importacao record
    const { data: impData, error: impErr } = await supabase.from("importacoes_bancarias").insert({
      user_id: user!.id, conta_bancaria_id: selectedConta,
      formato: ext, arquivo_nome: file.name, status: "processando",
      total_transacoes: parsed.length,
    }).select().single();
    if (impErr) { toast({ title: "Erro ao registrar importação", variant: "destructive" }); setUploading(false); return; }

    // Insert transactions (ignore conflicts on hash_dedup)
    const rows = parsed.map(t => ({
      user_id: user!.id,
      conta_bancaria_id: selectedConta,
      importacao_id: impData.id,
      data: t.data,
      descricao: t.descricao,
      valor: t.valor,
      tipo: t.tipo,
      status: "pendente",
      hash_dedup: t.hash,
    }));

    const { error: insErr } = await supabase.from("transacoes_bancarias").upsert(rows, {
      onConflict: "user_id,conta_bancaria_id,hash_dedup",
      ignoreDuplicates: true,
    });

    await supabase.from("importacoes_bancarias").update({
      status: insErr ? "erro" : "concluido",
      erro_mensagem: insErr?.message ?? null,
    }).eq("id", impData.id);

    if (insErr) {
      toast({ title: "Erro ao importar transações", description: insErr.message, variant: "destructive" });
    } else {
      toast({ title: `${parsed.length} transações importadas!`, description: "Duplicatas foram ignoradas automaticamente." });
      loadAll();
    }
    setUploading(false);
  };

  const handleIgnorar = async (id: string) => {
    await supabase.from("transacoes_bancarias").update({ status: "ignorado" }).eq("id", id);
    setTransacoes(prev => prev.map(t => t.id === id ? { ...t, status: "ignorado" } : t));
  };

  const handleConciliar = async () => {
    if (!matchDialogId || !selectedContaPagarId) return;
    const { error } = await supabase.from("conciliacoes").insert({
      user_id: user!.id,
      transacao_id: matchDialogId,
      conta_pagar_id: selectedContaPagarId,
      tipo: "manual",
      confianca: 100,
      criado_por: user!.id,
    });
    if (error) { toast({ title: "Erro ao conciliar", variant: "destructive" }); return; }
    await supabase.from("transacoes_bancarias").update({ status: "conciliado" }).eq("id", matchDialogId);
    await supabase.from("contas_pagar").update({ status: "pago", data_pagamento: transacoes.find(t => t.id === matchDialogId)?.data }).eq("id", selectedContaPagarId);
    toast({ title: "Transação conciliada!" });
    setMatchDialogId(null);
    setSelectedContaPagarId("");
    loadAll();
  };

  const contasFiltradas = transacoes.filter(t => !selectedConta || t.conta_bancaria_id === selectedConta);
  const pendentes   = contasFiltradas.filter(t => t.status === "pendente").length;
  const conciliados = contasFiltradas.filter(t => t.status === "conciliado").length;
  const ignorados   = contasFiltradas.filter(t => t.status === "ignorado").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Conciliação Bancária</h1>
          <p className="text-muted-foreground">Importe extratos e concilie com contas a pagar</p>
        </div>
        {podeIncluir && (
          <Button onClick={() => { setEditingId(null); setEditingForm(EMPTY_CB); setDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Nova Conta Bancária
          </Button>
        )}
      </div>

      <ContaBancariaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingId={editingId}
        initial={editingForm}
        empresas={empresas}
        onSaved={loadAll}
      />

      <Tabs defaultValue="contas">
        <TabsList>
          <TabsTrigger value="contas">Contas Bancárias</TabsTrigger>
          <TabsTrigger value="transacoes">Transações & Conciliação</TabsTrigger>
        </TabsList>

        {/* ── Contas Bancárias ── */}
        <TabsContent value="contas" className="space-y-4 pt-4">
          {loading ? (
            <p className="text-muted-foreground text-sm">Carregando...</p>
          ) : contas.length === 0 ? (
            <Card className="shadow-sm">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
                <Building2 className="h-10 w-10 text-muted-foreground opacity-40" />
                <p className="text-muted-foreground">Nenhuma conta bancária cadastrada.</p>
                {podeIncluir && (
                  <Button size="sm" onClick={() => { setEditingId(null); setEditingForm(EMPTY_CB); setDialogOpen(true); }}>
                    <Plus className="mr-2 h-4 w-4" /> Cadastrar conta
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {contas.map(c => (
                <Card key={c.id} className="shadow-sm">
                  <CardHeader className="pb-2 flex flex-row items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{c.banco}</CardTitle>
                      {c.descricao && <p className="text-xs text-muted-foreground">{c.descricao}</p>}
                    </div>
                    <Badge variant="outline" className="text-xs capitalize">{c.tipo}</Badge>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {c.agencia && <p className="text-sm text-muted-foreground">Ag: {c.agencia} | Cc: {c.conta}</p>}
                    {c.empresas?.razao_social && <p className="text-xs text-muted-foreground">{c.empresas.razao_social}</p>}
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-sm font-medium">
                        Saldo inicial: R$ {Number(c.saldo_inicial).toFixed(2).replace(".", ",")}
                      </span>
                      <div className="flex gap-1">
                        {podeEditar && (
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(c)}>
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        )}
                        {podeExcluir && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon"><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir conta?</AlertDialogTitle>
                                <AlertDialogDescription>Todas as transações importadas para esta conta serão removidas.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(c.id)} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Transações ── */}
        <TabsContent value="transacoes" className="space-y-4 pt-4">
          {/* Seleção de conta + import */}
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={selectedConta ?? "todas"} onValueChange={v => setSelectedConta(v === "todas" ? null : v)}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Todas as contas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as contas</SelectItem>
                {contas.map(c => <SelectItem key={c.id} value={c.id}>{c.banco}{c.conta ? ` — ${c.conta}` : ""}</SelectItem>)}
              </SelectContent>
            </Select>

            {selectedConta && podeIncluir && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".ofx,.ofc,.csv"
                  className="hidden"
                  onChange={handleFileImport}
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Importando...</>
                  ) : (
                    <><Upload className="mr-2 h-4 w-4" /> Importar OFX / CSV</>
                  )}
                </Button>
              </>
            )}

            {/* KPIs */}
            {contasFiltradas.length > 0 && (
              <div className="flex gap-3 ml-auto text-sm">
                <span className="flex items-center gap-1" style={{ color: AMBER }}><Clock className="h-3.5 w-3.5" />{pendentes} pendentes</span>
                <span className="flex items-center gap-1" style={{ color: GREEN }}><CheckCircle className="h-3.5 w-3.5" />{conciliados} conciliados</span>
                <span className="flex items-center gap-1" style={{ color: GRAY }}><XCircle className="h-3.5 w-3.5" />{ignorados} ignorados</span>
              </div>
            )}
          </div>

          {/* Tabela */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-28"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                  ) : contasFiltradas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                        <Upload className="mx-auto h-8 w-8 mb-2 opacity-30" />
                        <p>{selectedConta ? "Nenhuma transação importada. Clique em Importar OFX / CSV." : "Selecione uma conta para ver as transações."}</p>
                      </TableCell>
                    </TableRow>
                  ) : contasFiltradas.map(t => (
                    <TableRow key={t.id} className={t.status === "conciliado" ? "bg-green-50/30" : t.status === "ignorado" ? "opacity-50" : ""}>
                      <TableCell className="text-sm">{format(new Date(t.data + "T12:00:00"), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="text-sm max-w-xs truncate">{t.descricao}</TableCell>
                      <TableCell>
                        <Badge style={{
                          backgroundColor: t.tipo === "credito" ? GREEN + "20" : RED + "20",
                          color: t.tipo === "credito" ? GREEN : RED,
                        }}>
                          {t.tipo === "credito" ? "Crédito" : "Débito"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium" style={{ color: t.tipo === "credito" ? GREEN : RED }}>
                        {t.tipo === "credito" ? "+" : "-"} R$ {Number(t.valor).toFixed(2).replace(".", ",")}
                      </TableCell>
                      <TableCell>
                        {t.status === "pendente" && <Badge style={{ backgroundColor: AMBER + "20", color: AMBER }}>Pendente</Badge>}
                        {t.status === "conciliado" && <Badge style={{ backgroundColor: GREEN + "20", color: GREEN }}>Conciliado</Badge>}
                        {t.status === "ignorado" && <Badge variant="secondary">Ignorado</Badge>}
                      </TableCell>
                      <TableCell>
                        {t.status === "pendente" && t.tipo === "debito" && (
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="ghost" size="icon" title="Conciliar com conta a pagar"
                              onClick={() => { setMatchDialogId(t.id); setSelectedContaPagarId(""); }}
                            >
                              <Link className="h-4 w-4 text-blue-500" />
                            </Button>
                            <Button variant="ghost" size="icon" title="Ignorar" onClick={() => handleIgnorar(t.id)}>
                              <XCircle className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Dialog: conciliar transação com conta a pagar ── */}
      <Dialog open={!!matchDialogId} onOpenChange={o => { if (!o) setMatchDialogId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Conciliar Transação</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">
            Selecione a conta a pagar que corresponde a esta transação bancária:
          </p>
          <Select value={selectedContaPagarId} onValueChange={setSelectedContaPagarId}>
            <SelectTrigger><SelectValue placeholder="Selecione uma conta a pagar..." /></SelectTrigger>
            <SelectContent>
              {contasPagar.map(cp => {
                const dias = differenceInDays(new Date(cp.data_vencimento + "T12:00:00"), new Date());
                return (
                  <SelectItem key={cp.id} value={cp.id}>
                    {cp.fornecedor} — R$ {Number(cp.valor).toFixed(2).replace(".", ",")}
                    {" "}({dias < 0 ? `${Math.abs(dias)}d atrasada` : dias === 0 ? "hoje" : `${dias}d`})
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setMatchDialogId(null)}>Cancelar</Button>
            <Button className="flex-1" onClick={handleConciliar} disabled={!selectedContaPagarId}>
              <Link className="mr-2 h-4 w-4" /> Conciliar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
