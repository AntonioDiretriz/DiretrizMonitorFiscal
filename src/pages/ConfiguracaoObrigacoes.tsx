import { useState, useEffect, useMemo } from "react";
import { Save, Info, RotateCcw, Plus, Pencil, Trash2, PackageOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const NAVY = "#10143D";

interface RotinaModelo {
  id: string;
  nome_rotina: string;
  codigo_rotina: string;
  tipo_rotina: string;
  departamento: string;
  periodicidade: string;
  criticidade: string;
  dia_vencimento: number | null;
  meses_offset: number | null;
  margem_seguranca: number | null;
  descricao: string | null;
}

interface RegrasMap {
  [rotina_modelo_id: string]: { dia_vencimento: string; dias_margem: string };
}

const DEPT_ORDER = ["Fiscal", "Contábil", "DP", "Gestão", "Legalização", "Financeiro"];

const CRIT_COLOR: Record<string, string> = {
  critica: "bg-red-100 text-red-700 border-red-200",
  alta:    "bg-orange-100 text-orange-700 border-orange-200",
  media:   "bg-yellow-100 text-yellow-700 border-yellow-200",
  baixa:   "bg-green-100 text-green-700 border-green-200",
};

const PERIOD_LABEL: Record<string, string> = {
  mensal: "Mensal", trimestral: "Trimestral", anual: "Anual", eventual: "Eventual",
};

function calcPrazoInterno(diaLegal: string, diasMargem: string): string {
  const dia = parseInt(diaLegal);
  const margem = parseInt(diasMargem);
  if (isNaN(dia) || isNaN(margem) || dia < 1 || margem < 0) return "—";
  const resultado = dia - margem;
  if (resultado < 1) return `dia ${resultado + 30} (mês ant.)`;
  return `dia ${resultado}`;
}

// ── SEED padrão (caso rotina_modelo esteja vazia) ─────────────────────────────
const SEED_OBRIGACOES = [
  { nome_rotina: "PGDAS-D",              codigo_rotina: "FIS-SN-001",      tipo_rotina: "pgdas",     departamento: "Fiscal",   periodicidade: "mensal",     criticidade: "alta",    dia_vencimento: 20, meses_offset: 0, margem_seguranca: 3,  descricao: "Apuração mensal do Simples Nacional" },
  { nome_rotina: "DAS",                  codigo_rotina: "FIS-SN-002",      tipo_rotina: "das",       departamento: "Fiscal",   periodicidade: "mensal",     criticidade: "critica", dia_vencimento: 20, meses_offset: 1, margem_seguranca: 5,  descricao: "Guia de pagamento do Simples Nacional" },
  { nome_rotina: "DEFIS",                codigo_rotina: "FIS-SN-003",      tipo_rotina: "defis",     departamento: "Contábil", periodicidade: "anual",      criticidade: "alta",    dia_vencimento: 31, meses_offset: 3, margem_seguranca: 5,  descricao: "Declaração anual do Simples Nacional" },
  { nome_rotina: "DCTFWeb",              codigo_rotina: "FIS-DCTFWEB-001", tipo_rotina: "dctfweb",   departamento: "Fiscal",   periodicidade: "mensal",     criticidade: "critica", dia_vencimento: 15, meses_offset: 1, margem_seguranca: 3,  descricao: "Declaração de débitos federais web" },
  { nome_rotina: "PIS/COFINS",           codigo_rotina: "FIS-PISCOFINS-001",tipo_rotina:"piscofins", departamento: "Fiscal",   periodicidade: "mensal",     criticidade: "alta",    dia_vencimento: 25, meses_offset: 1, margem_seguranca: 3,  descricao: "Apuração e pagamento de PIS e COFINS" },
  { nome_rotina: "EFD-Contribuições",    codigo_rotina: "FIS-CONTRIB-001", tipo_rotina: "efd",       departamento: "Fiscal",   periodicidade: "mensal",     criticidade: "alta",    dia_vencimento: 15, meses_offset: 2, margem_seguranca: 3,  descricao: "EFD das Contribuições" },
  { nome_rotina: "EFD-Reinf",            codigo_rotina: "FIS-REINF-001",   tipo_rotina: "reinf",     departamento: "Fiscal",   periodicidade: "mensal",     criticidade: "alta",    dia_vencimento: 15, meses_offset: 1, margem_seguranca: 3,  descricao: "EFD de Retenções" },
  { nome_rotina: "NFS-e",                codigo_rotina: "FIS-MUN-001",     tipo_rotina: "nfse",      departamento: "Fiscal",   periodicidade: "mensal",     criticidade: "alta",    dia_vencimento: 5,  meses_offset: 1, margem_seguranca: 2,  descricao: "Emissão e conferência de notas de serviço" },
  { nome_rotina: "ISS",                  codigo_rotina: "FIS-ISS-001",     tipo_rotina: "iss",       departamento: "Fiscal",   periodicidade: "mensal",     criticidade: "alta",    dia_vencimento: 10, meses_offset: 1, margem_seguranca: 3,  descricao: "Apuração e pagamento do ISS" },
  { nome_rotina: "NF-e / NFC-e",         codigo_rotina: "FIS-EST-001",     tipo_rotina: "nfe",       departamento: "Fiscal",   periodicidade: "mensal",     criticidade: "alta",    dia_vencimento: 5,  meses_offset: 1, margem_seguranca: 2,  descricao: "Emissão e conferência de notas de produtos" },
  { nome_rotina: "ICMS",                 codigo_rotina: "FIS-ICMS-001",    tipo_rotina: "icms",      departamento: "Fiscal",   periodicidade: "mensal",     criticidade: "alta",    dia_vencimento: 15, meses_offset: 1, margem_seguranca: 3,  descricao: "Apuração e pagamento do ICMS" },
  { nome_rotina: "IRPJ",                 codigo_rotina: "CONT-IRPJ-001",   tipo_rotina: "irpj",      departamento: "Contábil", periodicidade: "trimestral", criticidade: "critica", dia_vencimento: 30, meses_offset: 1, margem_seguranca: 5,  descricao: "Apuração do IRPJ" },
  { nome_rotina: "CSLL",                 codigo_rotina: "CONT-CSLL-001",   tipo_rotina: "csll",      departamento: "Contábil", periodicidade: "trimestral", criticidade: "critica", dia_vencimento: 30, meses_offset: 1, margem_seguranca: 5,  descricao: "Apuração da CSLL" },
  { nome_rotina: "ECF",                  codigo_rotina: "CONT-ECF-001",    tipo_rotina: "ecf",       departamento: "Contábil", periodicidade: "anual",      criticidade: "alta",    dia_vencimento: 31, meses_offset: 7, margem_seguranca: 5,  descricao: "Escrituração Contábil Fiscal" },
  { nome_rotina: "ECD",                  codigo_rotina: "CONT-ECD-001",    tipo_rotina: "ecd",       departamento: "Contábil", periodicidade: "anual",      criticidade: "alta",    dia_vencimento: 30, meses_offset: 6, margem_seguranca: 5,  descricao: "Escrituração Contábil Digital" },
  { nome_rotina: "Fechamento Fiscal",    codigo_rotina: "FIS-FECH-001",    tipo_rotina: "fechamento",departamento: "Fiscal",   periodicidade: "mensal",     criticidade: "alta",    dia_vencimento: 25, meses_offset: 0, margem_seguranca: 3,  descricao: "Conferência e fechamento fiscal" },
  { nome_rotina: "Fechamento Contábil",  codigo_rotina: "CONT-FECH-001",   tipo_rotina: "fechamento",departamento: "Contábil", periodicidade: "mensal",     criticidade: "alta",    dia_vencimento: 5,  meses_offset: 1, margem_seguranca: 2,  descricao: "Encerramento contábil mensal" },
  { nome_rotina: "Controle de Certidões",codigo_rotina: "GES-CERT-001",    tipo_rotina: "certidoes", departamento: "Gestão",   periodicidade: "mensal",     criticidade: "media",   dia_vencimento: 1,  meses_offset: 1, margem_seguranca: 5,  descricao: "Monitoramento de certidões negativas" },
  { nome_rotina: "eSocial Pró-labore",   codigo_rotina: "DP-001",          tipo_rotina: "esocial",   departamento: "DP",       periodicidade: "mensal",     criticidade: "alta",    dia_vencimento: 20, meses_offset: 1, margem_seguranca: 3,  descricao: "Eventos de pró-labore no eSocial" },
  { nome_rotina: "Folha de Pagamento",   codigo_rotina: "DP-002",          tipo_rotina: "folha",     departamento: "DP",       periodicidade: "mensal",     criticidade: "critica", dia_vencimento: 5,  meses_offset: 1, margem_seguranca: 2,  descricao: "Processamento da folha mensal" },
  { nome_rotina: "FGTS Digital",         codigo_rotina: "DP-003",          tipo_rotina: "fgts",      departamento: "DP",       periodicidade: "mensal",     criticidade: "critica", dia_vencimento: 7,  meses_offset: 1, margem_seguranca: 2,  descricao: "Geração e pagamento do FGTS" },
  { nome_rotina: "eSocial Funcionários", codigo_rotina: "DP-004",          tipo_rotina: "esocial",   departamento: "DP",       periodicidade: "mensal",     criticidade: "critica", dia_vencimento: 15, meses_offset: 1, margem_seguranca: 3,  descricao: "Eventos mensais de CLT no eSocial" },
];

const EMPTY_FORM = {
  nome_rotina: "", codigo_rotina: "", tipo_rotina: "", departamento: "Fiscal",
  periodicidade: "mensal", criticidade: "alta",
  dia_vencimento: "", meses_offset: "1", margem_seguranca: "3", descricao: "",
};

// ── Dialog Nova / Editar Obrigação ─────────────────────────────────────────────
function ObrigacaoDialog({
  open, onOpenChange, initial, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: RotinaModelo | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial ? {
        nome_rotina:     initial.nome_rotina,
        codigo_rotina:   initial.codigo_rotina,
        tipo_rotina:     initial.tipo_rotina,
        departamento:    initial.departamento,
        periodicidade:   initial.periodicidade,
        criticidade:     initial.criticidade,
        dia_vencimento:  initial.dia_vencimento?.toString() ?? "",
        meses_offset:    initial.meses_offset?.toString() ?? "1",
        margem_seguranca:initial.margem_seguranca?.toString() ?? "3",
        descricao:       initial.descricao ?? "",
      } : EMPTY_FORM);
    }
  }, [open, initial]);

  const f = (field: string) => (e: any) => setForm(p => ({ ...p, [field]: e.target.value }));

  async function handleSave() {
    if (!form.nome_rotina || !form.codigo_rotina || !form.tipo_rotina) {
      toast({ title: "Preencha Nome, Código e Tipo.", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const payload = {
        nome_rotina:     form.nome_rotina,
        codigo_rotina:   form.codigo_rotina.toUpperCase(),
        tipo_rotina:     form.tipo_rotina,
        departamento:    form.departamento,
        periodicidade:   form.periodicidade,
        criticidade:     form.criticidade,
        dia_vencimento:  form.dia_vencimento  ? parseInt(form.dia_vencimento)  : null,
        meses_offset:    form.meses_offset    ? parseInt(form.meses_offset)    : 1,
        margem_seguranca:form.margem_seguranca? parseInt(form.margem_seguranca): 3,
        descricao:       form.descricao || null,
        ativo:           true,
      };

      const { error } = initial
        ? await (supabase as any).from("rotina_modelo").update(payload).eq("id", initial.id)
        : await (supabase as any).from("rotina_modelo").insert(payload);

      if (error) throw error;
      toast({ title: initial ? "Obrigação atualizada!" : "Obrigação criada!" });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle style={{ color: NAVY }}>
            {initial ? "Editar Obrigação" : "Nova Obrigação"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Nome *</Label>
              <Input placeholder="Ex: DAS" value={form.nome_rotina} onChange={f("nome_rotina")} />
            </div>
            <div>
              <Label>Código *</Label>
              <Input placeholder="Ex: FIS-SN-002" value={form.codigo_rotina} onChange={f("codigo_rotina")} className="uppercase" />
            </div>
            <div>
              <Label>Tipo *</Label>
              <Input placeholder="Ex: das" value={form.tipo_rotina} onChange={f("tipo_rotina")} />
            </div>
            <div>
              <Label>Departamento</Label>
              <Select value={form.departamento} onValueChange={v => setForm(p => ({ ...p, departamento: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Fiscal","Contábil","DP","Gestão","Legalização","Financeiro"].map(d =>
                    <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Periodicidade</Label>
              <Select value={form.periodicidade} onValueChange={v => setForm(p => ({ ...p, periodicidade: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="trimestral">Trimestral</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                  <SelectItem value="eventual">Eventual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Criticidade</Label>
              <Select value={form.criticidade} onValueChange={v => setForm(p => ({ ...p, criticidade: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="critica">Crítica</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Dia de Vencimento</Label>
              <Input type="number" min={1} max={31} placeholder="Ex: 20" value={form.dia_vencimento} onChange={f("dia_vencimento")} />
            </div>
            <div>
              <Label>Meses Offset</Label>
              <Input type="number" min={0} max={12} placeholder="1 = mês seguinte" value={form.meses_offset} onChange={f("meses_offset")} />
            </div>
            <div>
              <Label>Margem de Segurança (dias)</Label>
              <Input type="number" min={0} max={31} placeholder="Ex: 3" value={form.margem_seguranca} onChange={f("margem_seguranca")} />
            </div>
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea placeholder="Descrição opcional..." value={form.descricao} onChange={f("descricao")} rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} style={{ backgroundColor: NAVY }} className="text-white">
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function ConfiguracaoObrigacoes() {
  const { user, ownerUserId } = useAuth();
  const { toast } = useToast();

  const [modelos, setModelos] = useState<RotinaModelo[]>([]);
  const [regras, setRegras] = useState<RegrasMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<RotinaModelo | null>(null);
  const [seeding, setSeeding] = useState(false);

  async function load() {
    if (!user) return;
    setLoading(true);
    const uid = ownerUserId ?? user.id;
    const [{ data: mods }, { data: rules }] = await Promise.all([
      supabase.from("rotina_modelo" as any).select("*").eq("ativo", true).order("departamento").order("nome_rotina"),
      supabase.from("regra_vencimento_usuario" as any).select("*").eq("user_id", uid),
    ]);
    setModelos((mods ?? []) as RotinaModelo[]);
    const map: RegrasMap = {};
    for (const r of (rules ?? []) as any[]) {
      map[r.rotina_modelo_id] = {
        dia_vencimento: r.dia_vencimento?.toString() ?? "",
        dias_margem:    r.dias_margem?.toString() ?? "",
      };
    }
    setRegras(map);
    setLoading(false);
  }

  useEffect(() => { load(); }, [user]);

  async function carregarPadroes() {
    setSeeding(true);
    try {
      const { error } = await (supabase as any)
        .from("rotina_modelo")
        .upsert(SEED_OBRIGACOES.map(o => ({ ...o, ativo: true })), { onConflict: "codigo_rotina" });
      if (error) throw error;
      toast({ title: `${SEED_OBRIGACOES.length} obrigações padrão carregadas!` });
      await load();
    } catch (err: any) {
      toast({ title: "Erro ao carregar padrões", description: err.message, variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  }

  async function excluirModelo(modelo: RotinaModelo) {
    const { error } = await (supabase as any)
      .from("rotina_modelo").update({ ativo: false }).eq("id", modelo.id);
    if (error) { toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }); return; }
    toast({ title: `${modelo.nome_rotina} removida.` });
    await load();
  }

  function getRegra(id: string, field: "dia_vencimento" | "dias_margem") {
    return regras[id]?.[field] ?? "";
  }
  function setRegra(id: string, field: "dia_vencimento" | "dias_margem", value: string) {
    setRegras(p => ({ ...p, [id]: { ...p[id], [field]: value } }));
  }

  async function salvarRegra(modelo: RotinaModelo) {
    if (!user) return;
    const uid = ownerUserId ?? user.id;
    const regra = regras[modelo.id];
    setSaving(modelo.id);
    try {
      await (supabase as any).from("regra_vencimento_usuario").upsert({
        user_id: uid, rotina_modelo_id: modelo.id,
        dia_vencimento: regra?.dia_vencimento ? parseInt(regra.dia_vencimento) : null,
        dias_margem:    regra?.dias_margem    ? parseInt(regra.dias_margem)    : null,
      }, { onConflict: "user_id,rotina_modelo_id" });
      toast({ title: `Regra salva: ${modelo.nome_rotina}` });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally { setSaving(null); }
  }

  async function salvarTodos() {
    if (!user) return;
    const uid = ownerUserId ?? user.id;
    setSaving("all");
    try {
      const payload = Object.entries(regras)
        .filter(([, r]) => r.dia_vencimento || r.dias_margem)
        .map(([rotina_modelo_id, r]) => ({
          user_id: uid, rotina_modelo_id,
          dia_vencimento: r.dia_vencimento ? parseInt(r.dia_vencimento) : null,
          dias_margem:    r.dias_margem    ? parseInt(r.dias_margem)    : null,
        }));
      if (!payload.length) { toast({ title: "Nenhuma regra para salvar." }); return; }
      await (supabase as any).from("regra_vencimento_usuario")
        .upsert(payload, { onConflict: "user_id,rotina_modelo_id" });
      toast({ title: `${payload.length} regras salvas!` });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally { setSaving(null); }
  }

  async function resetarRegra(modelo: RotinaModelo) {
    if (!user) return;
    const uid = ownerUserId ?? user.id;
    await (supabase as any).from("regra_vencimento_usuario")
      .delete().eq("user_id", uid).eq("rotina_modelo_id", modelo.id);
    setRegras(p => { const n = { ...p }; delete n[modelo.id]; return n; });
    toast({ title: `Resetado para padrão: ${modelo.nome_rotina}` });
  }

  const grupos = useMemo(() => {
    const map: Record<string, RotinaModelo[]> = {};
    for (const m of modelos) {
      if (!map[m.departamento]) map[m.departamento] = [];
      map[m.departamento].push(m);
    }
    return DEPT_ORDER.filter(d => map[d]).map(d => ({ dept: d, items: map[d] }));
  }, [modelos]);

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground">
      Carregando obrigações...
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Configuração de Obrigações</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Defina o vencimento legal e o prazo interno de cada obrigação para o seu escritório.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {modelos.length === 0 && (
            <Button variant="outline" onClick={carregarPadroes} disabled={seeding}>
              <PackageOpen className="h-4 w-4 mr-2" />
              {seeding ? "Carregando..." : "Carregar Obrigações Padrão"}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => { setEditando(null); setDialogOpen(true); }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nova Obrigação
          </Button>
          <Button onClick={salvarTodos} disabled={saving === "all"} style={{ backgroundColor: NAVY }} className="text-white">
            <Save className="h-4 w-4 mr-2" />
            {saving === "all" ? "Salvando..." : "Salvar Todos"}
          </Button>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
        <div>
          <strong>Como funciona:</strong> Configure o <em>Dia Legal</em> (vencimento da Receita/Prefeitura) e a <em>Margem</em> (dias antes para prazo interno).
          Exemplo: DAS vence dia 20, margem 10 → prazo interno = dia 10. Campos em branco usam o padrão do sistema.
        </div>
      </div>

      {/* Estado vazio */}
      {modelos.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <PackageOpen className="h-12 w-12 text-muted-foreground/40" />
            <div>
              <p className="font-medium text-foreground">Nenhuma obrigação cadastrada</p>
              <p className="text-sm text-muted-foreground mt-1">
                Clique em <strong>"Carregar Obrigações Padrão"</strong> para importar as {SEED_OBRIGACOES.length} obrigações do sistema,
                ou em <strong>"Nova Obrigação"</strong> para criar manualmente.
              </p>
            </div>
            <Button onClick={carregarPadroes} disabled={seeding} style={{ backgroundColor: NAVY }} className="text-white">
              <PackageOpen className="h-4 w-4 mr-2" />
              {seeding ? "Carregando..." : "Carregar Obrigações Padrão"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tabelas por departamento */}
      {grupos.map(({ dept, items }) => (
        <Card key={dept}>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {dept} <span className="ml-1 text-xs font-normal">({items.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-xs text-muted-foreground">
                  <th className="text-left px-4 py-2 w-[28%]">Obrigação</th>
                  <th className="text-left px-4 py-2 w-[10%]">Período</th>
                  <th className="text-left px-4 py-2 w-[9%]">Criticidade</th>
                  <th className="text-center px-2 py-2 w-[13%]">
                    Dia Legal
                    <div className="font-normal text-[10px] leading-tight">(padrão do sistema)</div>
                  </th>
                  <th className="text-center px-2 py-2 w-[13%]">
                    Margem (dias)
                    <div className="font-normal text-[10px] leading-tight">(antes do vencimento)</div>
                  </th>
                  <th className="text-center px-2 py-2 w-[12%]">Prazo Interno</th>
                  <th className="px-4 py-2 w-[15%]"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((modelo, idx) => {
                  const diaCustom    = getRegra(modelo.id, "dia_vencimento");
                  const margemCustom = getRegra(modelo.id, "dias_margem");
                  const diaExib      = diaCustom    || (modelo.dia_vencimento?.toString()   ?? "—");
                  const margemExib   = margemCustom || (modelo.margem_seguranca?.toString() ?? "3");
                  const temCustom    = !!(diaCustom || margemCustom);

                  return (
                    <tr key={modelo.id} className={`border-b last:border-0 ${idx % 2 === 0 ? "" : "bg-gray-50/40"}`}>
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{modelo.nome_rotina}</div>
                        <div className="text-xs text-muted-foreground">{modelo.codigo_rotina}</div>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">
                        {PERIOD_LABEL[modelo.periodicidade] ?? modelo.periodicidade}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border capitalize ${CRIT_COLOR[modelo.criticidade] ?? ""}`}>
                          {modelo.criticidade}
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        <Input
                          type="number" min={1} max={31}
                          placeholder={modelo.dia_vencimento?.toString() ?? "—"}
                          value={diaCustom}
                          onChange={e => setRegra(modelo.id, "dia_vencimento", e.target.value)}
                          className="w-16 h-8 text-center text-sm mx-auto block"
                        />
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-1 justify-center">
                          <Input
                            type="number" min={0} max={31}
                            placeholder={modelo.margem_seguranca?.toString() ?? "3"}
                            value={margemCustom}
                            onChange={e => setRegra(modelo.id, "dias_margem", e.target.value)}
                            className="w-14 h-8 text-center text-sm"
                          />
                          <span className="text-xs text-muted-foreground">dias</span>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                          {calcPrazoInterno(diaExib, margemExib)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1 justify-end">
                          {temCustom && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-orange-600" title="Resetar para padrão" onClick={() => resetarRegra(modelo)}>
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-blue-600" title="Editar obrigação" onClick={() => { setEditando(modelo); setDialogOpen(true); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={saving === modelo.id} onClick={() => salvarRegra(modelo)}>
                            <Save className="h-3 w-3 mr-1" />
                            {saving === modelo.id ? "..." : "Salvar"}
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600" title="Remover">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remover obrigação?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  <strong>{modelo.nome_rotina}</strong> será desativada e não será mais gerada automaticamente.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => excluirModelo(modelo)} className="bg-red-600 hover:bg-red-700">
                                  Remover
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}

      <ObrigacaoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editando}
        onSaved={load}
      />
    </div>
  );
}
