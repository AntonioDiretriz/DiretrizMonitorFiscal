import { useState, useEffect, useMemo } from "react";
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO, addMonths, setDate, subDays, getDaysInMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus, Search, Filter, ClipboardList, Clock, AlertTriangle,
  CheckCircle, LayoutGrid, List, ChevronRight, Building2, User,
  CalendarDays, Trash2, Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  useRotinas, useCreateRotina, useDeleteRotina, useCatalogoObrigacoes,
  type Rotina, type RotinaStatus,
} from "@/hooks/useRotinas";
import { ExportButton } from "@/components/ExportButton";
import RotinaDetalhe, { STATUS_CONFIG, StatusBadge } from "@/pages/RotinaDetalhe";

// ── Palette ───────────────────────────────────────────────────────────────────
const NAVY  = "#10143D";
const RED   = "#ED3237";
const GREEN = "#22c55e";
const AMBER = "#f59e0b";

// ── Etapa config ──────────────────────────────────────────────────────────────
const ETAPA_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  preparar:  { label: "Preparar",  color: "#6b7280", bg: "#f9fafb" },
  revisar:   { label: "Revisar",   color: "#f59e0b", bg: "#fffbeb" },
  enviar:    { label: "Enviar",    color: "#3b82f6", bg: "#eff6ff" },
  concluido: { label: "Concluído", color: "#22c55e", bg: "#f0fdf4" },
};

const ETAPA_ORDER = ["preparar", "revisar", "enviar", "concluido"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function getCompetenciaMes(): string {
  return format(startOfMonth(new Date()), "yyyy-MM-dd");
}

// ── Criar Rotina Dialog ───────────────────────────────────────────────────────
interface NovaRotinaDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  empresas: { id: string; razao_social: string }[];
  equipe: { id: string; nome: string; papel_rotinas?: string }[];
}

