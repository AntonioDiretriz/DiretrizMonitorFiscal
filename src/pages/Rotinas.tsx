import { useState, useEffect, useMemo } from "react";
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO, addMonths, setDate, subDays, getDaysInMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus, Search, ClipboardList, Clock, AlertTriangle,
  CheckCircle, LayoutGrid, List, ChevronRight, Building2, User,
  CalendarDays, Trash2, Sparkles, Upload, FileText,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  useRotinas, useCreateRotina, useDeleteRotina,
  useGerarObrigacoes,
  type Rotina, type RotinaStatus, type RotinaRisco,
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

// ── Criar Rotina Dialog ───────────────────────────────────────────────────────
interface ObrigacaoItem {
  id: string;
  nome_rotina: string;
  codigo_rotina: string;
  tipo_rotina: string;
  departamento: string;
  periodicidade: string;
  dia_vencimento: number | null;
  meses_offset: number | null;
  margem_seguranca: number | null;
  // configuração editável pelo usuário
  incluir: boolean;
  dia_legal: string;      // dia do mês — vencimento legal
  dia_interno: string;    // dia do mês — prazo interno
}

function calcDataFromDia(competencia: string, diaStr: string, mesesOffset: number): string {
  if (!competencia || !diaStr) return "";
  const dia = parseInt(diaStr, 10);
  if (isNaN(dia) || dia < 1 || dia > 31) return "";
  const refMes = parseISO(competencia + "-01");
  const mesPag = addMonths(refMes, mesesOffset);
  const maxDia = getDaysInMonth(mesPag);
  return format(setDate(mesPag, Math.min(dia, maxDia)), "yyyy-MM-dd");
}

interface NovaRotinaDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  empresas: { id: string; razao_social: string }[];
  equipe: { id: string; nome: string; papel_rotinas?: string }[];
}

const DEPT_COLORS: Record<string, string> = {
  Fiscal: "#3b82f6", Contábil: "#8b5cf6", DP: "#f59e0b",
  Gestão: "#22c55e", Legalização: "#6b7280", Financeiro: "#ec4899",
};

