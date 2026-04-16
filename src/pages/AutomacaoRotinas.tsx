import { useState, useEffect } from "react";
import { Plus, Trash2, FolderOpen, Bot, CheckCircle, FileText, Info, AlertCircle, Link2, X, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const NAVY = "#10143D";

interface AutoConfig {
  id: string;
  tipo_rotina: string;
  pasta_modelo: string;
  extensoes: string[];
  auto_concluir: boolean;
  ativo: boolean;
}

const TIPOS_SUGERIDOS = [
  { value: "pgdas",     label: "PGDAS-D (Simples Nacional)" },
  { value: "das",       label: "DAS (Guia de Pagamento)"    },
  { value: "fgts",      label: "FGTS / DARF FGTS"          },
  { value: "inss",      label: "INSS / GPS"                 },
  { value: "pis",       label: "PIS/COFINS"                 },
  { value: "irpj",      label: "IRPJ / CSLL"                },
  { value: "iss",       label: "ISS Municipal"              },
  { value: "dctf",      label: "DCTF"                       },
  { value: "ecf",       label: "ECF Anual"                  },
  { value: "ecd",       label: "ECD Anual"                  },
  { value: "outro",     label: "Outro"                      },
];

function pastaPadrao(tipo: string) {
  return `${tipo}/{cnpj}/{competencia}/`;
}

export default function AutomacaoRotinas() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [configs, setConfigs] = useState<AutoConfig[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [pendentes, setPendentes] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploadingInbox, setUploadingInbox] = useState(false);
  const [form, setForm] = useState({
    tipo_rotina: "", pasta_modelo: "", extensoes: "pdf", auto_concluir: true, ativo: true,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!user) return;
    const db = supabase as any;
    const [{ data: cfgs }, { data: lg }, { data: pend }] = await Promise.all([
      db.from("rotina_automacao_config").select("*").order("tipo_rotina"),
      db.from("rotina_automacao_log").select("*").order("created_at", { ascending: false }).limit(30),
      db.from("documentos_pendentes").select("*").eq("status", "pendente").order("created_at", { ascending: false }),
    ]);
    setConfigs(cfgs ?? []);
    setLogs(lg ?? []);
    setPendentes(pend ?? []);
  };

  useEffect(() => { load(); }, [user]);

  const handleInboxUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingInbox(true);
    try {
      const path = `inbox/${user.id}/${Date.now()}_${file.name}`;
      const { error: upErr } = await (supabase as any).storage.from("obrigacoes-docs").upload(path, file);
      if (upErr) throw upErr;
      const { data: { publicUrl } } = (supabase as any).storage.from("obrigacoes-docs").getPublicUrl(path);
      // Chama a edge function para processar
      await fetch(`${(supabase as any).supabaseUrl}/functions/v1/processar-arquivo-rotina`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${(await (supabase as any).auth.getSession()).data.session?.access_token}` },
        body: JSON.stringify({ arquivo_path: path, arquivo_url: publicUrl, user_id: user.id }),
      });
      toast({ title: "Arquivo enviado!", description: "O robô está processando. Atualize a página em instantes." });
      setTimeout(() => load(), 3000);
    } catch (err: any) {
      toast({ title: "Erro no upload", description: err.message, variant: "destructive" });
    } finally {
      setUploadingInbox(false);
      e.target.value = "";
    }
  };

  const ignorarPendente = async (id: string) => {
    await (supabase as any).from("documentos_pendentes").update({ status: "ignorado" }).eq("id", id);
    setPendentes(p => p.filter(d => d.id !== id));
  };

  const openNew = () => {
    setEditingId(null);
    setForm({ tipo_rotina: "", pasta_modelo: "", extensoes: "pdf", auto_concluir: true, ativo: true });
    setDialogOpen(true);
  };

  const openEdit = (c: AutoConfig) => {
    setEditingId(c.id);
    setForm({
      tipo_rotina:   c.tipo_rotina,
      pasta_modelo:  c.pasta_modelo,
      extensoes:     c.extensoes.join(", "),
      auto_concluir: c.auto_concluir,
      ativo:         c.ativo,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const db = supabase as any;
    const payload = {
      user_id:       user.id,
      tipo_rotina:   form.tipo_rotina.toLowerCase().trim(),
      pasta_modelo:  form.pasta_modelo || pastaPadrao(form.tipo_rotina),
      extensoes:     form.extensoes.split(",").map(s => s.trim().toLowerCase()).filter(Boolean),
      auto_concluir: form.auto_concluir,
      ativo:         form.ativo,
    };
    const { error } = editingId
      ? await db.from("rotina_automacao_config").update(payload).eq("id", editingId)
      : await db.from("rotina_automacao_config").insert(payload);
    setLoading(false);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingId ? "Configuração atualizada!" : "Automação criada!" });
    setDialogOpen(false);
    load();
  };

  const handleDelete = async (id: string) => {
    const db = supabase as any;
    await db.from("rotina_automacao_config").delete().eq("id", id);
    load();
  };

  const handleToggle = async (c: AutoConfig) => {
    const db = supabase as any;
    await db.from("rotina_automacao_config").update({ ativo: !c.ativo }).eq("id", c.id);
    load();
  };

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: NAVY }}>
            <Bot className="h-6 w-6" />
            Automação de Rotinas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            O robô lê o PDF, identifica a obrigação pelo CNPJ e palavras-chave, e baixa automaticamente.
          </p>
        </div>
        <div className="flex gap-2">
          {/* Upload Inbox */}
          <label className="cursor-pointer">
            <input type="file" accept=".pdf,.xml,.xlsx" className="hidden" onChange={handleInboxUpload} disabled={uploadingInbox} />
            <span
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border border-dashed border-gray-400 hover:border-gray-600 text-gray-600 hover:bg-gray-50"
            >
              <Upload className="h-4 w-4" />
              {uploadingInbox ? "Enviando..." : "Enviar documento"}
            </span>
          </label>
          <Button onClick={openNew} style={{ backgroundColor: NAVY }} className="text-white">
            <Plus className="h-4 w-4 mr-2" /> Nova Automação
          </Button>
        </div>
      </div>

      {/* Documentos Pendentes */}
      {pendentes.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700">
              <AlertCircle className="h-4 w-4" />
              Documentos Pendentes — Baixa Manual Necessária
              <Badge className="bg-amber-100 text-amber-700 border-amber-300">{pendentes.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>CNPJ Detectado</TableHead>
                  <TableHead>Competência</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendentes.map(d => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-mono">{d.arquivo_nome ?? d.arquivo_path?.split("/").pop()}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{d.cnpj_detectado ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {d.competencia_detectada ? new Date(d.competencia_detectada).toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" }) : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{d.tipo_detectado ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(d.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-red-500"
                        onClick={() => ignorarPendente(d.id)} title="Ignorar">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Como funciona */}
      <Card className="border-blue-200 bg-blue-50/60">
        <CardContent className="p-4 space-y-2">
          <p className="text-sm font-semibold text-blue-800 flex items-center gap-2">
            <Info className="h-4 w-4" /> Como funciona
          </p>
          <ol className="text-xs text-blue-700 space-y-1 list-decimal pl-4">
            <li>Configure uma automação para cada tipo de obrigação (ex: PGDAS, DAS)</li>
            <li>O sistema cria a pasta no Storage com o padrão: <code className="bg-blue-100 px-1 rounded">tipo/cnpj_empresa/yyyymm/</code></li>
            <li>O funcionário faz upload do comprovante PDF pela aba <strong>Evidências</strong> da rotina</li>
            <li>O robô detecta o arquivo, anexa como evidência e marca a rotina como <strong>Concluída</strong> automaticamente</li>
          </ol>
        </CardContent>
      </Card>

      {/* Tabela de configurações */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base" style={{ color: NAVY }}>Automações Configuradas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {configs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Nenhuma automação configurada. Clique em "+ Nova Automação" para começar.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo de Obrigação</TableHead>
                  <TableHead>Pasta Modelo</TableHead>
                  <TableHead>Extensões</TableHead>
                  <TableHead>Auto-concluir</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map(c => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/30" onClick={() => openEdit(c)}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4 text-amber-500" />
                        {TIPOS_SUGERIDOS.find(t => t.value === c.tipo_rotina)?.label ?? c.tipo_rotina.toUpperCase()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{c.pasta_modelo}</code>
                    </TableCell>
                    <TableCell>
                      {c.extensoes.map(e => (
                        <Badge key={e} variant="outline" className="text-[10px] mr-1">.{e}</Badge>
                      ))}
                    </TableCell>
                    <TableCell>
                      {c.auto_concluir
                        ? <span className="text-xs text-green-600 font-medium flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" />Sim</span>
                        : <span className="text-xs text-muted-foreground">Não</span>
                      }
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Switch checked={c.ativo} onCheckedChange={() => handleToggle(c)} />
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-600"
                        onClick={() => handleDelete(c.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Log de detecções */}
      {logs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2" style={{ color: NAVY }}>
              <Bot className="h-4 w-4" /> Últimas Detecções do Robô
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Observação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(l => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-mono">{l.arquivo_nome ?? l.arquivo_path}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className="text-[10px]"
                        style={{
                          backgroundColor: l.status === "processado" ? "#22c55e20" : l.status === "erro" ? "#ef444420" : "#f59e0b20",
                          color: l.status === "processado" ? "#16a34a" : l.status === "erro" ? "#dc2626" : "#d97706",
                        }}
                      >
                        {l.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(l.created_at).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{l.erro_msg ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Dialog: criar/editar automação */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent style={{ maxWidth: "520px" }}>
          <DialogHeader>
            <DialogTitle style={{ color: NAVY }}>
              {editingId ? "Editar Automação" : "Nova Automação"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Tipo de Obrigação *</Label>
              <select
                value={form.tipo_rotina}
                onChange={e => setForm(p => ({
                  ...p,
                  tipo_rotina: e.target.value,
                  pasta_modelo: pastaPadrao(e.target.value),
                }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                required
              >
                <option value="">Selecionar tipo...</option>
                {TIPOS_SUGERIDOS.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Pasta Modelo *</Label>
              <Input
                value={form.pasta_modelo}
                onChange={e => setForm(p => ({ ...p, pasta_modelo: e.target.value }))}
                placeholder="pgdas/{cnpj}/{competencia}/"
                required
              />
              <p className="text-xs text-muted-foreground">
                Use <code className="bg-muted px-1 rounded">{"{cnpj}"}</code> e <code className="bg-muted px-1 rounded">{"{competencia}"}</code> como variáveis (preenchidas automaticamente).
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Extensões aceitas</Label>
              <Input
                value={form.extensoes}
                onChange={e => setForm(p => ({ ...p, extensoes: e.target.value }))}
                placeholder="pdf, xlsx, xml"
              />
              <p className="text-xs text-muted-foreground">Separe com vírgula. Padrão: pdf</p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Concluir rotina automaticamente</p>
                <p className="text-xs text-muted-foreground">Quando o arquivo for detectado, marca a rotina como Concluída</p>
              </div>
              <Switch
                checked={form.auto_concluir}
                onCheckedChange={v => setForm(p => ({ ...p, auto_concluir: v }))}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={loading} style={{ backgroundColor: NAVY }} className="text-white">
                {loading ? "Salvando..." : editingId ? "Salvar" : "Criar Automação"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
