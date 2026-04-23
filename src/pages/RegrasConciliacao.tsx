import { useState, useEffect, useCallback } from "react";
import { Tag, Trash2, Pencil, Plus, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const GREEN = "#22c55e";
const RED   = "#ED3237";

interface Regra {
  id: string;
  padrao: string;
  tipo: string;
  plano_contas_id: string | null;
  uso_count: number;
  automatica: boolean;
  updated_at: string;
}

interface PlanoContas { id: string; nome: string; codigo: string | null; tipo: string; }

const EMPTY_FORM = { padrao: "", tipo: "debito", plano_contas_id: "", automatica: false };

export default function RegrasConciliacao() {
  const { user, ownerUserId, podeEditar, podeExcluir, podeIncluir } = useAuth();
  const { toast } = useToast();

  const [regras,      setRegras]      = useState<Regra[]>([]);
  const [planoContas, setPlanoContas] = useState<PlanoContas[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [dialogOpen,  setDialogOpen]  = useState(false);
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [search,      setSearch]      = useState("");
  const [saving,      setSaving]      = useState(false);

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [rRes, pcRes] = await Promise.all([
      (supabase as any).from("regras_conciliacao").select("*").order("uso_count", { ascending: false }),
      supabase.from("plano_contas").select("id, nome, codigo, tipo").order("codigo").order("nome"),
    ]);
    setRegras(rRes.data ?? []);
    setPlanoContas((pcRes.data ?? []) as PlanoContas[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (r: Regra) => {
    setEditingId(r.id);
    setForm({ padrao: r.padrao, tipo: r.tipo, plano_contas_id: r.plano_contas_id ?? "", automatica: r.automatica });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.padrao.trim()) { toast({ title: "Informe o padrão de descrição", variant: "destructive" }); return; }
    setSaving(true);
    const payload = {
      user_id: ownerUserId!,
      padrao: form.padrao.trim(),
      tipo: form.tipo,
      plano_contas_id: form.plano_contas_id || null,
      automatica: form.automatica,
    };
    const { error } = editingId
      ? await (supabase as any).from("regras_conciliacao").update(payload).eq("id", editingId)
      : await (supabase as any).from("regras_conciliacao").insert({ ...payload, uso_count: 0 });
    setSaving(false);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingId ? "Regra atualizada!" : "Regra criada!" });
    setDialogOpen(false);
    loadAll();
  };

  const handleDelete = async (id: string) => {
    await (supabase as any).from("regras_conciliacao").delete().eq("id", id);
    toast({ title: "Regra removida" });
    setRegras(prev => prev.filter(r => r.id !== id));
  };

  const handleToggleAutomatica = async (r: Regra) => {
    await (supabase as any).from("regras_conciliacao").update({ automatica: !r.automatica }).eq("id", r.id);
    setRegras(prev => prev.map(x => x.id === r.id ? { ...x, automatica: !x.automatica } : x));
  };

  const planoById = Object.fromEntries(planoContas.map(p => [p.id, p]));
  const filtered  = regras.filter(r => r.padrao.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Regras de Conciliação</h1>
          <p className="text-muted-foreground">Padrões aprendidos que categorizam e conciliam transações automaticamente</p>
        </div>
        {podeIncluir && (
          <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Nova Regra</Button>
        )}
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground bg-muted/30 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-blue-500" />
          <span>Regra <strong>Manual</strong> — categoriza automaticamente mas não concilia</span>
        </div>
        <div className="flex items-center gap-2">
          <Check className="h-4 w-4 text-green-500" />
          <span>Regra <strong>Automática</strong> — categoriza <em>e</em> já marca como conciliada na importação</span>
        </div>
      </div>

      {/* Busca */}
      <Input
        placeholder="Buscar por padrão de descrição..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Padrão de Descrição</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Categoria (Plano de Contas)</TableHead>
                <TableHead className="text-center">Usos</TableHead>
                <TableHead className="text-center">Automática</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    <Tag className="mx-auto h-8 w-8 mb-2 opacity-30" />
                    <p>Nenhuma regra criada ainda.</p>
                    <p className="text-xs mt-1">As regras são criadas automaticamente ao categorizar transações na Conciliação,<br />ou manualmente clicando em "Nova Regra".</p>
                  </TableCell>
                </TableRow>
              ) : filtered.map(r => (
                <TableRow key={r.id} className={r.automatica ? "bg-green-50/30" : ""}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {r.automatica
                        ? <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        : <Tag className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                      }
                      <span className="font-mono text-sm">"{r.padrao}"</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge style={{ backgroundColor: r.tipo === "credito" ? GREEN + "20" : r.tipo === "debito" ? RED + "20" : "#6b728020", color: r.tipo === "credito" ? GREEN : r.tipo === "debito" ? RED : "#6b7280" }}>
                      {r.tipo === "debito" ? "Débito" : r.tipo === "credito" ? "Crédito" : "Ambos"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.plano_contas_id && planoById[r.plano_contas_id]
                      ? <span>{planoById[r.plano_contas_id].codigo ? `${planoById[r.plano_contas_id].codigo} — ` : ""}{planoById[r.plano_contas_id].nome}</span>
                      : <span className="text-muted-foreground">Sem categoria</span>
                    }
                  </TableCell>
                  <TableCell className="text-center text-sm">{r.uso_count}</TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={r.automatica}
                      onCheckedChange={() => handleToggleAutomatica(r)}
                      disabled={!podeEditar}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      {podeEditar && (
                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
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
                              <AlertDialogTitle>Excluir regra?</AlertDialogTitle>
                              <AlertDialogDescription>
                                A regra <strong>"{r.padrao}"</strong> será removida. Transações já importadas não serão afetadas.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(r.id)} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={o => { if (!o) setDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingId ? "Editar Regra" : "Nova Regra"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Padrão de descrição *</Label>
              <Input
                placeholder='Ex: "PIX RECEBIDO", "FORNECEDOR ABC", "ALUGUEL"'
                value={form.padrao}
                onChange={e => setForm(p => ({ ...p, padrao: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Texto parcial que aparece na descrição da transação (não diferencia maiúsculas/minúsculas)</p>
            </div>
            <div className="space-y-2">
              <Label>Tipo de transação</Label>
              <Select value={form.tipo} onValueChange={v => setForm(p => ({ ...p, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="debito">Débito (saída)</SelectItem>
                  <SelectItem value="credito">Crédito (entrada)</SelectItem>
                  <SelectItem value="ambos">Ambos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Categoria (Plano de Contas)</Label>
              <Select value={form.plano_contas_id || "none"} onValueChange={v => setForm(p => ({ ...p, plano_contas_id: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem categoria</SelectItem>
                  {planoContas.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.codigo ? `${p.codigo} — ` : ""}{p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
              <div>
                <p className="text-sm font-medium">Conciliação automática</p>
                <p className="text-xs text-muted-foreground">Ao importar, transações com este padrão já entram como <strong>conciliadas</strong></p>
              </div>
              <Switch checked={form.automatica} onCheckedChange={v => setForm(p => ({ ...p, automatica: v }))} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? "Salvando..." : editingId ? "Salvar" : "Criar Regra"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
