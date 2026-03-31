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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Users, Trash2, Pencil, KeyRound, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import { MODULES, ALL_MODULE_IDS, type ModuleId } from "@/lib/modules";

type UsuarioPerfil = Tables<"usuarios_perfil">;

const PAPEL_ROTINAS_OPTIONS = [
  { value: "nenhum",      label: "Não participa" },
  { value: "responsavel", label: "Responsável"   },
  { value: "revisor",     label: "Revisor"       },
  { value: "ambos",       label: "Resp. e Revisor" },
];

const EMPTY_FORM = {
  nome: "", email: "", cpf: "",
  senha: "", confirmar_senha: "",
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
  const [showSenha, setShowSenha] = useState(false);
  const [activeTab, setActiveTab] = useState("dados");

  // Módulos visíveis como abas = admin → todos; senão → somente os selecionados
  const visibleModuleTabs = form.is_admin
    ? MODULES
    : MODULES.filter(m => form.modulos.includes(m.id));

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

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setActiveTab("dados");
    setShowSenha(false);
  };

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value.replace(/\D/g, "").slice(0, 11);
    v = v.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    setForm(p => ({ ...p, cpf: v }));
  };

  const toggleModulo = (id: ModuleId) => {
    setForm(p => {
      const removing = p.modulos.includes(id);
      const newModulos = removing ? p.modulos.filter(m => m !== id) : [...p.modulos, id];
      return { ...p, modulos: newModulos };
    });
    // Se estava na aba deste módulo e ele foi desmarcado, volta para "acesso"
    if (activeTab === id && form.modulos.includes(id)) {
      setActiveTab("acesso");
    }
  };

  const handleEdit = (u: UsuarioPerfil) => {
    setEditingId(u.id);
    setForm({
      nome: u.nome, email: u.email, cpf: u.cpf || "",
      senha: "", confirmar_senha: "",
      is_admin: u.is_admin,
      pode_incluir: u.pode_incluir, pode_editar: u.pode_editar, pode_excluir: u.pode_excluir,
      modulos: (u.modulos ?? []) as ModuleId[],
      papel_rotinas: (u as any).papel_rotinas ?? "nenhum",
    });
    setActiveTab("dados");
    setDialogOpen(true);
  };

  const handleDelete = async (id: string, authUserId?: string | null) => {
    if (authUserId) {
      await supabase.functions.invoke("manage-team-member", {
        body: { action: "delete", member_auth_id: authUserId },
      });
    }
    const { error } = await supabase.from("usuarios_perfil").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Usuário removido da equipe" });
    loadUsuarios();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.email.toLowerCase().endsWith("@diretriz.cnt.br")) {
      setActiveTab("dados");
      toast({ title: "Domínio não permitido", description: "Somente @diretriz.cnt.br", variant: "destructive" });
      return;
    }
    if (usuarios.some(u => u.email.toLowerCase() === form.email.toLowerCase() && u.id !== editingId)) {
      setActiveTab("dados");
      toast({ title: "E-mail duplicado", variant: "destructive" });
      return;
    }
    const cpfDigits = form.cpf.replace(/\D/g, "");
    if (cpfDigits && usuarios.some(u => u.cpf?.replace(/\D/g, "") === cpfDigits && u.id !== editingId)) {
      setActiveTab("dados");
      toast({ title: "CPF duplicado", variant: "destructive" });
      return;
    }
    if (!editingId && !form.senha) {
      setActiveTab("dados");
      toast({ title: "Senha obrigatória", variant: "destructive" });
      return;
    }
    if (form.senha && form.senha.length < 6) {
      setActiveTab("dados");
      toast({ title: "Senha muito curta", description: "Mínimo 6 caracteres.", variant: "destructive" });
      return;
    }
    if (form.senha && form.senha !== form.confirmar_senha) {
      setActiveTab("dados");
      toast({ title: "Senhas não conferem", variant: "destructive" });
      return;
    }

    const payload = {
      escritorio_owner_id: user!.id,
      nome:         form.nome.trim(),
      email:        form.email.trim().toLowerCase(),
      cpf:          form.cpf || null,
      is_admin:     form.is_admin,
      pode_incluir: form.is_admin ? true : form.pode_incluir,
      pode_editar:  form.is_admin ? true : form.pode_editar,
      pode_excluir: form.is_admin ? true : form.pode_excluir,
      modulos:      form.is_admin ? ALL_MODULE_IDS : form.modulos,
      papel_rotinas: form.papel_rotinas,
    };

    let error: { message: string } | null;

    const tryFallback = async (op: "insert" | "update") => {
      const { modulos: _m, papel_rotinas: _p, ...base } = payload;
      const fb = error!.message.includes("modulos") ? base : { ...base, modulos: payload.modulos };
      if (op === "update") {
        ({ error } = await supabase.from("usuarios_perfil").update(fb).eq("id", editingId!));
      } else {
        ({ error } = await supabase.from("usuarios_perfil").insert(fb));
      }
    };

    if (editingId) {
      ({ error } = await supabase.from("usuarios_perfil").update(payload).eq("id", editingId));
      if (error?.message && (error.message.includes("modulos") || error.message.includes("papel_rotinas"))) await tryFallback("update");
      if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }

      if (form.senha) {
        const authUserId = (usuarios.find(u => u.id === editingId) as any)?.user_id;
        if (authUserId) {
          const { error: fnErr } = await supabase.functions.invoke("manage-team-member", {
            body: { action: "update_password", member_auth_id: authUserId, password: form.senha },
          });
          if (fnErr) toast({ title: "Perfil salvo, mas erro ao alterar senha", description: fnErr.message, variant: "destructive" });
          else toast({ title: "Permissões e senha atualizadas!" });
        } else {
          toast({ title: "Permissões atualizadas!" });
        }
      } else {
        toast({ title: "Permissões atualizadas!" });
      }
    } else {
      const { data: created, error: insertErr } = await supabase.from("usuarios_perfil").insert(payload).select("id").single();
      error = insertErr;
      if (error?.message && (error.message.includes("modulos") || error.message.includes("papel_rotinas"))) await tryFallback("insert");
      if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }

      const { error: fnErr } = await supabase.functions.invoke("manage-team-member", {
        body: { action: "create", perfil_id: created?.id, email: payload.email, password: form.senha, nome: payload.nome },
      });
      if (fnErr) toast({ title: "Perfil criado, mas erro ao criar acesso", description: fnErr.message, variant: "destructive" });
      else toast({ title: "Membro adicionado à equipe!" });
    }

    setDialogOpen(false);
    resetForm();
    loadUsuarios();
  };

  const moduloLabel = (u: UsuarioPerfil) => {
    if (u.is_admin) return null;
    const mods = (u.modulos ?? []) as ModuleId[];
    if (mods.length === 0) return <span className="text-muted-foreground italic text-xs">Nenhum</span>;
    if (mods.length === ALL_MODULE_IDS.length) return <span className="text-xs text-green-700 font-medium">Todos</span>;
    return (
      <div className="flex flex-wrap gap-1">
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

        <Dialog open={dialogOpen} onOpenChange={open => { if (!open) { setEditingId(null); resetForm(); } setDialogOpen(open); }}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingId(null); resetForm(); }}>
              <Plus className="mr-2 h-4 w-4" /> Novo Membro
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Membro" : "Cadastrar na Equipe"}</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* ── Tabs: Dados | Acesso | [módulo por módulo selecionado] ── */}
              <Tabs value={activeTab} onValueChange={setActiveTab}>

                {/* TabsList scrollável horizontalmente */}
                <div className="overflow-x-auto pb-1">
                  <TabsList className="inline-flex w-max gap-0 h-9">
                    <TabsTrigger value="dados" className="text-xs px-3">Dados</TabsTrigger>
                    <TabsTrigger value="acesso" className="text-xs px-3 flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" />Acesso
                    </TabsTrigger>
                    {/* Aba por módulo — aparece somente se o módulo estiver selecionado (ou se for admin) */}
                    {visibleModuleTabs.map(m => (
                      <TabsTrigger key={m.id} value={m.id} className="text-xs px-3 flex items-center gap-1">
                        <m.icon className="h-3 w-3" />
                        {m.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>

                {/* ── Aba: Dados ── */}
                <TabsContent value="dados" className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label>Nome *</Label>
                    <Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Fulano da Silva" required />
                  </div>
                  <div className="space-y-2">
                    <Label>E-mail *</Label>
                    <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="usuario@diretriz.cnt.br" required />
                    <p className="text-xs text-muted-foreground">Somente <strong>@diretriz.cnt.br</strong></p>
                  </div>
                  <div className="space-y-2">
                    <Label>CPF</Label>
                    <Input value={form.cpf} onChange={handleCpfChange} placeholder="000.000.000-00" />
                  </div>

                  <div className="border-t pt-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-primary" />
                      <h4 className="font-semibold text-sm">{editingId ? "Alterar Senha (opcional)" : "Senha de Acesso *"}</h4>
                    </div>
                    {editingId && <p className="text-xs text-muted-foreground">Deixe em branco para manter a senha atual.</p>}
                    <div className="space-y-2">
                      <Label>{editingId ? "Nova Senha" : "Senha *"}</Label>
                      <div className="relative">
                        <Input
                          type={showSenha ? "text" : "password"}
                          value={form.senha}
                          onChange={e => setForm(p => ({ ...p, senha: e.target.value }))}
                          placeholder="Mínimo 6 caracteres"
                          required={!editingId}
                          className="pr-10"
                        />
                        <button type="button" tabIndex={-1}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setShowSenha(s => !s)}>
                          {showSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    {form.senha && (
                      <div className="space-y-2">
                        <Label>Confirmar Senha *</Label>
                        <Input
                          type={showSenha ? "text" : "password"}
                          value={form.confirmar_senha}
                          onChange={e => setForm(p => ({ ...p, confirmar_senha: e.target.value }))}
                          placeholder="Repita a senha"
                          required
                        />
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* ── Aba: Acesso ── */}
                <TabsContent value="acesso" className="space-y-4 pt-2">
                  {/* Nível de acesso */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nível de acesso</p>
                    <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${form.is_admin ? "border-amber-400 bg-amber-50" : "border-border bg-muted/10"}`}>
                      <input type="checkbox" checked={form.is_admin}
                        onChange={e => setForm(p => ({
                          ...p, is_admin: e.target.checked,
                          pode_incluir: e.target.checked || p.pode_incluir,
                          pode_editar:  e.target.checked || p.pode_editar,
                          pode_excluir: e.target.checked || p.pode_excluir,
                          modulos:      e.target.checked ? ALL_MODULE_IDS : p.modulos,
                        }))}
                        className="h-4 w-4 cursor-pointer" />
                      <div>
                        <p className="font-semibold text-sm">Administrador Geral</p>
                        <p className="text-xs text-muted-foreground">Acesso total — todas as abas de módulos ficam disponíveis</p>
                      </div>
                    </label>

                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { key: "pode_incluir", label: "Incluir", desc: "Criar registros" },
                        { key: "pode_editar",  label: "Editar",  desc: "Alterar registros" },
                        { key: "pode_excluir", label: "Excluir", desc: "Remover registros", danger: true },
                      ].map(({ key, label, desc, danger }) => (
                        <label key={key}
                          className={`flex flex-col gap-1 p-3 rounded-lg border cursor-pointer transition-colors text-center ${
                            form.is_admin || form[key as keyof typeof form]
                              ? "border-primary/40 bg-primary/5"
                              : "border-border bg-muted/10 opacity-60"
                          } ${form.is_admin ? "pointer-events-none" : ""}`}
                        >
                          <input type="checkbox"
                            checked={form.is_admin || form[key as keyof typeof form] as boolean}
                            disabled={form.is_admin}
                            onChange={e => setForm(p => ({ ...p, [key]: e.target.checked }))}
                            className="mx-auto h-4 w-4" />
                          <p className={`text-xs font-semibold ${danger && !form.is_admin ? "text-destructive" : ""}`}>{label}</p>
                          <p className="text-[10px] text-muted-foreground">{desc}</p>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Seleção de módulos — define quais abas aparecem */}
                  <div className="border-t pt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Módulos disponíveis
                        <span className="ml-1 font-normal normal-case">(cada módulo selecionado vira uma aba)</span>
                      </p>
                      {!form.is_admin && (
                        <button type="button" className="text-xs text-primary underline shrink-0"
                          onClick={() => setForm(p => ({ ...p, modulos: p.modulos.length === ALL_MODULE_IDS.length ? [] : ALL_MODULE_IDS }))}>
                          {form.modulos.length === ALL_MODULE_IDS.length ? "Desmarcar todos" : "Selecionar todos"}
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      {MODULES.map(m => {
                        const active = form.is_admin || form.modulos.includes(m.id);
                        return (
                          <label key={m.id}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                              active ? "border-primary/40 bg-primary/5" : "border-border bg-muted/10 opacity-60"
                            } ${form.is_admin ? "pointer-events-none" : ""}`}
                          >
                            <input type="checkbox" checked={active} disabled={form.is_admin}
                              onChange={() => toggleModulo(m.id)} className="h-4 w-4" />
                            <m.icon className="h-4 w-4 text-primary shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{m.label}</p>
                              <p className="text-xs text-muted-foreground truncate">{m.description}</p>
                            </div>
                            {active && (
                              <button type="button"
                                className="text-[10px] text-primary underline shrink-0"
                                onClick={e => { e.preventDefault(); setActiveTab(m.id); }}>
                                Configurar →
                              </button>
                            )}
                          </label>
                        );
                      })}
                    </div>

                    {form.is_admin && (
                      <p className="text-xs text-muted-foreground italic">Administradores têm acesso a todos os módulos.</p>
                    )}
                  </div>
                </TabsContent>

                {/* ── Aba por módulo (geradas dinamicamente) ── */}
                {MODULES.map(m => (
                  <TabsContent key={m.id} value={m.id} className="space-y-4 pt-2">
                    {/* Header do módulo */}
                    <div className="flex items-center gap-3 p-4 rounded-lg border bg-primary/5 border-primary/20">
                      <div className="p-2 rounded-md bg-primary/10">
                        <m.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold">{m.label}</p>
                        <p className="text-xs text-muted-foreground">{m.description}</p>
                      </div>
                      <Badge variant="secondary" className="ml-auto text-xs text-green-700 bg-green-100">
                        Habilitado
                      </Badge>
                    </div>

                    {/* Permissões específicas do módulo (herda as gerais por padrão) */}
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Este módulo respeita as permissões definidas na aba <strong>Acesso</strong> (Incluir / Editar / Excluir).
                      </p>
                    </div>

                    {/* Configurações específicas por módulo */}
                    {m.id === "rotinas" && (
                      <div className="border-t pt-4 space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Papel nas tarefas de Rotinas</p>
                        <div className="grid grid-cols-1 gap-2">
                          {PAPEL_ROTINAS_OPTIONS.map(o => {
                            const selected = form.papel_rotinas === o.value;
                            const descs: Record<string, string> = {
                              nenhum:      "Não aparece na seleção de responsável/revisor",
                              responsavel: "Pode ser atribuído como Responsável pela execução",
                              revisor:     "Pode ser atribuído como Revisor antes do envio",
                              ambos:       "Pode ser Responsável ou Revisor conforme a tarefa",
                            };
                            return (
                              <label key={o.value}
                                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                  selected ? "border-primary/40 bg-primary/5" : "border-border bg-muted/10 opacity-70"
                                }`}
                              >
                                <input type="radio" name="papel_rotinas" value={o.value}
                                  checked={selected}
                                  onChange={() => setForm(p => ({ ...p, papel_rotinas: o.value }))}
                                  className="h-4 w-4 cursor-pointer" />
                                <div>
                                  <p className="text-sm font-medium">{o.label}</p>
                                  <p className="text-xs text-muted-foreground">{descs[o.value]}</p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {m.id === "financeiro" && (
                      <div className="border-t pt-4">
                        <p className="text-xs text-muted-foreground bg-muted/30 rounded p-3">
                          Acesso ao módulo Financeiro: contas a pagar, conciliação bancária e integrações com o Finance AI.
                        </p>
                      </div>
                    )}

                    {m.id === "certidoes" && (
                      <div className="border-t pt-4">
                        <p className="text-xs text-muted-foreground bg-muted/30 rounded p-3">
                          Acesso ao monitoramento de certidões fiscais (FGTS, INSS, Receita Federal, etc.) de todas as empresas.
                        </p>
                      </div>
                    )}

                    {m.id === "certificados" && (
                      <div className="border-t pt-4">
                        <p className="text-xs text-muted-foreground bg-muted/30 rounded p-3">
                          Acesso ao controle de vencimento de certificados digitais A1 e A3.
                        </p>
                      </div>
                    )}

                    {m.id === "caixas" && (
                      <div className="border-t pt-4">
                        <p className="text-xs text-muted-foreground bg-muted/30 rounded p-3">
                          Acesso à gestão de contratos de caixas postais eletrônicas (e-CAC, JUCERJA, etc.).
                        </p>
                      </div>
                    )}
                  </TabsContent>
                ))}
              </Tabs>

              <Button type="submit" className="w-full">
                {editingId ? "Salvar Alterações" : "Cadastrar na Equipe"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabela */}
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
                      <div className="space-y-0.5">
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
                      return <Badge variant="outline" className="text-[10px]">{opt.label}</Badge>;
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
                            <AlertDialogAction onClick={() => handleDelete(u.id, (u as any).user_id)} className="bg-destructive hover:bg-destructive/90">
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