function NovaRotinaDialog({ open, onOpenChange, empresas, equipe }: NovaRotinaDialogProps) {
  const { toast } = useToast();
  const createRotina = useCreateRotina();

  const [modo, setModo] = useState<"perfil" | "manual">("perfil");
  const [empresaId, setEmpresaId] = useState("");
  const [competencia, setCompetencia] = useState(format(startOfMonth(new Date()), "yyyy-MM"));
  const [responsavelId, setResponsavelId] = useState("");
  const [obrigacoes, setObrigacoes] = useState<ObrigacaoItem[]>([]);
  const [loadingObs, setLoadingObs] = useState(false);
  const [creating, setCreating] = useState(false);

  // Modo manual
  const [manual, setManual] = useState({
    titulo: "", tipo: "", data_vencimento: "", data_vencimento_interno: "",
    responsavel_id: "", observacao: "",
  });

  function reset() {
    setEmpresaId(""); setObrigacoes([]); setResponsavelId("");
    setCompetencia(format(startOfMonth(new Date()), "yyyy-MM"));
    setManual({ titulo: "", tipo: "", data_vencimento: "", data_vencimento_interno: "", responsavel_id: "", observacao: "" });
  }

  // Carrega obrigações do motor quando empresa muda
  useEffect(() => {
    if (!empresaId || modo !== "perfil") return;
    setLoadingObs(true);
    setObrigacoes([]);
    (supabase as any).rpc("motor_ativacao", { p_empresa_id: empresaId }).then(({ data, error }: any) => {
      if (error) { toast({ title: "Erro ao carregar perfil", description: error.message, variant: "destructive" }); setLoadingObs(false); return; }
      const items: ObrigacaoItem[] = (data ?? []).map((r: any) => {
        const diaLegal = r.dia_vencimento ? String(r.dia_vencimento) : "";
        const diaInt = r.dia_vencimento && r.margem_seguranca
          ? String(Math.max(1, r.dia_vencimento - r.margem_seguranca))
          : diaLegal;
        return { ...r, incluir: true, dia_legal: diaLegal, dia_interno: diaInt };
      });
      setObrigacoes(items);
      setLoadingObs(false);
    });
  }, [empresaId, modo]);

  function toggleAll(dept: string, value: boolean) {
    setObrigacoes(prev => prev.map(o => o.departamento === dept ? { ...o, incluir: value } : o));
  }

  function updateOb(id: string, field: keyof ObrigacaoItem, value: any) {
    setObrigacoes(prev => prev.map(o => o.id === id ? { ...o, [field]: value } : o));
  }

  async function handleCriarPorPerfil() {
    const selecionadas = obrigacoes.filter(o => o.incluir);
    if (!empresaId || selecionadas.length === 0) return;
    setCreating(true);
    let criadas = 0;
    try {
      for (const ob of selecionadas) {
        const offset = ob.meses_offset ?? 1;
        const dataVenc = calcDataFromDia(competencia, ob.dia_legal, offset);
        const dataInt  = calcDataFromDia(competencia, ob.dia_interno, offset);
        if (!dataVenc) continue;
        await createRotina.mutateAsync({
          empresa_id: empresaId,
          catalogo_id: null,
          titulo: `${ob.nome_rotina} — ${format(parseISO(competencia + "-01"), "MMM/yyyy", { locale: ptBR })}`,
          tipo: ob.tipo_rotina,
          competencia: competencia + "-01",
          data_vencimento: dataVenc,
          data_vencimento_interno: dataInt || null,
          responsavel_id: (responsavelId && responsavelId !== "_none") ? responsavelId : null,
          revisor_id: null,
          observacao: null,
        });
        criadas++;
      }
      toast({ title: `${criadas} rotina${criadas !== 1 ? "s" : ""} criada${criadas !== 1 ? "s" : ""}!` });
      onOpenChange(false);
      reset();
    } catch (err: any) {
      toast({ title: "Erro ao criar rotinas", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function handleCriarManual(e: React.FormEvent) {
    e.preventDefault();
    if (!manual.titulo || !manual.tipo || !manual.data_vencimento) {
      toast({ title: "Preencha título, tipo e vencimento.", variant: "destructive" }); return;
    }
    try {
      await createRotina.mutateAsync({
        empresa_id: empresaId || null,
        catalogo_id: null,
        titulo: manual.titulo, tipo: manual.tipo,
        competencia: competencia + "-01",
        data_vencimento: manual.data_vencimento,
        data_vencimento_interno: manual.data_vencimento_interno || null,
        responsavel_id: (manual.responsavel_id && manual.responsavel_id !== "_none") ? manual.responsavel_id : null,
        revisor_id: null, observacao: manual.observacao || null,
      });
      toast({ title: "Rotina criada!" });
      onOpenChange(false); reset();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  }

  // Agrupamento por departamento
  const grupos = useMemo(() => {
    const map: Record<string, ObrigacaoItem[]> = {};
    obrigacoes.forEach(o => { if (!map[o.departamento]) map[o.departamento] = []; map[o.departamento].push(o); });
    return map;
  }, [obrigacoes]);

  const totalSelecionadas = obrigacoes.filter(o => o.incluir).length;

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle style={{ color: NAVY }}>Nova Rotina</DialogTitle>
        </DialogHeader>

        {/* Modo tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
          <button
            onClick={() => setModo("perfil")}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${modo === "perfil" ? "bg-white shadow text-gray-900" : "text-muted-foreground hover:text-gray-700"}`}
          >
            Por Perfil
          </button>
          <button
            onClick={() => setModo("manual")}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${modo === "manual" ? "bg-white shadow text-gray-900" : "text-muted-foreground hover:text-gray-700"}`}
          >
            Manual
          </button>
        </div>

        {/* ── MODO PERFIL ── */}
        {modo === "perfil" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <Label className="text-xs text-muted-foreground">Empresa *</Label>
                <Select value={empresaId} onValueChange={setEmpresaId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.razao_social}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Competência *</Label>
                <Input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} className="h-9" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Responsável</Label>
                <Select value={responsavelId} onValueChange={setResponsavelId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Nenhum —</SelectItem>
                    {equipe.filter(u => ["responsavel", "ambos"].includes(u.papel_rotinas ?? "")).map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!empresaId && (
              <p className="text-sm text-muted-foreground text-center py-6">Selecione uma empresa para ver as obrigações do perfil.</p>
            )}

            {loadingObs && (
              <p className="text-sm text-muted-foreground text-center py-6">Carregando perfil tributário...</p>
            )}

            {!loadingObs && empresaId && obrigacoes.length === 0 && (
              <p className="text-sm text-amber-600 text-center py-6">Nenhuma obrigação encontrada. Configure o perfil tributário da empresa primeiro.</p>
            )}

            {!loadingObs && obrigacoes.length > 0 && (
              <div className="space-y-3">
                {/* Legenda de colunas */}
                <div className="grid grid-cols-[auto_1fr_80px_80px] gap-2 px-3 text-[10px] text-muted-foreground uppercase tracking-wide">
                  <span className="w-5" />
                  <span>Obrigação</span>
                  <span className="text-center">Venc. legal<br/><span className="text-[9px] normal-case">(dia do mês)</span></span>
                  <span className="text-center">Prazo interno<br/><span className="text-[9px] normal-case">(dia do mês)</span></span>
                </div>

                {Object.entries(grupos).map(([dept, items]) => {
                  const color = DEPT_COLORS[dept] ?? "#6b7280";
                  const allOn = items.every(o => o.incluir);
                  return (
                    <div key={dept} className="rounded-lg border overflow-hidden">
                      {/* Header do grupo */}
                      <div className="flex items-center justify-between px-3 py-2" style={{ backgroundColor: color + "12" }}>
                        <span className="text-xs font-semibold" style={{ color }}>{dept}</span>
                        <button
                          onClick={() => toggleAll(dept, !allOn)}
                          className="text-[10px] underline text-muted-foreground hover:text-gray-700"
                        >
                          {allOn ? "Desmarcar todos" : "Marcar todos"}
                        </button>
                      </div>
                      {/* Linhas */}
                      {items.map(ob => (
                        <div
                          key={ob.id}
                          className={`grid grid-cols-[auto_1fr_80px_80px] gap-2 items-center px-3 py-2 border-t text-sm ${!ob.incluir ? "opacity-40" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={ob.incluir}
                            onChange={e => updateOb(ob.id, "incluir", e.target.checked)}
                            className="h-4 w-4 accent-[#10143D] cursor-pointer"
                          />
                          <div>
                            <span className="font-medium text-gray-800">{ob.nome_rotina}</span>
                            <span className="ml-2 text-[10px] uppercase text-muted-foreground px-1 py-0.5 rounded bg-muted">{ob.tipo_rotina}</span>
                            {ob.meses_offset && ob.meses_offset > 0 && (
                              <span className="ml-1 text-[10px] text-muted-foreground">+{ob.meses_offset}m</span>
                            )}
                          </div>
                          <input
                            type="number"
                            min={1} max={31}
                            value={ob.dia_legal}
                            disabled={!ob.incluir}
                            onChange={e => updateOb(ob.id, "dia_legal", e.target.value)}
                            className="w-full text-center border rounded px-1 py-1 text-sm disabled:cursor-not-allowed"
                            placeholder="dia"
                          />
                          <input
                            type="number"
                            min={1} max={31}
                            value={ob.dia_interno}
                            disabled={!ob.incluir}
                            onChange={e => updateOb(ob.id, "dia_interno", e.target.value)}
                            className="w-full text-center border rounded px-1 py-1 text-sm disabled:cursor-not-allowed"
                            placeholder="dia"
                          />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button
                onClick={handleCriarPorPerfil}
                disabled={!empresaId || totalSelecionadas === 0 || creating}
                style={{ backgroundColor: NAVY }}
                className="text-white"
              >
                {creating ? "Criando..." : `Criar ${totalSelecionadas} Rotina${totalSelecionadas !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        )}

        {/* ── MODO MANUAL ── */}
        {modo === "manual" && (
          <form onSubmit={handleCriarManual} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Empresa</Label>
                <Select value={empresaId} onValueChange={setEmpresaId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar empresa" /></SelectTrigger>
                  <SelectContent>
                    {empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.razao_social}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Competência</Label>
                <Input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Título *</Label>
                <Input value={manual.titulo} onChange={e => setManual(p => ({ ...p, titulo: e.target.value }))} placeholder="Ex: FGTS — Abr/2026" required />
              </div>
              <div>
                <Label>Tipo *</Label>
                <Input value={manual.tipo} onChange={e => setManual(p => ({ ...p, tipo: e.target.value }))} placeholder="das, fgts, inss..." required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Vencimento Legal *</Label>
                <Input type="date" value={manual.data_vencimento} onChange={e => setManual(p => ({ ...p, data_vencimento: e.target.value }))} required />
              </div>
              <div>
                <Label>Prazo Interno</Label>
                <Input type="date" value={manual.data_vencimento_interno} onChange={e => setManual(p => ({ ...p, data_vencimento_interno: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Responsável</Label>
              <Select value={manual.responsavel_id} onValueChange={v => setManual(p => ({ ...p, responsavel_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Nenhum —</SelectItem>
                  {equipe.filter(u => ["responsavel", "ambos"].includes(u.papel_rotinas ?? "")).map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observação</Label>
              <Textarea value={manual.observacao} onChange={e => setManual(p => ({ ...p, observacao: e.target.value }))} rows={2} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" style={{ backgroundColor: NAVY }} disabled={createRotina.isPending}>
                {createRotina.isPending ? "Criando..." : "Criar Rotina"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers (shared) ─────────────────────────────────────────────────────────
function resolvePerfilCodigo(regime: string, atividade: string, _prolabore: boolean, funcionario: boolean): string {
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
        .eq("codigo_perfil", perfilCodigo)
        .single();

      if (!perfil) { setPreview([]); setLoading(false); return; }

      // Busca rotinas do catálogo vinculadas ao perfil
      const { data: links } = await (supabase as any)
        .from("perfil_rotina")
        .select("ordem_execucao, condicional, rotina_modelo(id, nome_rotina, tipo_rotina, dia_vencimento, meses_offset, margem_seguranca, periodicidade)")
        .eq("perfil_modelo_id", perfil.id)
        .order("ordem_execucao");

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
          catalogo_id: null,   // rotina_modelo ≠ catalogo_obrigacoes
          titulo: `${rm.nome_rotina} — ${format(refMes, "MMM/yyyy", { locale: ptBR })}`,
          tipo: rm.tipo_rotina ?? "outro",
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
          responsavel_id: (responsavelId && responsavelId !== "_none") ? responsavelId : null,
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

// ── Risco Badge ───────────────────────────────────────────────────────────────
const RISCO_CONFIG: Record<RotinaRisco, { label: string; color: string }> = {
  baixo:  { label: "Baixo",   color: "#22c55e" },
  medio:  { label: "Médio",   color: "#f59e0b" },
  alto:   { label: "Alto",    color: "#ef4444" },
  critico: { label: "Crítico", color: "#7c3aed" },
};

function RiscoBadge({ risco }: { risco: RotinaRisco }) {
  const cfg = RISCO_CONFIG[risco] ?? RISCO_CONFIG.baixo;
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
      style={{ backgroundColor: cfg.color + "20", color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

// ── Gerar Obrigações (RPC) Dialog ─────────────────────────────────────────────
interface GerarRPCDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  empresas: { id: string; razao_social: string }[];
}

function GerarObrigacoesRPCDialog({ open, onOpenChange, empresas }: GerarRPCDialogProps) {
  const { toast } = useToast();
  const gerarObrigacoes = useGerarObrigacoes();
  const [empresaId, setEmpresaId] = useState("");
  const [competencia, setCompetencia] = useState(format(startOfMonth(new Date()), "yyyy-MM"));
  const [geradas, setGeradas] = useState<number | null>(null);

  function handleClose(v: boolean) {
    onOpenChange(v);
    if (!v) { setEmpresaId(""); setGeradas(null); }
  }

  async function handleGerar() {
    if (!empresaId) return;
    try {
      const count = await gerarObrigacoes.mutateAsync({
        empresa_id: empresaId,
        competencia: competencia + "-01",
      });
      setGeradas(count);
      toast({ title: `${count} obrigações geradas com sucesso!` });
    } catch (err: any) {
      toast({ title: "Erro ao gerar obrigações", description: err.message, variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle style={{ color: NAVY }} className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Gerar Obrigações Automáticas
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">
            Gera as obrigações do mês com base no regime tributário e perfil da empresa.
          </p>
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

          {geradas !== null && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
              <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
              {geradas > 0
                ? `${geradas} obrigações geradas para a competência.`
                : "Nenhuma nova obrigação gerada (já existem ou perfil não configurado)."}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>Fechar</Button>
            <Button
              onClick={handleGerar}
              disabled={!empresaId || gerarObrigacoes.isPending}
              style={{ backgroundColor: NAVY }}
              className="text-white"
            >
              {gerarObrigacoes.isPending ? "Gerando..." : "Gerar Obrigações"}
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
  const { user, ownerUserId } = useAuth();
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
  const [selectedEmpresaId, setSelectedEmpresaId] = useState("_todos");
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
  const [gerarRPCOpen, setGerarRPCOpen] = useState(false);

  // Processar comprovante
  const [compOpen, setCompOpen]       = useState(false);
  const [compFile, setCompFile]       = useState<File | null>(null);
  const [compLoading, setCompLoading] = useState(false);
  const [compResult, setCompResult]   = useState<any>(null);
  const [compMatch, setCompMatch]     = useState<Rotina | null>(null);

  function findRotinaMatch(extracted: any): Rotina | null {
    let candidates = rotinas.filter(r =>
      !["concluida", "nao_aplicavel"].includes(r.status) &&
      r.tipo.toLowerCase() === (extracted.tipo ?? "").toLowerCase()
    );
    if (extracted.competencia && candidates.length > 1) {
      const exact = candidates.filter(r => r.competencia?.slice(0, 7) === extracted.competencia.slice(0, 7));
      if (exact.length > 0) candidates = exact;
    }
    if (extracted.empresa && candidates.length > 1) {
      const nome = extracted.empresa.toLowerCase().trim();
      const byName = candidates.filter(r => {
        const razao = (r.empresas?.razao_social ?? "").toLowerCase();
        return razao.includes(nome.slice(0, 8)) || nome.includes(razao.slice(0, 8));
      });
      if (byName.length > 0) candidates = byName;
    }
    return candidates[0] ?? null;
  }

  async function handleProcessarComprovante() {
    if (!compFile) return;
    setCompLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", compFile);
      fd.append("user_id", ownerUserId ?? "");
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/processar-comprovante`,
        { method: "POST", headers: { Authorization: `Bearer ${session?.access_token}` }, body: fd }
      );
      const result = await res.json();
      if (!res.ok || result.error) {
        toast({ title: "Erro ao processar", description: result.error, variant: "destructive" });
        return;
      }
      setCompResult(result);
      setCompMatch(findRotinaMatch(result));
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setCompLoading(false);
    }
  }

  async function handleConfirmarBaixaRotina() {
    if (!compMatch || !compResult) return;
    const dataPag = compResult.data_pagamento || format(new Date(), "yyyy-MM-dd");
    const { error } = await (supabase as any).from("rotinas")
      .update({
        status: "concluida", etapa: "concluido",
        valor: compResult.valor ?? compMatch.valor,
        observacao: compResult.numero_autenticacao ? `Protocolo: ${compResult.numero_autenticacao}` : compMatch.observacao,
      })
      .eq("id", compMatch.id);
    if (error) { toast({ title: "Erro ao dar baixa", variant: "destructive" }); return; }
    toast({ title: "Baixa automática realizada!", description: `${compMatch.titulo} concluída via comprovante.` });
    setCompOpen(false); setCompFile(null); setCompResult(null); setCompMatch(null);
  }

  useEffect(() => {
    if (!user) return;
    supabase.from("empresas")
      .select("id, razao_social, regime_tributario, atividade, possui_prolabore, possui_funcionario")
      .order("razao_social")
      .then(({ data }) => setEmpresas((data ?? []) as any[]));
    supabase.from("usuarios_perfil").select("id, nome, papel_rotinas").eq("user_id", ownerUserId ?? user.id).order("nome")
      .then(({ data }) => setEquipe((data ?? []) as unknown as { id: string; nome: string; papel_rotinas?: string }[]));
  }, [user]);

  // ── KPIs ──
  const hoje = new Date();
  const mesStart = startOfMonth(parseISO(filterMes + "-01"));
  const mesEnd   = endOfMonth(mesStart);

  // Filtra por competência (quando existe) ou data_vencimento como fallback
  function rotinaMatchesMes(r: Rotina, start: Date, end: Date): boolean {
    if (r.competencia) {
      const comp = parseISO(r.competencia);
      return isWithinInterval(comp, { start, end });
    }
    const venc = parseISO(r.data_vencimento);
    return isWithinInterval(venc, { start, end });
  }

  const rotinasMes = useMemo(() =>
    rotinas.filter(r => rotinaMatchesMes(r, mesStart, mesEnd)),
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

    // Mes filter (por competência ou vencimento)
    list = list.filter(r => rotinaMatchesMes(r, mesStart, mesEnd));

    if (selectedEmpresaId !== "_todos") list = list.filter(r => r.empresa_id === selectedEmpresaId);
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
  }, [rotinas, selectedEmpresaId, filterStatus, filterTipo, searchTerm, filterMes]);

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

  // ── Contagem de rotinas por empresa no mês ──
  const contByEmpresa = useMemo(() => {
    const map: Record<string, { total: number; atrasadas: number; pendentes: number }> = {};
    const hoje = new Date();
    rotinasMes.forEach(r => {
      const eid = r.empresa_id ?? "_sem_empresa";
      if (!map[eid]) map[eid] = { total: 0, atrasadas: 0, pendentes: 0 };
      map[eid].total++;
      if (!["concluida", "nao_aplicavel"].includes(r.status)) {
        map[eid].pendentes++;
        if (parseISO(r.data_vencimento) < hoje) map[eid].atrasadas++;
      }
    });
    return map;
  }, [rotinasMes]);

  const empresaAtual = selectedEmpresaId !== "_todos"
    ? empresas.find(e => e.id === selectedEmpresaId)
    : null;

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
    <div className="flex-1 flex flex-col p-6 gap-4 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
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
          <Button onClick={() => { setCompOpen(true); setCompResult(null); setCompFile(null); setCompMatch(null); }} variant="outline">
            <Upload className="h-4 w-4 mr-2" />
            Processar Comprovante
          </Button>
          <Button onClick={() => setGerarRPCOpen(true)} variant="outline">
            <Sparkles className="h-4 w-4 mr-2" />
            Gerar Automático
          </Button>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
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

      {/* Main two-panel layout */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* ── Left: company list ── */}
        <div className="w-60 shrink-0 flex flex-col gap-2">
          {/* Month picker */}
          <div>
            <Label className="text-xs text-muted-foreground">Competência</Label>
            <Input
              type="month"
              value={filterMes}
              onChange={e => setFilterMes(e.target.value)}
              className="h-9 text-sm mt-1"
            />
          </div>

          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-1">Empresas</p>

          <div className="flex flex-col gap-1 overflow-y-auto">
            {/* "Todas" option */}
            <button
              onClick={() => setSelectedEmpresaId("_todos")}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                selectedEmpresaId === "_todos"
                  ? "text-white font-semibold"
                  : "hover:bg-muted text-gray-700"
              }`}
              style={selectedEmpresaId === "_todos" ? { backgroundColor: NAVY } : {}}
            >
              <span className="truncate">Todas as empresas</span>
              <span className={`text-xs ml-1 shrink-0 font-bold ${selectedEmpresaId === "_todos" ? "text-white/80" : "text-gray-400"}`}>
                {rotinasMes.length}
              </span>
            </button>

            {/* Per-company rows */}
            {empresas
              .filter(e => (contByEmpresa[e.id]?.total ?? 0) > 0)
              .map(e => {
                const c = contByEmpresa[e.id] ?? { total: 0, atrasadas: 0, pendentes: 0 };
                const isActive = selectedEmpresaId === e.id;
                return (
                  <button
                    key={e.id}
                    onClick={() => setSelectedEmpresaId(e.id)}
                    className={`flex items-start justify-between px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                      isActive ? "text-white font-semibold" : "hover:bg-muted text-gray-700"
                    }`}
                    style={isActive ? { backgroundColor: NAVY } : {}}
                  >
                    <span className="truncate flex-1 leading-snug">{e.razao_social}</span>
                    <div className="flex flex-col items-end ml-1 shrink-0 gap-0.5">
                      <span className={`text-xs font-bold ${isActive ? "text-white/80" : "text-gray-400"}`}>{c.total}</span>
                      {c.atrasadas > 0 && (
                        <span className={`text-[10px] font-semibold ${isActive ? "text-red-200" : "text-red-500"}`}>
                          {c.atrasadas} atr.
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            }

            {/* Empresas sem rotinas no mês */}
            {empresas
              .filter(e => !(contByEmpresa[e.id]?.total > 0))
              .map(e => {
                const isActive = selectedEmpresaId === e.id;
                return (
                  <button
                    key={e.id}
                    onClick={() => setSelectedEmpresaId(e.id)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                      isActive ? "text-white font-semibold" : "hover:bg-muted text-gray-400"
                    }`}
                    style={isActive ? { backgroundColor: NAVY } : {}}
                  >
                    <span className="truncate">{e.razao_social}</span>
                    <span className="text-xs ml-1 shrink-0">0</span>
                  </button>
                );
              })
            }
          </div>
        </div>

        {/* ── Right: rotinas panel ── */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">

          {/* Sub-header: empresa selecionada + filtros */}
          <div className="flex flex-wrap items-end gap-2">
            {empresaAtual && (
              <div className="flex items-center gap-2 mr-2">
                <Building2 className="h-4 w-4 shrink-0" style={{ color: NAVY }} />
                <span className="font-semibold text-sm" style={{ color: NAVY }}>{empresaAtual.razao_social}</span>
                <button
                  className="text-xs text-muted-foreground hover:text-gray-600 underline"
                  onClick={() => setSelectedEmpresaId("_todos")}
                >
                  ver todas
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-2 flex-1 items-end">
              {/* Status */}
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 text-xs w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_todos">Todos os status</SelectItem>
                  {(Object.entries(STATUS_CONFIG) as [RotinaStatus, { label: string }][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Tipo */}
              <Select value={filterTipo} onValueChange={setFilterTipo}>
                <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_todos">Todos os tipos</SelectItem>
                  {tiposDisponiveis.map(t => <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>)}
                </SelectContent>
              </Select>

              {/* Search */}
              <div className="relative flex-1 min-w-[160px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar título..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>

              {/* View toggle */}
              <div className="flex gap-1 ml-auto">
                <Button size="sm" variant={viewMode === "lista" ? "default" : "outline"}
                  style={viewMode === "lista" ? { backgroundColor: NAVY } : {}}
                  onClick={() => setViewMode("lista")} className="h-8 w-8 p-0">
                  <List className="h-4 w-4" />
                </Button>
                <Button size="sm" variant={viewMode === "kanban" ? "default" : "outline"}
                  style={viewMode === "kanban" ? { backgroundColor: NAVY } : {}}
                  onClick={() => setViewMode("kanban")} className="h-8 w-8 p-0">
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground">Carregando...</div>
          ) : viewMode === "lista" ? (
            <ListaView rotinas={filtered} onSelect={r => setSelectedRotinaId(r.id)} onDelete={handleDelete} />
          ) : (
            <KanbanView cols={kanbanCols} onSelect={r => setSelectedRotinaId(r.id)} />
          )}
        </div>
      </div>

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

      {/* Gerar obrigações automáticas (RPC) */}
      <GerarObrigacoesRPCDialog
        open={gerarRPCOpen}
        onOpenChange={setGerarRPCOpen}
        empresas={empresas}
      />

      {/* Processar Comprovante com IA */}
      <Dialog open={compOpen} onOpenChange={v => { if (!v) { setCompOpen(false); setCompResult(null); setCompFile(null); setCompMatch(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-violet-500" /> Processar Comprovante com IA
            </DialogTitle>
          </DialogHeader>

          {!compResult ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Envie o comprovante de pagamento (PDF ou imagem). A IA irá extrair os dados e dar baixa automática na tarefa correspondente.
              </p>
              <div
                className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => document.getElementById("upload-comp-rotina")?.click()}
              >
                <Upload className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
                {compFile ? (
                  <p className="text-sm font-medium">{compFile.name}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Clique para selecionar PDF ou imagem</p>
                )}
                <input
                  id="upload-comp-rotina"
                  type="file"
                  accept=".pdf,image/*"
                  className="hidden"
                  onChange={e => setCompFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setCompOpen(false)}>Cancelar</Button>
                <Button className="flex-1" disabled={!compFile || compLoading} onClick={handleProcessarComprovante}>
                  {compLoading ? "Processando..." : <><Sparkles className="mr-2 h-4 w-4" /> Analisar com IA</>}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border bg-violet-50/40 p-4 space-y-2">
                <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide mb-2">Dados extraídos</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <span className="text-muted-foreground">Tipo</span>
                  <span className="font-medium uppercase">{compResult.tipo ?? "—"}</span>
                  <span className="text-muted-foreground">Empresa</span>
                  <span className="font-medium">{compResult.empresa ?? "—"}</span>
                  <span className="text-muted-foreground">Competência</span>
                  <span className="font-medium">{compResult.competencia ? format(parseISO(compResult.competencia), "MM/yyyy") : "—"}</span>
                  <span className="text-muted-foreground">Valor pago</span>
                  <span className="font-medium">{compResult.valor != null ? Number(compResult.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</span>
                  <span className="text-muted-foreground">Data pagamento</span>
                  <span className="font-medium">{compResult.data_pagamento ? format(parseISO(compResult.data_pagamento), "dd/MM/yyyy") : "—"}</span>
                  {compResult.numero_autenticacao && <>
                    <span className="text-muted-foreground">Protocolo</span>
                    <span className="font-medium">{compResult.numero_autenticacao}</span>
                  </>}
                </div>
              </div>

              {compMatch ? (
                <div className="rounded-lg border border-green-200 bg-green-50/40 p-3">
                  <p className="text-xs font-semibold text-green-700 mb-1">Tarefa encontrada</p>
                  <p className="text-sm font-medium">{compMatch.titulo}</p>
                  <p className="text-xs text-muted-foreground">
                    {compMatch.empresas?.razao_social} · Vence {format(parseISO(compMatch.data_vencimento), "dd/MM/yyyy")}
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
                  <p className="text-xs font-semibold text-amber-700 mb-1">Nenhuma tarefa pendente encontrada</p>
                  <p className="text-xs text-muted-foreground">Verifique se a tarefa está cadastrada e pendente.</p>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setCompResult(null); setCompFile(null); setCompMatch(null); }}>
                  Tentar outro arquivo
                </Button>
                <Button className="flex-1" disabled={!compMatch} onClick={handleConfirmarBaixaRotina}>
                  <CheckCircle className="mr-2 h-4 w-4" /> Confirmar Baixa
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
              <TableHead>Risco</TableHead>
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
                    <RiscoBadge risco={r.risco} />
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
