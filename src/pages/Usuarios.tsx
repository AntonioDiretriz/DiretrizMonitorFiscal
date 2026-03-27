import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Users, Trash2, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type UsuarioPerfil = Tables<"usuarios_perfil">;

export default function Usuarios() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioPerfil[]>([]);

  const [form, setForm] = useState({
    nome: "", email: "", cpf: "",
    is_admin: false, pode_incluir: false, pode_editar: false, pode_excluir: false,
  });

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

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "");
    if (value.length > 11) value = value.slice(0, 11);
    value = value.replace(/(\d{3})(\d)/, "$1.$2");
    value = value.replace(/(\d{3})(\d)/, "$1.$2");
    value = value.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    setForm({ ...form, cpf: value });
  };

  const handleEdit = (u: UsuarioPerfil) => {
    setEditingId(u.id);
    setForm({
      nome: u.nome, email: u.email, cpf: u.cpf || "",
      is_admin: u.is_admin, pode_incluir: u.pode_incluir,
      pode_editar: u.pode_editar, pode_excluir: u.pode_excluir,
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
      toast({ title: "Domínio não permitido", description: "Somente e-mails com domínio @diretriz.cnt.br podem ser cadastrados.", variant: "destructive" });
      return;
    }

    const isDuplicate = usuarios.some(u => u.email.toLowerCase() === form.email.toLowerCase() && u.id !== editingId);
    if (isDuplicate) {
      toast({ title: "Cadastro Bloqueado: E-mail Duplicado", description: "Um usuário com este e-mail já está registrado em sua equipe.", variant: "destructive" });
      return;
    }

    const currentCpf = form.cpf.replace(/\D/g, "");
    const isDuplicateCpf = usuarios.some(u => u.cpf?.replace(/\D/g, "") === currentCpf && u.id !== editingId);
    if (isDuplicateCpf && currentCpf.length > 0) {
      toast({ title: "Cadastro Bloqueado: CPF Duplicado", description: "O CPF informado já pertence a outro usuário cadastrado.", variant: "destructive" });
      return;
    }

    const payload = {
      escritorio_owner_id: user!.id,
      nome: form.nome.trim(),
      email: form.email.trim().toLowerCase(),
      cpf: form.cpf || null,
      is_admin: form.is_admin,
      pode_incluir: form.is_admin ? true : form.pode_incluir,
      pode_editar: form.is_admin ? true : form.pode_editar,
      pode_excluir: form.is_admin ? true : form.pode_excluir,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from("usuarios_perfil").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("usuarios_perfil").insert(payload));
    }

    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingId ? "Permissões atualizadas!" : "Membro adicionado à equipe!" });
    setDialogOpen(false);
    loadUsuarios();
  };

  const resetForm = () => setForm({ nome: "", email: "", cpf: "", is_admin: false, pode_incluir: false, pode_editar: false, pode_excluir: false });

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Equipe e Permissões</h1>
          <p className="text-muted-foreground">Cadastre os usuários e gerencie o nível de acesso ao Monitor Fiscal.</p>
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
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Permissões do Usuário" : "Convidar para a Equipe"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} placeholder="Fulano da Silva" required />
              </div>
              <div className="space-y-2">
                <Label>E-mail de acesso e Contato</Label>
                <Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="usuario@diretriz.cnt.br" required />
                <p className="text-xs text-muted-foreground">Somente e-mails <strong>@diretriz.cnt.br</strong> são permitidos.</p>
              </div>
              <div className="space-y-2">
                <Label>CPF do Colaborador</Label>
                <Input value={form.cpf} onChange={handleCpfChange} placeholder="000.000.000-00" />
              </div>

              <div className="pt-4 pb-2 border-t mt-4">
                <h4 className="font-semibold text-sm mb-3">Nível de Acesso da Equipe</h4>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2 bg-primary/5 p-3 rounded-md border border-primary/20">
                    <input type="checkbox" id="is_admin" checked={form.is_admin} onChange={(e) => {
                      const checked = e.target.checked;
                      setForm({...form, is_admin: checked, pode_incluir: checked ? true : form.pode_incluir, pode_editar: checked ? true : form.pode_editar, pode_excluir: checked ? true : form.pode_excluir});
                    }} className="h-4 w-4 rounded border-gray-300 text-primary cursor-pointer" />
                    <Label htmlFor="is_admin" className="font-medium cursor-pointer">É Administrador Geral?</Label>
                  </div>

                  <div className="pl-6 space-y-4 mt-4 opacity-95">
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" id="p_incluir" checked={form.pode_incluir} disabled={form.is_admin} onChange={e => setForm({...form, pode_incluir: e.target.checked})} className="h-4 w-4 cursor-pointer" />
                      <Label htmlFor="p_incluir" className={`text-sm font-normal ${!form.is_admin ? 'cursor-pointer' : 'opacity-50'}`}>Pode <b>Incluir</b> Cadastro</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" id="p_editar" checked={form.pode_editar} disabled={form.is_admin} onChange={e => setForm({...form, pode_editar: e.target.checked})} className="h-4 w-4 cursor-pointer" />
                      <Label htmlFor="p_editar" className={`text-sm font-normal ${!form.is_admin ? 'cursor-pointer' : 'opacity-50'}`}>Pode <b>Editar/Alterar</b> Cadastros</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" id="p_excluir" checked={form.pode_excluir} disabled={form.is_admin} onChange={e => setForm({...form, pode_excluir: e.target.checked})} className="h-4 w-4 text-destructive focus:ring-destructive cursor-pointer" />
                      <Label htmlFor="p_excluir" className={`text-sm font-medium ${!form.is_admin ? 'cursor-pointer text-destructive' : 'opacity-50 text-destructive'}`}>Pode <b>excluir/cancelar</b> empresa (Ação crítica)</Label>
                    </div>
                  </div>
                </div>
              </div>

              <Button type="submit" className="w-full mt-2">
                {editingId ? "Atualizar Perfil" : "Cadastrar na Equipe"}
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
                <TableHead>Permissões Específicas</TableHead>
                <TableHead className="w-12 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.length > 0 ? usuarios.map(u => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">{u.nome}</div>
                    <div className="text-sm text-muted-foreground">{u.email}</div>
                    {u.cpf && <div className="text-xs text-muted-foreground mt-0.5 opacity-70">CPF: {u.cpf}</div>}
                  </TableCell>
                  <TableCell>
                    {u.is_admin
                      ? <span className="inline-flex items-center px-2 py-1 bg-amber-100 text-amber-700 text-xs font-semibold rounded"><Users className="mr-1 h-3 w-3" /> Admin Global</span>
                      : <span className="inline-flex items-center px-2 py-1 bg-slate-100 text-slate-700 text-xs font-semibold rounded">Funcionário(a)</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.is_admin ? "Total (Pode tudo)" : (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-1">{u.pode_incluir ? <span className="text-green-600">✓</span> : <span className="text-red-500">✗</span>} Lançar nova</div>
                        <div className="flex items-center gap-1">{u.pode_editar ? <span className="text-green-600">✓</span> : <span className="text-red-500">✗</span>} Alterar atual</div>
                        <div className="flex items-center gap-1">{u.pode_excluir ? <span className="text-green-600">✓</span> : <span className="text-red-500">✗</span>} Deletar</div>
                      </div>
                    )}
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
                              <strong>{u.nome}</strong> será removido da equipe e perderá acesso ao sistema.
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
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
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
