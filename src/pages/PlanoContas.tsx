import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type PlanoContaTipo = "receita" | "despesa" | "investimento" | "imposto";

interface PlanoConta {
  id: string;
  user_id: string;
  codigo: string;
  nome: string;
  tipo: PlanoContaTipo;
  parent_id: string | null;
  ativo: boolean;
  created_at: string;
  children?: PlanoConta[];
}

const TIPO_CONFIG: Record<PlanoContaTipo, { label: string; color: string }> = {
  receita:      { label: "Receita",      color: "#22c55e" },
  despesa:      { label: "Despesa",      color: "#ED3237" },
  investimento: { label: "Investimento", color: "#3b82f6" },
  imposto:      { label: "Imposto",      color: "#f59e0b" },
};

const EMPTY_FORM = { codigo: "", nome: "", tipo: "despesa" as PlanoContaTipo, parent_id: "" };

function buildTree(items: PlanoConta[]): PlanoConta[] {
  const map: Record<string, PlanoConta> = {};
  items.forEach(i => { map[i.id] = { ...i, children: [] }; });
  const roots: PlanoConta[] = [];
  items.forEach(i => {
    if (i.parent_id && map[i.parent_id]) map[i.parent_id].children!.push(map[i.id]);
    else roots.push(map[i.id]);
  });
  return roots;
}

function PlanoRow({ item, depth = 0, onEdit, onDelete, podeEditar, podeExcluir }: {
  item: PlanoConta; depth?: number;
  onEdit: (i: PlanoConta) => void; onDelete: (id: string) => void;
  podeEditar: boolean; podeExcluir: boolean;
}) {
  const [open, setOpen] = useState(depth === 0);
  const cfg = TIPO_CONFIG[item.tipo];
  const hasChildren = (item.children?.length ?? 0) > 0;
  return (
    <>
      <tr className="border-b hover:bg-muted/30 transition-colors">
        <td className="py-2 px-4" style={{ paddingLeft: `${16 + depth * 24}px` }}>
          <div className="flex items-center gap-2">
            {hasChildren ? (
              <button onClick={() => setOpen(!open)} className="text-muted-foreground hover:text-foreground">
                {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            ) : <span className="w-3.5" />}
            <span className="font-mono text-xs text-muted-foreground w-16">{item.codigo}</span>
            <span className="text-sm font-medium">{item.nome}</span>
          </div>
        </td>
        <td className="py-2 px-4">
          <Badge style={{ backgroundColor: cfg.color + "20", color: cfg.color, border: `1px solid ${cfg.color}30` }}>
            {cfg.label}
          </Badge>
        </td>
        <td className="py-2 px-4 text-right">
          <div className="flex items-center gap-1 justify-end">
            {podeEditar && (
              <Button variant="ghost" size="icon" onClick={() => onEdit(item)}>
                <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
              </Button>
            )}
            {podeExcluir && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon"><Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" /></Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir conta?</AlertDialogTitle>
                    <AlertDialogDescription>A conta <strong>{item.nome}</strong> será removida.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(item.id)} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </td>
      </tr>
      {open && item.children?.map(child => (
        <PlanoRow key={child.id} item={child} depth={depth + 1} onEdit={onEdit} onDelete={onDelete} podeEditar={podeEditar} podeExcluir={podeExcluir} />
      ))}
    </>
  );
}

export default function PlanoContas() {
  const { user, podeIncluir, podeEditar, podeExcluir, ownerUserId } = useAuth();
  const { toast } = useToast();
  const [contas, setContas] = useState<PlanoConta[]>([]);
  const [tree, setTree] = useState<PlanoConta[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("plano_contas").select("*").eq("user_id", ownerUserId!).order("codigo");
    const items = (data ?? []) as PlanoConta[];
    setContas(items);
    setTree(buildTree(items));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.codigo || !form.nome) { toast({ title: "Preencha código e nome", variant: "destructive" }); return; }
    const payload = {
      user_id: ownerUserId!,
      codigo: form.codigo,
      nome: form.nome,
      tipo: form.tipo,
      parent_id: form.parent_id || null,
    };
    let err;
    if (editingId) {
      const { error } = await supabase.from("plano_contas").update(payload).eq("id", editingId);
      err = error;
    } else {
      const { error } = await supabase.from("plano_contas").insert(payload);
      err = error;
    }
    if (err) { toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" }); return; }
    toast({ title: editingId ? "Conta atualizada!" : "Conta criada!" });
    setForm(EMPTY_FORM); setEditingId(null); setDialogOpen(false); load();
  };

  const handleEdit = (item: PlanoConta) => {
    setEditingId(item.id);
    setForm({ codigo: item.codigo, nome: item.nome, tipo: item.tipo, parent_id: item.parent_id ?? "" });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("plano_contas").delete().eq("id", id);
    if (error) { toast({ title: "Erro ao excluir", variant: "destructive" }); return; }
    toast({ title: "Conta removida" }); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Plano de Contas</h1>
          <p className="text-muted-foreground">Categorias para classificação de lançamentos</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={o => { if (!o) { setEditingId(null); setForm(EMPTY_FORM); } setDialogOpen(o); }}>
          {podeIncluir && (
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Nova Conta</Button>
            </DialogTrigger>
          )}
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editingId ? "Editar Conta" : "Nova Conta"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Código *</Label>
                  <Input placeholder="Ex: 3.1.01" value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Tipo *</Label>
                  <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v as PlanoContaTipo })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="receita">Receita</SelectItem>
                      <SelectItem value="despesa">Despesa</SelectItem>
                      <SelectItem value="investimento">Investimento</SelectItem>
                      <SelectItem value="imposto">Imposto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input placeholder="Nome da conta" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Conta Pai (opcional)</Label>
                <Select value={form.parent_id} onValueChange={v => setForm({ ...form, parent_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Nenhuma (conta raiz)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma (conta raiz)</SelectItem>
                    {contas.filter(c => c.id !== editingId).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.codigo} — {c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full">{editingId ? "Salvar Alterações" : "Criar Conta"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left py-2 px-4 text-sm font-medium text-muted-foreground">Conta</th>
                <th className="text-left py-2 px-4 text-sm font-medium text-muted-foreground">Tipo</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {tree.length === 0 ? (
                <tr><td colSpan={3} className="text-center py-10 text-muted-foreground text-sm">Nenhuma conta cadastrada. Crie sua primeira conta.</td></tr>
              ) : tree.map(item => (
                <PlanoRow key={item.id} item={item} onEdit={handleEdit} onDelete={handleDelete} podeEditar={podeEditar} podeExcluir={podeExcluir} />
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
