import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Trash2, Pencil, Building2, Users, Palette } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MODULES, type ModuleId } from "@/lib/modules";
import type { Tables } from "@/integrations/supabase/types";

type Departamento = Tables<"departamentos">;

const CORES_OPCOES = [
  { cor: "#3b82f6", nome: "Azul" },
  { cor: "#10b981", nome: "Verde" },
  { cor: "#f59e0b", nome: "Âmbar" },
  { cor: "#8b5cf6", nome: "Roxo" },
  { cor: "#ef4444", nome: "Vermelho" },
  { cor: "#06b6d4", nome: "Ciano" },
  { cor: "#ec4899", nome: "Rosa" },
  { cor: "#6366f1", nome: "Índigo" },
  { cor: "#14b8a6", nome: "Turquesa" },
  { cor: "#f97316", nome: "Laranja" },
];

const EMPTY_FORM = {
  nome: "",
  descricao: "",
  cor: "#6366f1",
  modulos_padrao: [] as string[],
};

export default function Departamentos() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [membrosCount, setMembrosCount] = useState<Record<string, number>>({});
  const [form, setForm] = useState(EMPTY_FORM);

  const loadDepartamentos = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("departamentos")
      .select("*")
      .eq("user_id", user.id)
      .order("nome");
    setDepartamentos(data || []);

    // Contar membros por departamento
    const { data: perfis } = await supabase
      .from("usuarios_perfil")
      .select("departamento_id")
      .eq("escritorio_owner_id", user.id);
    
    const counts: Record<string, number> = {};
    (perfis || []).forEach((p) => {
      if (p.departamento_id) {
        counts[p.departamento_id] = (counts[p.departamento_id] || 0) + 1;
      }
    });
    setMembrosCount(counts);
  }, [user]);

  useEffect(() => { loadDepartamentos(); }, [loadDepartamentos]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const handleEdit = (d: Departamento) => {
    setEditingId(d.id);
    setForm({
      nome: d.nome,
      descricao: d.descricao || "",
      cor: d.cor,
      modulos_padrao: (d.modulos_padrao ?? []) as string[],
    });
    setDialogOpen(true);
  };

  const toggleModulo = (id: string) => {
    setForm(p => ({
      ...p,
      modulos_padrao: p.modulos_padrao.includes(id)
        ? p.modulos_padrao.filter(m => m !== id)
        : [...p.modulos_padrao, id],
    }));
  };

  const handleDelete = async (id: string) => {
    const count = membrosCount[id] || 0;
    if (count > 0) {
      toast({
        title: "Departamento em uso",
        description: `${count} membro(s) vinculado(s). Remova o vínculo antes de excluir.`,
        variant: "destructive",
      });
      return;
    }
    const { error } = await supabase.from("departamentos").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Departamento removido" });
    loadDepartamentos();
  };

  const handleToggleAtivo = async (d: Departamento) => {
    const { error } = await supabase
      .from("departamentos")
      .update({ ativo: !d.ativo })
      .eq("id", d.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: d.ativo ? "Departamento desativado" : "Departamento ativado" });
    loadDepartamentos();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }

    const payload = {
      user_id: user!.id,
      nome: form.nome.trim(),
      descricao: form.descricao.trim() || null,
      cor: form.cor,
      modulos_padrao: form.modulos_padrao,
    };

    let error: { message: string } | null;

    if (editingId) {
      ({ error } = await supabase.from("departamentos").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("departamentos").insert(payload));
    }

    if (error) {
      const msg = error.message.includes("unique")
        ? "Já existe um departamento com este nome."
        : error.message;
      toast({ title: "Erro", description: msg, variant: "destructive" });
      return;
    }

    toast({ title: editingId ? "Departamento atualizado!" : "Departamento criado!" });
    setDialogOpen(false);
    resetForm();
    loadDepartamentos();
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Departamentos</h1>
          <p className="text-muted-foreground">
            Gerencie os departamentos do escritório e seus módulos de acesso.
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={open => { if (!open) resetForm(); setDialogOpen(open); }}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="mr-2 h-4 w-4" /> Novo Departamento
            </Button>
          </DialogTrigger>

          <DialogContent style={{ maxWidth: "min(600px, 95vw)", maxHeight: "92vh" }} className="overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Departamento" : "Novo Departamento"}</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Nome */}
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input
                  value={form.nome}
                  onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                  placeholder="Ex: Departamento Fiscal"
                  required
                />
              </div>

              {/* Descrição */}
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input
                  value={form.descricao}
                  onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
                  placeholder="Breve descrição do departamento"
                />
              </div>

              {/* Cor */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Palette className="h-4 w-4 text-muted-foreground" />
                  <Label>Cor do Badge</Label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {CORES_OPCOES.map(c => (
                    <button
                      key={c.cor}
                      type="button"
                      onClick={() => setForm(p => ({ ...p, cor: c.cor }))}
                      className={`h-8 w-8 rounded-full border-2 transition-all ${
                        form.cor === c.cor ? "border-foreground scale-110 ring-2 ring-offset-2 ring-foreground/20" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c.cor }}
                      title={c.nome}
                    />
                  ))}
                </div>
              </div>

              {/* Módulos */}
              <div className="border-t pt-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Módulos de Acesso
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Selecione quais módulos os membros deste departamento poderão acessar.
                    Deixe vazio para configurar depois.
                  </p>
                </div>

                <div className="space-y-4">
                  {MODULES.map(m => {
                    const temSelecionado = m.subModules && m.subModules.some(s => form.modulos_padrao.includes(s.id));
                    return (
                      <div key={m.id} className="border rounded-lg overflow-hidden bg-card">
                        <div className={`p-3 flex items-center justify-between border-b ${temSelecionado ? 'bg-primary/5' : 'bg-muted/10'}`}>
                          <div className="flex items-center gap-3">
                            <m.icon className="h-4 w-4 text-primary shrink-0" />
                            <div>
                              <p className="text-sm font-semibold">{m.label}</p>
                              <p className="text-[11px] text-muted-foreground">{m.description}</p>
                            </div>
                          </div>
                        </div>
                        {m.subModules && m.subModules.length > 0 && (
                          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {m.subModules.map(sub => {
                              const active = form.modulos_padrao.includes(sub.id);
                              return (
                                <label
                                  key={sub.id}
                                  className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-all ${
                                    active ? "border-primary/40 bg-primary/10" : "border-transparent hover:border-border hover:bg-muted/30"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={active}
                                    onChange={() => toggleModulo(sub.id)}
                                    className="h-4 w-4 rounded accent-primary cursor-pointer"
                                  />
                                  <span className="text-sm font-medium">{sub.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <Button type="submit" className="w-full">
                {editingId ? "Salvar Alterações" : "Criar Departamento"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabela de Departamentos */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Departamento</TableHead>
                <TableHead>Módulos</TableHead>
                <TableHead>Membros</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departamentos.length > 0 ? departamentos.map(d => {
                const mods = (d.modulos_padrao ?? []) as string[];
                const count = membrosCount[d.id] || 0;
                return (
                  <TableRow key={d.id} className={!d.ativo ? "opacity-50" : ""}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: d.cor }}
                        />
                        <div>
                          <div className="font-medium">{d.nome}</div>
                          {d.descricao && (
                            <div className="text-xs text-muted-foreground">{d.descricao}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {mods.length === 0 ? (
                        <span className="text-xs text-muted-foreground italic">Nenhum configurado</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {mods.map(id => {
                            const sub = MODULES.flatMap(m => m.subModules || []).find(s => s.id === id);
                            return sub ? (
                              <Badge key={id} variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                                {sub.label}
                              </Badge>
                            ) : null;
                          })}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{count}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => handleToggleAtivo(d)}
                        className="cursor-pointer"
                      >
                        {d.ativo ? (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-200 text-xs">
                            Ativo
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Inativo
                          </Badge>
                        )}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(d)}>
                          <Pencil className="h-4 w-4 text-muted-foreground hover:text-primary" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover departamento?</AlertDialogTitle>
                              <AlertDialogDescription>
                                <strong>{d.nome}</strong> será removido permanentemente.
                                {count > 0 && (
                                  <span className="block mt-1 text-destructive font-medium">
                                    ⚠ {count} membro(s) vinculado(s) — remova o vínculo primeiro.
                                  </span>
                                )}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(d.id)}
                                className="bg-destructive hover:bg-destructive/90"
                              >
                                Remover
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    <Building2 className="mx-auto h-8 w-8 mb-2 opacity-40" />
                    Nenhum departamento cadastrado
                    <p className="text-xs mt-1">Clique em "Novo Departamento" para começar.</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
