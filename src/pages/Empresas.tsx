import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Building2, Trash2, Loader2, Pencil, Download } from "lucide-react";
import { ExportButton } from "@/components/ExportButton";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import type { Tables } from "@/integrations/supabase/types";

function formatCNPJ(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function validateCNPJ(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  const calc = (d: string, weights: number[]) =>
    weights.reduce((sum, w, i) => sum + Number(d[i]) * w, 0);
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const r1 = calc(digits, w1) % 11;
  const d1 = r1 < 2 ? 0 : 11 - r1;
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const r2 = calc(digits, w2) % 11;
  const d2 = r2 < 2 ? 0 : 11 - r2;
  return Number(digits[12]) === d1 && Number(digits[13]) === d2;
}

function formatPhoneNumber(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 9);
  if (d.length <= 4) return d;
  if (d.length <= 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function parsePhone(tel: string | null): { ddd: string; numero: string } {
  if (!tel) return { ddd: "", numero: "" };
  const d = tel.replace(/\D/g, "");
  return { ddd: d.slice(0, 2), numero: d.slice(2) };
}

const UF_LIST = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const EMPTY_FORM = {
  cnpj: "",
  razao_social: "",
  municipio: "",
  uf: "",
  regime_tributario: "",
  responsavel: "",
  telefone_ddd: "",
  telefone_numero: "",
  email_responsavel: "",
  inscricao_municipal: "",
  inscricao_estadual: "",
  isento_ie: false,
};

export default function Empresas() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [empresas, setEmpresas] = useState<Tables<"empresas">[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loadingCnpj, setLoadingCnpj] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 20;

  const loadEmpresas = useCallback(async () => {
    if (!user) return;
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, count } = await supabase
      .from("empresas")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("razao_social")
      .range(from, to);
    setEmpresas(data || []);
    setTotalCount(count ?? 0);
  }, [user, page]);

  useEffect(() => { loadEmpresas(); }, [loadEmpresas]);

  const { podeIncluir: PODE_INCLUIR, podeEditar: PODE_EDITAR, podeExcluir: PODE_EXCLUIR } = useAuth();

  const fetchCnpjData = async (cnpjNumeric: string) => {
    if (cnpjNumeric.length !== 14) return;
    setLoadingCnpj(true);
    try {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjNumeric}`);
      if (!response.ok) throw new Error("CNPJ não encontrado");
      const data = await response.json();
      setForm(prev => ({
        ...prev,
        razao_social: data.razao_social || prev.razao_social,
        municipio: data.municipio || prev.municipio,
        uf: data.uf || prev.uf,
      }));
      toast({ title: "Dados empresariais encontrados!" });
    } catch {
      toast({ title: "Erro na busca do CNPJ", description: "Verifique o número e tente novamente.", variant: "destructive" });
    } finally {
      setLoadingCnpj(false);
    }
  };

  const handleEdit = (emp: Tables<"empresas">) => {
    setEditingId(emp.id);
    const { ddd, numero } = parsePhone(emp.telefone);
    setForm({
      cnpj: emp.cnpj,
      razao_social: emp.razao_social,
      municipio: emp.municipio || "",
      uf: emp.uf || "",
      regime_tributario: emp.regime_tributario || "",
      responsavel: emp.responsavel || "",
      telefone_ddd: ddd,
      telefone_numero: numero,
      email_responsavel: emp.email_responsavel || "",
      inscricao_municipal: emp.inscricao_municipal || "",
      inscricao_estadual: emp.inscricao_estadual || "",
      isento_ie: emp.inscricao_estadual === "ISENTO",
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateCNPJ(form.cnpj)) {
      toast({ title: "CNPJ inválido", description: "Informe um CNPJ válido com 14 dígitos", variant: "destructive" });
      return;
    }

    const currentCnpj = form.cnpj.replace(/\D/g, "");
    const isDuplicate = empresas.some(e => e.cnpj === currentCnpj && e.id !== editingId);
    if (isDuplicate) {
      toast({ title: "Cadastro Bloqueado: Empresa Duplicada", description: "Já existe uma empresa registrada com este CNPJ na sua base.", variant: "destructive" });
      return;
    }

    const telefone = form.telefone_ddd && form.telefone_numero
      ? `(${form.telefone_ddd}) ${formatPhoneNumber(form.telefone_numero)}`
      : null;

    const payload = {
      user_id: user!.id,
      cnpj: currentCnpj,
      razao_social: form.razao_social.trim(),
      municipio: form.municipio.trim() || null,
      uf: form.uf || null,
      regime_tributario: form.regime_tributario || null,
      responsavel: form.responsavel.trim() || null,
      telefone,
      email_responsavel: form.email_responsavel.trim() || null,
      inscricao_municipal: form.inscricao_municipal.trim() || null,
      inscricao_estadual: form.isento_ie ? "ISENTO" : form.inscricao_estadual.trim() || null,
    };

    let dsError;
    if (editingId) {
      const { error } = await supabase.from("empresas").update(payload).eq("id", editingId);
      dsError = error;
    } else {
      const { error } = await supabase.from("empresas").insert(payload);
      dsError = error;
    }

    if (dsError) {
      toast({ title: "Erro ao salvar", description: dsError.message, variant: "destructive" });
      return;
    }

    toast({ title: editingId ? "Empresa atualizada!" : "Empresa cadastrada!" });
    setForm(EMPTY_FORM);
    setEditingId(null);
    setDialogOpen(false);
    loadEmpresas();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("empresas").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Empresa removida" });
    loadEmpresas();
  };

  const filtroParam = searchParams.get("filtro");
  const filtroLabels: Record<string, string> = {
    sem_regime:    "Sem Regime Tributário",
    sem_municipio: "Sem Endereço (Mun/UF)",
    sem_telefone:  "Sem Telefone",
    sem_email:     "Sem E-mail",
  };

  const filtered = empresas.filter(e => {
    const matchSearch = e.razao_social.toLowerCase().includes(search.toLowerCase()) ||
      e.cnpj.includes(search.replace(/\D/g, ""));
    if (!matchSearch) return false;
    if (filtroParam === "sem_regime")    return !e.regime_tributario;
    if (filtroParam === "sem_municipio") return !e.municipio || !e.uf;
    if (filtroParam === "sem_telefone")  return !e.telefone;
    if (filtroParam === "sem_email")     return !e.email_responsavel;
    return true;
  });

  const handleExportCSV = () => {
    const headers = ["Razão Social", "CNPJ", "Município", "UF", "Regime", "Responsável", "Telefone"];
    const rows = filtered.map(e => [
      e.razao_social,
      formatCNPJ(e.cnpj),
      e.municipio || "",
      e.uf || "",
      e.regime_tributario || "",
      e.responsavel || "",
      e.telefone || "",
    ].join(";"));
    const csv = [headers.join(";"), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `empresas_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Empresas</h1>
          <p className="text-muted-foreground">Gerencie as empresas monitoradas</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            data={filtered}
            filename="empresas"
            title="Empresas"
            columns={[
              { header: "CNPJ",          value: r => r.cnpj, width: 1.2 },
              { header: "Razão Social",   value: r => r.razao_social, width: 2 },
              { header: "Município",      value: r => r.municipio },
              { header: "UF",            value: r => r.uf, width: 0.4 },
              { header: "Regime",        value: r => r.regime_tributario },
              { header: "Responsável",   value: r => r.responsavel },
              { header: "E-mail",        value: r => r.email_responsavel, width: 1.5 },
            ]}
          />
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            if (!open) { setEditingId(null); setForm(EMPTY_FORM); }
            setDialogOpen(open);
          }}>
            {PODE_INCLUIR ? (
              <DialogTrigger asChild>
                <Button onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}>
                  <Plus className="mr-2 h-4 w-4" /> Nova Empresa
                </Button>
              </DialogTrigger>
            ) : (
              <div />
            )}
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar Empresa" : "Cadastrar Empresa"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      CNPJ *
                      {loadingCnpj && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                    </Label>
                    <Input
                      placeholder="00.000.000/0000-00"
                      value={formatCNPJ(form.cnpj)}
                      onChange={(e) => {
                        const val = e.target.value;
                        setForm({ ...form, cnpj: val });
                        const numeric = val.replace(/\D/g, "");
                        const oldNumeric = form.cnpj.replace(/\D/g, "");
                        if (numeric.length === 14 && numeric !== oldNumeric) {
                          fetchCnpjData(numeric);
                        }
                      }}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Razão Social *</Label>
                    <Input
                      placeholder="Nome da empresa"
                      value={form.razao_social}
                      onChange={(e) => setForm({ ...form, razao_social: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Município</Label>
                    <Input
                      placeholder="Cidade"
                      value={form.municipio}
                      onChange={(e) => setForm({ ...form, municipio: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>UF</Label>
                    <Select value={form.uf} onValueChange={(v) => setForm({ ...form, uf: v })}>
                      <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                      <SelectContent>
                        {UF_LIST.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Regime Tributário</Label>
                    <Select value={form.regime_tributario} onValueChange={(v) => setForm({ ...form, regime_tributario: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="simples">Simples Nacional</SelectItem>
                        <SelectItem value="presumido">Lucro Presumido</SelectItem>
                        <SelectItem value="real">Lucro Real</SelectItem>
                        <SelectItem value="mei">MEI</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Responsável</Label>
                    <Input
                      placeholder="Nome do responsável"
                      value={form.responsavel}
                      onChange={(e) => setForm({ ...form, responsavel: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone do Responsável</Label>
                    <div className="flex gap-2">
                      <Input
                        className="w-16 text-center"
                        placeholder="DDD"
                        value={form.telefone_ddd}
                        maxLength={2}
                        onChange={(e) => {
                          const ddd = e.target.value.replace(/\D/g, "").slice(0, 2);
                          setForm({ ...form, telefone_ddd: ddd });
                        }}
                      />
                      <Input
                        placeholder="00000-0000"
                        value={formatPhoneNumber(form.telefone_numero)}
                        onChange={(e) => {
                          const num = e.target.value.replace(/\D/g, "").slice(0, 9);
                          setForm({ ...form, telefone_numero: num });
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>E-mail do Responsável</Label>
                  <Input
                    type="email"
                    placeholder="email@empresa.com.br"
                    value={form.email_responsavel}
                    onChange={(e) => setForm({ ...form, email_responsavel: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Inscrição Municipal</Label>
                  <Input
                    placeholder="Número da inscrição municipal"
                    value={form.inscricao_municipal}
                    onChange={(e) => setForm({ ...form, inscricao_municipal: e.target.value })}
                  />
                </div>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Inscrição Estadual</Label>
                    <Input
                      placeholder="Número da inscrição estadual"
                      value={form.isento_ie ? "" : form.inscricao_estadual}
                      disabled={form.isento_ie}
                      onChange={(e) => setForm({ ...form, inscricao_estadual: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="isento_ie"
                      checked={form.isento_ie}
                      onCheckedChange={(checked) =>
                        setForm({ ...form, isento_ie: !!checked, inscricao_estadual: checked ? "" : form.inscricao_estadual })
                      }
                    />
                    <label htmlFor="isento_ie" className="text-sm text-muted-foreground cursor-pointer select-none">
                      Empresa isenta de Inscrição Estadual
                    </label>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={loadingCnpj}>
                  {loadingCnpj ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {editingId ? "Salvar Alterações" : "Cadastrar"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou CNPJ..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {filtroParam && filtroLabels[filtroParam] && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700">
            <span>Filtro ativo: <strong>{filtroLabels[filtroParam]}</strong></span>
            <button className="ml-1 hover:text-amber-900 font-bold" onClick={() => setSearchParams({})}>✕</button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Município/UF</TableHead>
                <TableHead>Regime</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length > 0 ? filtered.map((emp) => (
                <TableRow key={emp.id}>
                  <TableCell className="font-medium">{emp.razao_social}</TableCell>
                  <TableCell className="font-mono text-sm">{formatCNPJ(emp.cnpj)}</TableCell>
                  <TableCell>{[emp.municipio, emp.uf].filter(Boolean).join("/") || "—"}</TableCell>
                  <TableCell>
                    {emp.regime_tributario ? (
                      <Badge variant="secondary" className="capitalize">{emp.regime_tributario}</Badge>
                    ) : "—"}
                  </TableCell>
                  <TableCell>{emp.responsavel || "—"}</TableCell>
                  <TableCell className="tabular-nums text-sm">{emp.telefone || "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      {PODE_EDITAR && (
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(emp)}>
                          <Pencil className="h-4 w-4 text-muted-foreground hover:text-primary" />
                        </Button>
                      )}
                      {PODE_EXCLUIR && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir empresa?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação não pode ser desfeita. A empresa <strong>{emp.razao_social}</strong> e todas as suas certidões serão removidas permanentemente.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(emp.id)} className="bg-destructive hover:bg-destructive/90">
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <Building2 className="mx-auto h-8 w-8 mb-2 opacity-40" />
                    Nenhuma empresa cadastrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Exibindo {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} de {totalCount} empresas
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= totalCount} onClick={() => setPage(p => p + 1)}>
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
