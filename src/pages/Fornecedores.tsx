import { useState, useEffect, useCallback } from "react";
import { Plus, Search, Pencil, Trash2, Users } from "lucide-react";
import { ExportButton } from "@/components/ExportButton";
import { Card, CardContent } from "@/components/ui/card";
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

interface Fornecedor {
  id: string;
  user_id: string;
  nome: string;
  cnpj_cpf: string | null;
  email: string | null;
  telefone: string | null;
  categoria: string | null;
  ativo: boolean;
  created_at: string;
}

const CATEGORIAS = ["Fornecedor de Serviços", "Fornecedor de Produtos", "Prestador de Serviços", "Utility / Concessionária", "Governo / Imposto", "Outros"];

const EMPTY_FORM = { nome: "", cnpj_cpf: "", email: "", telefone: "", categoria: "", ativo: true };

export default function Fornecedores() {
  const { user, podeIncluir, podeEditar, podeExcluir, ownerUserId } = useAuth();
  const { toast } = useToast();
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from("fornecedores").select("*").order("nome");
    setFornecedores(data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome) { toast({ title: "Informe o nome do fornecedor", variant: "destructive" }); return; }
    const payload = {
      user_id: ownerUserId!,
      nome: form.nome,
      cnpj_cpf: form.cnpj_cpf || null,
      email: form.email || null,
      telefone: form.telefone || null,
      categoria: form.categoria || null,
      ativo: form.ativo,
    };
    const { error } = editingId
      ? await supabase.from("fornecedores").update(payload).eq("id", editingId)
      : await supabase.from("fornecedores").insert(payload);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingId ? "Fornecedor atualizado!" : "Fornecedor cadastrado!" });
    setForm(EMPTY_FORM); setEditingId(null); setDialogOpen(false); load();
  };

  const handleEdit = (f: Fornecedor) => {
    setEditingId(f.id);
    setForm({ nome: f.nome, cnpj_cpf: f.cnpj_cpf ?? "", email: f.email ?? "", telefone: f.telefone ?? "", categoria: f.categoria ?? "", ativo: f.ativo });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("fornecedores").delete().eq("id", id);
    if (error) { toast({ title: "Erro ao excluir", variant: "destructive" }); return; }
    toast({ title: "Fornecedor removido" }); load();
  };

  const filtered = fornecedores.filter(f =>
    f.nome.toLowerCase().includes(search.toLowerCase()) ||
    (f.cnpj_cpf ?? "").includes(search) ||
    (f.categoria ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Fornecedores</h1>
          <p className="text-muted-foreground">Cadastro de fornecedores e prestadores</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            data={filtered}
            filename="fornecedores"
            title="Fornecedores"
            columns={[
              { header: "Nome",       value: r => r.nome, width: 2 },
              { header: "CNPJ/CPF",   value: r => r.cnpj_cpf },
              { header: "E-mail",     value: r => r.email, width: 1.5 },
              { header: "Telefone",   value: r => r.telefone },
              { header: "Categoria",  value: r => r.categoria },
              { header: "Ativo",      value: r => r.ativo ? "Sim" : "Não", width: 0.5 },
            ]}
          />
          <Dialog open={dialogOpen} onOpenChange={o => { if (!o) { setEditingId(null); setForm(EMPTY_FORM); } setDialogOpen(o); }}>
          {podeIncluir && (
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Novo Fornecedor</Button>
            </DialogTrigger>
          )}
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editingId ? "Editar Fornecedor" : "Novo Fornecedor"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input placeholder="Razão social ou nome" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>CNPJ / CPF</Label>
                  <Input placeholder="00.000.000/0001-00" value={form.cnpj_cpf} onChange={e => setForm({ ...form, cnpj_cpf: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input placeholder="(00) 00000-0000" value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>E-mail</Label>
                  <Input type="email" placeholder="contato@empresa.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Categoria</Label>
                  <Select value={form.categoria || "none"} onValueChange={v => setForm({ ...form, categoria: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem categoria</SelectItem>
                      {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit" className="w-full">{editingId ? "Salvar Alterações" : "Cadastrar"}</Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome, CNPJ ou categoria..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CNPJ / CPF</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    <Users className="mx-auto h-8 w-8 mb-2 opacity-30" />
                    Nenhum fornecedor cadastrado
                  </TableCell>
                </TableRow>
              ) : filtered.map(f => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.nome}</TableCell>
                  <TableCell className="text-sm text-muted-foreground font-mono">{f.cnpj_cpf || "—"}</TableCell>
                  <TableCell>
                    <div className="text-sm">{f.email || "—"}</div>
                    {f.telefone && <div className="text-xs text-muted-foreground">{f.telefone}</div>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{f.categoria || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={f.ativo ? "default" : "secondary"}>
                      {f.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      {podeEditar && (
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(f)}>
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
                              <AlertDialogTitle>Excluir fornecedor?</AlertDialogTitle>
                              <AlertDialogDescription><strong>{f.nome}</strong> será removido permanentemente.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(f.id)} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
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
    </div>
  );
}