function NovaRotinaDialog({ open, onOpenChange, empresas, equipe }: NovaRotinaDialogProps) {
  const { toast } = useToast();
  const catalogo = useCatalogoObrigacoes();
  const createRotina = useCreateRotina();

  const [form, setForm] = useState({
    empresa_id: "",
    catalogo_id: "",
    titulo: "",
    tipo: "",
    competencia: format(startOfMonth(new Date()), "yyyy-MM"),
    data_vencimento: "",
    data_vencimento_interno: "",
    responsavel_id: "",
    revisor_id: "",
    observacao: "",
  });

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  // Calcula datas de vencimento com base na competência + catálogo
  function calcDatas(competencia: string, catalogoId: string) {
    if (!competencia || !catalogoId || catalogoId === "_manual") return {};
    const item = catalogo.data?.find(c => c.id === catalogoId);
    if (!item || !item.dia_vencimento) return {};

    const refMes = parseISO(competencia + "-01");
    const mesPagamento = addMonths(refMes, item.meses_offset ?? 1);
    const maxDia = getDaysInMonth(mesPagamento);
    const dia = Math.min(item.dia_vencimento, maxDia);
    const vencLegal = setDate(mesPagamento, dia);
    const vencInterno = subDays(vencLegal, item.margem_seguranca ?? 3);

    return {
      data_vencimento: format(vencLegal, "yyyy-MM-dd"),
      data_vencimento_interno: format(vencInterno, "yyyy-MM-dd"),
    };
  }

  // Auto-fill título, tipo e datas quando catálogo é selecionado
  function onCatalogoChange(id: string) {
    if (!id || id === "_manual") {
      setForm(p => ({ ...p, catalogo_id: id, titulo: "", tipo: "", data_vencimento: "", data_vencimento_interno: "" }));
      return;
    }
    const item = catalogo.data?.find(c => c.id === id);
    const datas = calcDatas(form.competencia, id);
    setForm(p => ({
      ...p,
      catalogo_id: id,
      titulo: item?.nome ?? p.titulo,
      tipo: item?.tipo ?? p.tipo,
      ...datas,
    }));
  }

  // Recalcula datas quando competência muda (se já tem catálogo selecionado)
  function onCompetenciaChange(v: string) {
    const datas = calcDatas(v, form.catalogo_id);
    setForm(p => ({ ...p, competencia: v, ...datas }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titulo || !form.tipo || !form.data_vencimento) {
      toast({ title: "Campos obrigatórios", description: "Título, tipo e data de vencimento são obrigatórios.", variant: "destructive" });
      return;
    }
    try {
      await createRotina.mutateAsync({
        empresa_id: form.empresa_id || null,
        catalogo_id: form.catalogo_id && form.catalogo_id !== "_manual" ? form.catalogo_id : null,
        titulo: form.titulo,
        tipo: form.tipo,
        competencia: form.competencia ? form.competencia + "-01" : null,
        data_vencimento: form.data_vencimento,
        data_vencimento_interno: form.data_vencimento_interno || null,
        responsavel_id: form.responsavel_id || null,
        revisor_id: form.revisor_id || null,
        observacao: form.observacao || null,
      });
      toast({ title: "Rotina criada com sucesso!" });
      onOpenChange(false);
      setForm({
        empresa_id: "", catalogo_id: "", titulo: "", tipo: "",
        competencia: format(startOfMonth(new Date()), "yyyy-MM"),
        data_vencimento: "", data_vencimento_interno: "",
        responsavel_id: "", revisor_id: "", observacao: "",
      });
    } catch (err: any) {
      toast({ title: "Erro ao criar rotina", description: err.message, variant: "destructive" });
    }
  }

  const catalogoItems = catalogo.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle style={{ color: NAVY }}>Nova Rotina</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Empresa */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Empresa</Label>
              <Select value={form.empresa_id} onValueChange={v => set("empresa_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar empresa" /></SelectTrigger>
                <SelectContent>
                  {empresas.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.razao_social}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Competência</Label>
              <Input
                type="month"
                value={form.competencia}
                onChange={e => onCompetenciaChange(e.target.value)}
              />
            </div>
          </div>

          {/* Catálogo */}
          <div>
            <Label>Obrigação do Catálogo</Label>
            <Select value={form.catalogo_id} onValueChange={onCatalogoChange}>
              <SelectTrigger><SelectValue placeholder="Selecionar do catálogo (ou preencher manualmente)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_manual">— Manual —</SelectItem>
                {catalogoItems.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Título + Tipo */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Título *</Label>
              <Input
                value={form.titulo}
                onChange={e => set("titulo", e.target.value)}
                placeholder="Ex: FGTS — Jan/2026"
                required
              />
            </div>
            <div>
              <Label>Tipo *</Label>
              <Input
                value={form.tipo}
                onChange={e => set("tipo", e.target.value)}
                placeholder="das, fgts, inss..."
                required
              />
            </div>
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>
                Vencimento Legal *
                {form.catalogo_id && form.catalogo_id !== "_manual" && (
                  <span className="ml-2 text-[10px] text-muted-foreground font-normal">calculado automaticamente</span>
                )}
              </Label>
              <Input
                type="date"
                value={form.data_vencimento}
                onChange={e => set("data_vencimento", e.target.value)}
                required
              />
            </div>
            <div>
              <Label>
                Prazo Interno
                {form.catalogo_id && form.catalogo_id !== "_manual" && (
                  <span className="ml-2 text-[10px] text-muted-foreground font-normal">calculado automaticamente</span>
                )}
              </Label>
              <Input
                type="date"
                value={form.data_vencimento_interno}
                onChange={e => set("data_vencimento_interno", e.target.value)}
              />
            </div>
          </div>

          {/* Responsável + Revisor */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Responsável</Label>
              <Select value={form.responsavel_id} onValueChange={v => set("responsavel_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {equipe
                    .filter(u => ["responsavel", "ambos"].includes(u.papel_rotinas ?? ""))
                    .map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)
                  }
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Revisor</Label>
              <Select value={form.revisor_id} onValueChange={v => set("revisor_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {equipe
                    .filter(u => ["revisor", "ambos"].includes(u.papel_rotinas ?? ""))
                    .map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)
                  }
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Observação</Label>
            <Textarea
              value={form.observacao}
              onChange={e => set("observacao", e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" style={{ backgroundColor: NAVY }} disabled={createRotina.isPending}>
              {createRotina.isPending ? "Criando..." : "Criar Rotina"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers (shared) ─────────────────────────────────────────────────────────
function resolvePerfilCodigo(regime: string, atividade: string, prolabore: boolean, funcionario: boolean): string {
  const r = regime === "simples" ? "SN" : regime === "presumido" ? "LP" : regime === "real" ? "LR" : null;
  const a = atividade === "servico" ? "SERV" : atividade === "comercio" ? "COM" : atividade === "misto" ? "MIX" : null;
  if (!r || !a) return "—";
  return `${r}-${a}-PL-${funcionario ? "CF" : "SF"}`;
}

// ── Gerar Rotinas do Perfil Dialog ────────────────────────────────────────────
interface GerarDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  empresas: { id: string; razao_social: string; regime_tributario?: string; atividade?: string; possui_prolabore?: boolean; possui_funcionario?: boolean }[];
  equipe: { id: string; nome: string; papel_rotinas?: string }[];
}

function GerarRotinasPerfilDialog({ open, onOpenChange, empresas, equipe }: GerarDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const createRotina = useCreateRotina();

  const [empresaId, setEmpresaId] = useState("");
  const [competencia, setCompetencia] = useState(format(startOfMonth(new Date()), "yyyy-MM"));
  const [responsavelId, setResponsavelId] = useState("");
  const [preview, setPreview] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const empresa = empresas.find(e => e.id === empresaId);
  const perfilCodigo = empresa
    ? resolvePerfilCodigo(
        empresa.regime_tributario ?? "",
        empresa.atividade ?? "servico",
        empresa.possui_prolabore ?? true,
        empresa.possui_funcionario ?? false,
      )
    : "—";

  // Carrega rotinas do perfil quando empresa ou competência muda
  useEffect(() => {
    if (!empresa || perfilCodigo === "—") { setPreview([]); return; }
    setLoading(true);

    const load = async () => {
      // Busca o perfil_modelo pelo código
      const { data: perfil } = await (supabase as any)
        .from("perfil_modelo")
        .select("id")
        .eq("codigo", perfilCodigo)
        .single();

      if (!perfil) { setPreview([]); setLoading(false); return; }

      // Busca rotinas do catálogo vinculadas ao perfil
      const { data: links } = await (supabase as any)
        .from("perfil_rotina")
        .select("ordem, condicional, rotina_modelo(id, nome, tipo, dia_vencimento, meses_offset, margem_seguranca, periodicidade)")
        .eq("perfil_id", perfil.id)
        .order("ordem");

      const refMes = parseISO(competencia + "-01");

      const items = (links ?? []).map((l: any) => {
        const rm = l.rotina_modelo;
        if (!rm) return null;

        let dataVencimento = "";
        let dataInterno = "";
        if (rm.dia_vencimento) {
          const mesPag = addMonths(refMes, rm.meses_offset ?? 1);
          const maxDia = getDaysInMonth(mesPag);
          const dia = Math.min(rm.dia_vencimento, maxDia);
          const vencLegal = setDate(mesPag, dia);
          const vencInt = subDays(vencLegal, rm.margem_seguranca ?? 3);
          dataVencimento = format(vencLegal, "yyyy-MM-dd");
          dataInterno = format(vencInt, "yyyy-MM-dd");
        }

        return {
          catalogo_id: rm.id,
          titulo: `${rm.nome} — ${format(refMes, "MMM/yyyy", { locale: ptBR })}`,
          tipo: rm.tipo,
          data_vencimento: dataVencimento,
          data_vencimento_interno: dataInterno,
          condicional: l.condicional,
        };
      }).filter(Boolean);

      setPreview(items);
      setLoading(false);
    };

    load();
  }, [empresaId, competencia, perfilCodigo]);

  async function handleGerar() {
    if (!empresa || preview.length === 0) return;
    setGenerating(true);
    let created = 0;
    try {
      for (const item of preview) {
        if (!item.data_vencimento) continue;
        await createRotina.mutateAsync({
          empresa_id: empresa.id,
          catalogo_id: item.catalogo_id,
          titulo: item.titulo,
          tipo: item.tipo,
          competencia: competencia + "-01",
          data_vencimento: item.data_vencimento,
          data_vencimento_interno: item.data_vencimento_interno || null,
          responsavel_id: responsavelId || null,
          revisor_id: null,
          observacao: item.condicional ? `Condição: ${item.condicional}` : null,
        });
        created++;
      }
      toast({ title: `${created} rotinas geradas com sucesso!` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro ao gerar rotinas", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) { setEmpresaId(""); setPreview([]); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle style={{ color: NAVY }} className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Gerar Rotinas do Perfil
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Empresa *</Label>
              <Select value={empresaId} onValueChange={setEmpresaId}>
                <SelectTrigger><SelectValue placeholder="Selecionar empresa" /></SelectTrigger>
                <SelectContent>
                  {empresas.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.razao_social}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Competência *</Label>
              <Input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} />
            </div>
          </div>

          {empresa && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 text-sm">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span>Perfil detectado:</span>
              <Badge variant="outline" className="font-mono text-xs">{perfilCodigo}</Badge>
              {perfilCodigo === "—" && (
                <span className="text-amber-600 text-xs ml-1">Configure regime e atividade no cadastro da empresa.</span>
              )}
            </div>
          )}

          <div>
            <Label>Responsável (opcional)</Label>
            <Select value={responsavelId} onValueChange={setResponsavelId}>
              <SelectTrigger><SelectValue placeholder="Selecionar responsável" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">— Nenhum —</SelectItem>
                {equipe.filter(u => ["responsavel", "ambos"].includes(u.papel_rotinas ?? "")).map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Preview */}
          {loading && <p className="text-sm text-muted-foreground text-center py-4">Carregando rotinas do perfil...</p>}
          {!loading && empresa && perfilCodigo !== "—" && preview.length === 0 && (
            <p className="text-sm text-amber-600 text-center py-4">Nenhuma rotina encontrada para o perfil {perfilCodigo}. Verifique se a migration foi executada.</p>
          )}
          {!loading && preview.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{preview.length} rotinas a gerar</Label>
              <div className="max-h-60 overflow-y-auto space-y-1.5 rounded-lg border p-2">
                {preview.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm px-2 py-1 rounded hover:bg-muted/30">
                    <div>
                      <span className="font-medium">{item.titulo}</span>
                      {item.condicional && (
                        <span className="ml-2 text-xs text-muted-foreground italic">({item.condicional})</span>
                      )}
                    </div>
                    {item.data_vencimento
                      ? <span className="text-xs text-muted-foreground shrink-0">{format(parseISO(item.data_vencimento), "dd/MM/yyyy")}</span>
                      : <span className="text-xs text-amber-500">sem data</span>
                    }
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button
              onClick={handleGerar}
              disabled={!empresaId || preview.length === 0 || generating}
              style={{ backgroundColor: NAVY }}
              className="text-white"
            >
              {generating ? "Gerando..." : `Gerar ${preview.length} Rotinas`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Kanban Card ───────────────────────────────────────────────────────────────
function KanbanCard({ rotina, onClick }: { rotina: Rotina; onClick: () => void }) {
  const hoje = new Date();
  const venc = parseISO(rotina.data_vencimento);
  const diasRestantes = Math.ceil((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  const vencido = diasRestantes < 0;
  const emRisco = !vencido && diasRestantes <= 3;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-3 cursor-pointer hover:shadow-md hover:border-gray-300 transition-all space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-800 leading-snug line-clamp-2">{rotina.titulo}</p>
        <StatusBadge status={rotina.status} />
      </div>
      {rotina.empresas && (
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <Building2 className="h-3 w-3 shrink-0" />
          <span className="truncate">{rotina.empresas.razao_social}</span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs" style={{ color: vencido ? RED : emRisco ? AMBER : "#6b7280" }}>
          <CalendarDays className="h-3 w-3" />
          <span>{vencido ? `Vencido há ${Math.abs(diasRestantes)}d` : diasRestantes === 0 ? "Vence hoje" : `${diasRestantes}d`}</span>
        </div>
        {rotina.responsavel && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <User className="h-3 w-3" />
            <span>{rotina.responsavel.nome.split(" ")[0]}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Rotinas() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: rotinas = [], isLoading } = useRotinas();
  const deleteRotina = useDeleteRotina();

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRotinaId, setSelectedRotinaId] = useState<string | null>(null);
  const selectedRotina = useMemo(
    () => (selectedRotinaId ? (rotinas.find(r => r.id === selectedRotinaId) ?? null) : null),
    [rotinas, selectedRotinaId]
  );
  const [viewMode, setViewMode] = useState<"lista" | "kanban">("lista");

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEmpresa, setFilterEmpresa] = useState("_todos");
  const [filterStatus, setFilterStatus] = useState("_todos");
  const [filterTipo, setFilterTipo] = useState("_todos");
  const [filterMes, setFilterMes] = useState(format(new Date(), "yyyy-MM"));

  // Aux data
  const [empresas, setEmpresas] = useState<{
    id: string; razao_social: string; regime_tributario?: string;
    atividade?: string; possui_prolabore?: boolean; possui_funcionario?: boolean;
  }[]>([]);
  const [equipe, setEquipe] = useState<{ id: string; nome: string; papel_rotinas?: string }[]>([]);
  const [gerarOpen, setGerarOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("empresas")
      .select("id, razao_social, regime_tributario, atividade, possui_prolabore, possui_funcionario")
      .eq("user_id", user.id).order("razao_social")
      .then(({ data }) => setEmpresas((data ?? []) as any[]));
    supabase.from("usuarios_perfil").select("id, nome, papel_rotinas").eq("user_id", user.id).order("nome")
      .then(({ data }) => setEquipe((data ?? []) as { id: string; nome: string; papel_rotinas?: string }[]));
  }, [user]);

  // ── KPIs ──
  const hoje = new Date();
  const mesStart = startOfMonth(parseISO(filterMes + "-01"));
  const mesEnd   = endOfMonth(mesStart);

  const rotinasMes = useMemo(() =>
    rotinas.filter(r => {
      const venc = parseISO(r.data_vencimento);
      return isWithinInterval(venc, { start: mesStart, end: mesEnd });
    }),
    [rotinas, filterMes]
  );

  const kpis = useMemo(() => {
    const pendentes  = rotinasMes.filter(r => !["concluida", "nao_aplicavel"].includes(r.status)).length;
    const atrasadas  = rotinasMes.filter(r => {
      const venc = parseISO(r.data_vencimento);
      return venc < hoje && !["concluida", "nao_aplicavel"].includes(r.status);
    }).length;
    const concluidas = rotinasMes.filter(r => r.status === "concluida").length;
    return { total: rotinasMes.length, pendentes, atrasadas, concluidas };
  }, [rotinasMes]);

  // ── Filtered list ──
  const filtered = useMemo(() => {
    let list = rotinas;

    // Mes filter
    list = list.filter(r => {
      const venc = parseISO(r.data_vencimento);
      return isWithinInterval(venc, { start: mesStart, end: mesEnd });
    });

    if (filterEmpresa !== "_todos") list = list.filter(r => r.empresa_id === filterEmpresa);
    if (filterStatus  !== "_todos") list = list.filter(r => r.status === filterStatus);
    if (filterTipo    !== "_todos") list = list.filter(r => r.tipo === filterTipo);
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter(r =>
        r.titulo.toLowerCase().includes(s) ||
        (r.empresas?.razao_social ?? "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [rotinas, filterEmpresa, filterStatus, filterTipo, searchTerm, filterMes]);

  // ── Kanban grouping ──
  const kanbanCols = useMemo(() => {
    const cols: Record<string, Rotina[]> = { preparar: [], revisar: [], enviar: [], concluido: [] };
    filtered.forEach(r => {
      if (cols[r.etapa] !== undefined) cols[r.etapa].push(r);
    });
    return cols;
  }, [filtered]);

  // ── Tipos únicos para filtro ──
  const tiposDisponiveis = useMemo(() => {
    const set = new Set(rotinas.map(r => r.tipo));
    return Array.from(set).sort();
  }, [rotinas]);

  async function handleDelete(id: string) {
    try {
      await deleteRotina.mutateAsync(id);
      toast({ title: "Rotina excluída." });
      if (selectedRotinaId === id) setSelectedRotinaId(null);
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    }
  }

  const kpiCards = [
    { label: "Total do Mês",  value: kpis.total,     icon: ClipboardList, color: NAVY  },
    { label: "Pendentes",     value: kpis.pendentes,  icon: Clock,         color: AMBER },
    { label: "Em Atraso",     value: kpis.atrasadas,  icon: AlertTriangle, color: RED   },
    { label: "Concluídas",    value: kpis.concluidas, icon: CheckCircle,   color: GREEN },
  ];

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Rotinas</h1>
          <p className="text-sm text-muted-foreground">Gestão de obrigações e tarefas contábeis</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            data={filtered}
            filename="rotinas"
            title="Rotinas"
            columns={[
              { header: "Título",      value: r => r.titulo, width: 2 },
              { header: "Empresa",     value: r => r.empresas?.razao_social, width: 1.5 },
              { header: "Tipo",        value: r => r.tipo.toUpperCase(), width: 0.6 },
              { header: "Competência", value: r => r.competencia ? format(parseISO(r.competencia), "MM/yyyy") : "—" },
              { header: "Vencimento",  value: r => format(parseISO(r.data_vencimento), "dd/MM/yyyy") },
              { header: "Responsável", value: r => r.responsavel?.nome ?? "—" },
              { header: "Status",      value: r => STATUS_CONFIG[r.status]?.label ?? r.status },
            ]}
          />
          <Button onClick={() => setGerarOpen(true)} variant="outline">
            <ClipboardList className="h-4 w-4 mr-2" />
            Gerar do Perfil
          </Button>
          <Button onClick={() => setCreateOpen(true)} style={{ backgroundColor: NAVY }} className="text-white">
            <Plus className="h-4 w-4 mr-2" />
            Nova Rotina
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiCards.map(k => (
          <Card key={k.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-lg p-2" style={{ backgroundColor: k.color + "15" }}>
                <k.icon className="h-5 w-5" style={{ color: k.color }} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="text-2xl font-bold" style={{ color: k.color }}>{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Mês */}
            <div className="min-w-[140px]">
              <Label className="text-xs text-muted-foreground">Mês</Label>
              <Input
                type="month"
                value={filterMes}
                onChange={e => setFilterMes(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            {/* Empresa */}
            <div className="min-w-[200px]">
              <Label className="text-xs text-muted-foreground">Empresa</Label>
              <Select value={filterEmpresa} onValueChange={setFilterEmpresa}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_todos">Todas</SelectItem>
                  {empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.razao_social}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div className="min-w-[160px]">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_todos">Todos</SelectItem>
                  {(Object.entries(STATUS_CONFIG) as [RotinaStatus, { label: string }][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tipo */}
            <div className="min-w-[150px]">
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <Select value={filterTipo} onValueChange={setFilterTipo}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_todos">Todos</SelectItem>
                  {tiposDisponiveis.map(t => <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Título ou empresa..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="h-9 pl-8 text-sm"
                />
              </div>
            </div>

            {/* View toggle */}
            <div className="flex gap-1 ml-auto">
              <Button
                size="sm"
                variant={viewMode === "lista" ? "default" : "outline"}
                style={viewMode === "lista" ? { backgroundColor: NAVY } : {}}
                onClick={() => setViewMode("lista")}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant={viewMode === "kanban" ? "default" : "outline"}
                style={viewMode === "kanban" ? { backgroundColor: NAVY } : {}}
                onClick={() => setViewMode("kanban")}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground">Carregando...</div>
      ) : viewMode === "lista" ? (
        <ListaView rotinas={filtered} onSelect={r => setSelectedRotinaId(r.id)} onDelete={handleDelete} />
      ) : (
        <KanbanView cols={kanbanCols} onSelect={r => setSelectedRotinaId(r.id)} />
      )}

      {/* Detalhe drawer */}
      {selectedRotina && (
        <RotinaDetalhe
          rotina={selectedRotina}
          onClose={() => setSelectedRotinaId(null)}
          onUpdated={() => { /* react-query invalidation auto-refreshes selectedRotina via useMemo */ }}
        />
      )}

      {/* Create dialog */}
      <NovaRotinaDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        empresas={empresas}
        equipe={equipe}
      />

      {/* Gerar rotinas do perfil */}
      <GerarRotinasPerfilDialog
        open={gerarOpen}
        onOpenChange={setGerarOpen}
        empresas={empresas}
        equipe={equipe}
      />
    </div>
  );
}

// ── Lista View ────────────────────────────────────────────────────────────────
function ListaView({
  rotinas,
  onSelect,
  onDelete,
}: {
  rotinas: Rotina[];
  onSelect: (r: Rotina) => void;
  onDelete: (id: string) => void;
}) {
  const hoje = new Date();

  if (rotinas.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
          <ClipboardList className="h-8 w-8 opacity-30" />
          <p className="text-sm">Nenhuma rotina encontrada para os filtros selecionados.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rotinas.map(r => {
              const venc = parseISO(r.data_vencimento);
              const dias = Math.ceil((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
              const vencido = dias < 0 && !["concluida", "nao_aplicavel"].includes(r.status);

              return (
                <TableRow
                  key={r.id}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => onSelect(r)}
                >
                  <TableCell className="font-medium max-w-[220px]">
                    <span className="line-clamp-1">{r.titulo}</span>
                    {r.competencia && (
                      <span className="text-xs text-muted-foreground block">
                        {format(parseISO(r.competencia), "MMM/yyyy", { locale: ptBR })}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[160px]">
                    <span className="line-clamp-1">{r.empresas?.razao_social ?? "—"}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs uppercase">{r.tipo}</Badge>
                  </TableCell>
                  <TableCell>
                    <div>
                      <span className={`text-sm font-medium ${vencido ? "text-red-600" : ""}`}>
                        {format(venc, "dd/MM/yyyy")}
                      </span>
                      {vencido && (
                        <span className="text-xs text-red-500 block">
                          {Math.abs(dias)}d de atraso
                        </span>
                      )}
                      {!vencido && dias >= 0 && dias <= 3 && !["concluida"].includes(r.status) && (
                        <span className="text-xs text-amber-500 block">Vence em {dias}d</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.responsavel?.nome.split(" ")[0] ?? "—"}
                  </TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => onSelect(r)}
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir rotina?</AlertDialogTitle>
                            <AlertDialogDescription>
                              A rotina "{r.titulo}" e todas as suas evidências e comentários serão excluídos permanentemente.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => onDelete(r.id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Kanban View ───────────────────────────────────────────────────────────────
function KanbanView({
  cols,
  onSelect,
}: {
  cols: Record<string, Rotina[]>;
  onSelect: (r: Rotina) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {ETAPA_ORDER.map(etapa => {
        const cfg = ETAPA_CONFIG[etapa];
        const items = cols[etapa] ?? [];
        return (
          <div key={etapa} className="flex flex-col gap-3">
            {/* Column header */}
            <div
              className="flex items-center justify-between px-3 py-2 rounded-lg"
              style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.color}30` }}
            >
              <span className="text-sm font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
              <Badge
                className="text-xs"
                style={{ backgroundColor: cfg.color + "20", color: cfg.color, border: "none" }}
              >
                {items.length}
              </Badge>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-2 min-h-[120px]">
              {items.length === 0 ? (
                <div className="flex items-center justify-center h-16 rounded-lg border border-dashed border-gray-200 text-xs text-gray-400">
                  Nenhuma tarefa
                </div>
              ) : (
                items.map(r => (
                  <KanbanCard key={r.id} rotina={r} onClick={() => onSelect(r)} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
