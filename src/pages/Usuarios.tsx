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
import { Plus, Users, Trash2, Pencil, PackageCheck } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import { MODULES, ALL_MODULE_IDS, type ModuleId } from "@/lib/modules";

type UsuarioPerfil = Tables<"usuarios_perfil">;

const PAPEL_ROTINAS_OPTIONS = [
  { value: "nenhum",      label: "Não participa de Rotinas" },
  { value: "responsavel", label: "Responsável pela tarefa"  },
  { value: "revisor",     label: "Revisor da tarefa"        },
  { value: "ambos",       label: "Responsável e Revisor"    },
];

const EMPTY_FORM = {
  nome: "", email: "", cpf: "",
  is_admin: false,
  pode_incluir: false, pode_editar: false, pode_excluir: false,
  modulos: [] as ModuleId[],
  papel_rotinas: "nenhum",
};

export default function Usuarios() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioPerfil[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadUsuarios = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("usuarios_perfil")
      .select("*")
      .eq("escritorio_owner_id", user.id)
      .order("nome");
    setUsuarios(data || []);
  }, [user]);

  useEffect(() => { loadUsuarios(); }, [loadUsuarios]);

  const resetForm = () => setForm(EMPTY_FORM);

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "").slice(0, 11);
    value = value.replace(/(\d{3})(\d)/, "$1.$2");
    value = value.replace(/(\d{3})(\d)/, "$1.$2");
    value = value.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    setForm({ ...form, cpf: value });
  };

  const toggleModulo = (id: ModuleId) => {
    const next = form.modulos.includes(id)
      ? form.modulos.filter(m => m !== id)
      : [...form.modulos, id];
    setForm({ ...form, modulos: next });
  };

  const handleEdit = (u: UsuarioPerfil) => {
    setEditingId(u.id);
    setForm({
      nome: u.nome, email: u.email, cpf: u.cpf || "",
      is_admin: u.is_admin,
      pode_incluir: u.pode_incluir, pode_editar: u.pode_editar, pode_excluir: u.pode_excluir,
      modulos: (u.modulos ?? []) as ModuleId[],
      papel_rotinas: (u as any).papel_rotinas ?? "nenhum",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("usuarios_perfil").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Usuário removido da equipe" });
    loadUsuarios();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.email.toLowerCase().endsWith("@diretriz.cnt.br")) {
      toast({ title: "Domínio não permitido", description: "Somente e-mails @diretriz.cnt.br são permitidos.", variant: "destructive" });
      return;
    }

    const isDuplicate = usuarios.some(u => u.email.toLowerCase() === form.email.toLowerCase() && u.id !== editingId);
    if (isDuplicate) {
      toast({ title: "E-mail duplicado", description: "Este e-mail já está cadastrado na equipe.", variant: "destructive" });
      return;
    }

    const currentCpf = form.cpf.replace(/\D/g, "");
    if (currentCpf && usuarios.some(u => u.cpf?.replace(/\D/g, "") === currentCpf && u.id !== editingId)) {
      toast({ title: "CPF duplicado", description: "Este CPF já pertence a outro membro.", variant: "destructive" });
      return;
    }

    const payload = {
      escritorio_owner_id: user!.id,
      nome: form.nome.trim(),
      email: form.email.trim().toLowerCase(),
      cpf: form.cpf || null,
      is_admin: form.is_admin,
      pode_incluir: form.is_admin ? true : form.pode_incluir,
      pode_editar:  form.is_admin ? true : form.pode_editar,
      pode_excluir: form.is_admin ? true : form.pode_excluir,
      modulos: form.is_admin ? ALL_MODULE_IDS : form.modulos,
      papel_rotinas: form.papel_rotinas,
    };

    let error: { message: string } | null;
    if (editingId) {
      ({ error } = await supabase.from("usuarios_perfil").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("usuarios_perfil").insert(payload));
    }

    // Se a coluna modulos ainda não existe no banco, salva sem ela
    if (error && error.message.includes("modulos")) {
      const { modulos: _m, ...payloadSemModulos } = payload;
      if (editingId) {
        ({ error } = await supabase.from("usuarios_perfil").update(payloadSemModulos).eq("id", editingId));
      } else {
        ({ error } = await supabase.from("usuarios_perfil").insert(payloadSemModulos));
      }
      if (!error) {
        toast({ title: "Atenção", description: "Execute o SQL de migração no Supabase para habilitar o controle de módulos.", variant: "destructive" });
      }
    }

    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingId ? "Permissões atualizadas!" : "Membro adicionado à equipe!" });
    setDialogOpen(false);
    resetForm();
    loadUsuarios();
  };

  // Label helper for modules list
  const moduloLabel = (u: UsuarioPerfil) => {
    if (u.is_admin) return null; // shown as "Admin Global"
    const mods = (u.modulos ?? []) as ModuleId[];
    if (mods.length === 0) return <span className="text-muted-foreground italic text-xs">Nenhum módulo</span>;
    if (mods.length === ALL_MODULE_IDS.length) return <span className="text-xs text-green-700 font-medium">Todos os módulos</span>;
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {mods.map(id => {
          const m = MODULES.find(x => x.id === id);
          return m ? <Badge key={id} variant="outline" className="text-[10px] py-0">{m.label}</Badge> : null;
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Equipe e Permissões</h1>
          <p className="text-muted-foreground">Gerencie os membros da equipe, seus acessos e módulos disponíveis.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          if (!open) { setEditingId(null); resetForm(); }
          setDialogOpen(open);
        }}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingId(null); resetForm(); }}>
              <Plus className="mr-2 h-4 w-4" /> Novo Membro
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Permissões" : "Convidar para a Equipe"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Dados pessoais */}
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} placeholder="Fulano da Silva" required />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="usuario@diretriz.cnt.br" required />
                <p className="text-xs text-muted-foreground">Somente <strong>@diretriz.cnt.br</strong></p>
              </div>
              <div className="space-y-2">
                <Label>CPF do Colaborador</Label>
                <Input value={form.cpf} onChange={handleCpfChange} placeholder="000.000.000-00" />
              </div>

              {/* Nível de acesso */}
              <div className="border-t pt-4 space-y-3">
                <h4 className="font-semibold text-sm">Nível de Acesso</h4>

                <div className="flex items-center gap-2 bg-primary/5 p-3 rounded-lg border border-primary/20">
                  <input type="checkbox" id="is_admin" checked={form.is_admin}
                    onChange={e => setForm({...form, is_admin: e.target.checked,
                      pode_incluir: e.target.checked || form.pode_incluir,
                      pode_editar:  e.target.checked || form.pode_editar,
                      pode_excluir: e.target.checked || form.pode_excluir,
                      modulos: e.target.checked ? ALL_MODULE_IDS : form.modulos,
                    })}
                    className="h-4 w-4 cursor-pointer" />
                  <Label htmlFor="is_admin" className="font-medium cursor-pointer">Administrador Geral (acesso total)</Label>
                </div>

                {!form.is_admin && (
                  <div className="pl-4 space-y-2">
                    {[
                      { key: "pode_incluir", label: "Pode Incluir Cadastros" },
                      { key: "pode_editar",  label: "Pode Editar / Alterar" },
                      { key: "pode_excluir", label: "Pode Excluir (ação crítica)", danger: true },
                    ].map(({ key, label, danger }) => (
                      <div key={key} className="flex items-center gap-2">
                        <input type="checkbox" id={key}
                          checked={form[key as keyof typeof form] as boolean}
                          onChange={e => setForm({...form, [key]: e.target.checked})}
                          className="h-4 w-4 cursor-pointer" />
                        <Label htmlFor={key} className={`text-sm font-normal cursor-pointer ${danger ? "text-destructive" : ""}`}>
                          {label}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Módulos */}
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PackageCheck className="h-4 w-4 text-primary" />
                    <h4 className="font-semibold text-sm">Módulos Permitidos</h4>
                  </div>
                  {!form.is_admin && (
                    <button type="button" className="text-xs text-primary underline"
                      onClick={() => setForm({ ...form,
                        modulos: form.modulos.length === ALL_MODULE_IDS.length ? [] : ALL_MODULE_IDS
                      })}>
                      {form.modulos.length === ALL_MODULE_IDS.length ? "Desmarcar todos" : "Selecionar todos"}
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {MODULES.map(m => {
                    const active = form.is_admin || form.modulos.includes(m.id);
                    return (
                      <label key={m.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          active
                            ? "border-primary/40 bg-primary/5"
                            : "border-border bg-muted/20 opacity-60"
                        } ${form.is_admin ? "pointer-events-none" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          disabled={form.is_admin}
                          onChange={() => toggleModulo(m.id)}
                          className="h-4 w-4"
                        />
                        <m.icon className="h-4 w-4 text-primary shrink-0" />
                        <div>
                          <p className="text-sm font-medium">{m.label}</p>
                          <p className="text-xs text-muted-foreground">{m.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {form.is_admin && (
                  <p className="text-xs text-muted-foreground italic">Administradores têm acesso a todos os módulos automaticamente.</p>
                )}
              </div>

              {/* Papel nas Rotinas */}
              <div className="border-t pt-4 space-y-2">
                <Label className="font-semibold text-sm">Papel nas Rotinas</Label>
                <Select
                  value={form.papel_rotinas}
                  onValueChange={v => setForm({ ...form, papel_rotinas: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAPEL_ROTINAS_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Define se este colaborador pode ser atribuído como Responsável e/ou Revisor nas tarefas de Rotinas.
                </p>
              </div>

              <Button type="submit" className="w-full">
                {editingId ? "Salvar Alterações" : "Cadastrar na Equipe"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome e E-mail</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Permissões</TableHead>
                <TableHead>Módulos</TableHead>
                <TableHead>Rotinas</TableHead>
                <TableHead className="w-12 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.length > 0 ? usuarios.map(u => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium">{u.nome}</div>
                    <div className="text-sm text-muted-foreground">{u.email}</div>
                    {u.cpf && <div className="text-xs text-muted-foreground opacity-70">CPF: {u.cpf}</div>}
                  </TableCell>
                  <TableCell>
                    {u.is_admin
                      ? <span className="inline-flex items-center px-2 py-1 bg-amber-100 text-amber-700 text-xs font-semibold rounded"><Users className="mr-1 h-3 w-3" />Admin Global</span>
                      : <span className="inline-flex items-center px-2 py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded">Funcionário(a)</span>}
                  </TableCell>
                  <TableCell className="text-xs">
                    {u.is_admin ? <span className="text-muted-foreground">Total</span> : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">{u.pode_incluir ? <span className="text-green-600">✓</span> : <span className="text-red-400">✗</span>} Incluir</div>
                        <div className="flex items-center gap-1">{u.pode_editar  ? <span className="text-green-600">✓</span> : <span className="text-red-400">✗</span>} Editar</div>
                        <div className="flex items-center gap-1">{u.pode_excluir ? <span className="text-green-600">✓</span> : <span className="text-red-400">✗</span>} Excluir</div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{moduloLabel(u)}</TableCell>
                  <TableCell>
                    {(() => {
                      const papel = (u as any).papel_rotinas ?? "nenhum";
                      const opt = PAPEL_ROTINAS_OPTIONS.find(o => o.value === papel);
                      if (!opt || papel === "nenhum") return <span className="text-xs text-muted-foreground italic">—</span>;
                      return (
                        <Badge variant="outline" className="text-[10px]">
                          {opt.label}
                        </Badge>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(u)}>
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
                            <AlertDialogTitle>Remover membro?</AlertDialogTitle>
                            <AlertDialogDescription>
                              <strong>{u.nome}</strong> perderá acesso ao sistema.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(u.id)} className="bg-destructive hover:bg-destructive/90">
                              Remover
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <Users className="mx-auto h-8 w-8 mb-2 opacity-40" />
                    Nenhum membro cadastrado na equipe
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
