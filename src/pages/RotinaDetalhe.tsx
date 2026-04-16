import { useState } from "react";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  X, CheckCircle, Clock, AlertTriangle, Send, Eye, FileText,
  MessageSquare, Plus, Link, Trash2, ListChecks, ShieldAlert, Upload, Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  useUpdateRotina, useCreateEvidencia, useCreateComentario,
  useRotinaEvidencias, useRotinaComentarios, useRotinaTarefas,
  useCreateTarefa, useUpdateTarefa, useDeleteTarefa,
  type Rotina, type RotinaEtapa, type RotinaStatus,
} from "@/hooks/useRotinas";

// ── Palette ───────────────────────────────────────────────────────────────────
const NAVY  = "#10143D";
const RED   = "#ED3237";
const GREEN = "#22c55e";
const AMBER = "#f59e0b";
const BLUE  = "#3b82f6";
const GRAY  = "#6b7280";

// ── Status config ─────────────────────────────────────────────────────────────
export const STATUS_CONFIG: Record<RotinaStatus, { label: string; color: string }> = {
  pendente:            { label: "Não Iniciado",        color: GRAY    },
  em_preparacao:       { label: "Em Andamento",        color: BLUE    },
  aguardando_cliente:  { label: "Aguard. Cliente",     color: "#a855f7" },
  aguardando_sistema:  { label: "Aguard. Sistema/Gov", color: "#6366f1" },
  em_revisao:          { label: "Em Revisão",          color: AMBER   },
  devolvida:           { label: "Devolvida",           color: "#f97316" },
  pronta_envio:        { label: "Pronta p/ Envio",     color: "#22d3ee" },
  concluida:           { label: "Concluída",           color: GREEN   },
  em_risco:            { label: "Em Risco",            color: AMBER   },
  atrasada:            { label: "Em Atraso",           color: RED     },
  cancelada:           { label: "Cancelada",           color: GRAY    },
  nao_aplicavel:       { label: "Não Aplicável",       color: GRAY    },
};

export const RISCO_CONFIG = {
  baixo:   { label: "Baixo",   color: GREEN  },
  medio:   { label: "Médio",   color: AMBER  },
  alto:    { label: "Alto",    color: "#f97316" },
  critico: { label: "Crítico", color: RED    },
};

export const RESP_ERRO_CONFIG = {
  escritorio: "Escritório",
  cliente:    "Cliente",
  sistema:    "Sistema",
  governo:    "Governo",
};

export function StatusBadge({ status }: { status: RotinaStatus }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: GRAY };
  return (
    <Badge style={{ backgroundColor: cfg.color + "20", color: cfg.color, border: `1px solid ${cfg.color}40` }}>
      {cfg.label}
    </Badge>
  );
}

export function RiscoBadge({ risco }: { risco?: string }) {
  if (!risco) return null;
  const cfg = RISCO_CONFIG[risco as keyof typeof RISCO_CONFIG] ?? { label: risco, color: GRAY };
  return (
    <Badge variant="outline" style={{ color: cfg.color, borderColor: cfg.color + "60" }}>
      <ShieldAlert className="h-3 w-3 mr-1" />{cfg.label}
    </Badge>
  );
}

// ── Etapas do workflow ────────────────────────────────────────────────────────
const ETAPAS: { id: RotinaEtapa; label: string; icon: React.ElementType }[] = [
  { id: "preparar",  label: "Preparar",  icon: FileText    },
  { id: "revisar",   label: "Revisar",   icon: Eye         },
  { id: "enviar",    label: "Enviar",    icon: Send        },
  { id: "concluido", label: "Concluído", icon: CheckCircle },
];

const ETAPA_NEXT: Record<RotinaEtapa, { etapa: RotinaEtapa; status: RotinaStatus; label: string } | null> = {
  preparar:  { etapa: "revisar",   status: "em_revisao",   label: "Enviar para Revisão" },
  revisar:   { etapa: "enviar",    status: "pronta_envio", label: "Aprovar para Envio"  },
  enviar:    { etapa: "concluido", status: "concluida",    label: "Confirmar Envio"     },
  concluido: null,
};

// ── RotinaDetalhe ─────────────────────────────────────────────────────────────
interface Props {
  rotina: Rotina;
  onClose: () => void;
  onUpdated: () => void;
}

export default function RotinaDetalhe({ rotina, onClose, onUpdated }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const updateRotina = useUpdateRotina();
  const createEvid   = useCreateEvidencia();
  const createComent = useCreateComentario();
  const createTarefa = useCreateTarefa();
  const updateTarefa = useUpdateTarefa();
  const deleteTarefa = useDeleteTarefa();

  const { data: evidencias  = [] } = useRotinaEvidencias(rotina.id);
  const { data: comentarios = [] } = useRotinaComentarios(rotina.id);
  const { data: tarefas     = [] } = useRotinaTarefas(rotina.id);

  const [novoComentario, setNovoComentario] = useState("");
  const [evidForm, setEvidForm] = useState({ tipo: "comprovante", numero_protocolo: "", observacao: "" });
  const [devolvendo, setDevolvendo]   = useState(false);
  const [motivoDevolucao, setMotivoDevolucao] = useState("");
  const [novaTarefa, setNovaTarefa]   = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);

  const today = new Date();
  const venc  = new Date(rotina.data_vencimento + "T12:00:00");
  const dias  = differenceInDays(venc, today);
  const atrasada = dias < 0 && rotina.status !== "concluida";
  const prazoInt = rotina.prazo_interno
    ? new Date(rotina.prazo_interno + "T12:00:00") : null;

  const etapaAtual = ETAPAS.findIndex(e => e.id === rotina.etapa);
  const next = ETAPA_NEXT[rotina.etapa];

  // Progresso das tarefas
  const tarefasConcluidas = tarefas.filter(t => t.status === "concluida").length;
  const pct = tarefas.length > 0 ? Math.round((tarefasConcluidas / tarefas.length) * 100) : 0;

  const avancar = async () => {
    if (!next) return;
    if (rotina.etapa === "enviar" && evidencias.length === 0) {
      toast({ title: "Adicione ao menos uma evidência antes de concluir.", variant: "destructive" });
      return;
    }
    try {
      await updateRotina.mutateAsync({ id: rotina.id, etapa: next.etapa, status: next.status });
      await createComent.mutateAsync({ rotina_id: rotina.id, mensagem: `Etapa: ${next.label}`, tipo: "status_change" });
      if (next.etapa === "concluido" && rotina.valor && !rotina.contas_pagar_id) {
        const { data: cp } = await supabase.from("contas_pagar").insert({
          user_id: user!.id, empresa_id: rotina.empresa_id,
          fornecedor: rotina.titulo, valor: rotina.valor,
          data_vencimento: rotina.data_vencimento,
          descricao: `Gerado pela obrigação: ${rotina.titulo}`, origem: "recorrente",
        }).select().single();
        if (cp) await supabase.from("rotinas").update({ contas_pagar_id: cp.id }).eq("id", rotina.id);
      }
      toast({ title: next.label + " — etapa atualizada!" });
      onUpdated();
    } catch { toast({ title: "Erro ao avançar etapa", variant: "destructive" }); }
  };

  const devolver = async () => {
    if (!motivoDevolucao) { toast({ title: "Informe o motivo", variant: "destructive" }); return; }
    try {
      await updateRotina.mutateAsync({ id: rotina.id, etapa: "preparar", status: "devolvida" });
      await createComent.mutateAsync({ rotina_id: rotina.id, mensagem: motivoDevolucao, tipo: "revisao_devolvida" });
      toast({ title: "Devolvida para preparação" });
      setDevolvendo(false); setMotivoDevolucao(""); onUpdated();
    } catch { toast({ title: "Erro", variant: "destructive" }); }
  };

  const addComentario = async () => {
    if (!novoComentario.trim()) return;
    await createComent.mutateAsync({ rotina_id: rotina.id, mensagem: novoComentario });
    setNovoComentario("");
  };

  const addEvidencia = async () => {
    if (!evidForm.numero_protocolo && !evidForm.observacao) {
      toast({ title: "Informe o protocolo ou observação", variant: "destructive" }); return;
    }
    await createEvid.mutateAsync({
      rotina_id: rotina.id, tipo: evidForm.tipo,
      numero_protocolo: evidForm.numero_protocolo || undefined,
      observacao: evidForm.observacao || undefined,
    });
    setEvidForm({ tipo: "comprovante", numero_protocolo: "", observacao: "" });
    toast({ title: "Evidência registrada!" });
  };

  const toggleTarefa = async (t: typeof tarefas[0]) => {
    const novoStatus = t.status === "concluida" ? "em_andamento" : "concluida";
    await updateTarefa.mutateAsync({
      id: t.id, rotina_id: t.rotina_id, status: novoStatus,
      data_conclusao: novoStatus === "concluida" ? new Date().toISOString() : null,
    });
  };

  const adicionarTarefa = async () => {
    if (!novaTarefa.trim()) return;
    await createTarefa.mutateAsync({
      rotina_id: rotina.id, nome: novaTarefa.trim(), ordem: tarefas.length,
    });
    setNovaTarefa("");
  };

  // Upload de comprovante → Supabase Storage → dispara automação
  const uploadComprovante = async (file: File) => {
    if (!user || !rotina.empresa_id) return;
    setUploadingFile(true);
    try {
      // Busca CNPJ da empresa
      const { data: emp } = await (supabase as any)
        .from("empresas").select("cnpj").eq("id", rotina.empresa_id).single();
      const cnpj = (emp?.cnpj ?? "").replace(/\D/g, "");
      const competencia = rotina.competencia
        ? rotina.competencia.slice(0, 7).replace("-", "")
        : new Date().toISOString().slice(0, 7).replace("-", "");
      const tipo = rotina.tipo.toLowerCase();
      const ext  = file.name.split(".").pop() ?? "pdf";
      const path = `${tipo}/${cnpj}/${competencia}/${Date.now()}_${file.name}`;

      // Upload para o bucket
      const { error: upErr } = await supabase.storage
        .from("obrigacoes-docs")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage.from("obrigacoes-docs").getPublicUrl(path);

      // Chama a Edge Function para processar
      const { data: efData, error: efErr } = await supabase.functions.invoke(
        "processar-arquivo-rotina",
        { body: { arquivo_path: path, arquivo_url: publicUrl, user_id: user.id } }
      );
      if (efErr) throw efErr;

      if (efData?.ok) {
        toast({ title: "Comprovante enviado — rotina concluída automaticamente!" });
      } else {
        // Se automação não encontrou config, só registra como evidência
        await createEvid.mutateAsync({
          rotina_id: rotina.id, tipo: "comprovante",
          arquivo_url: publicUrl, observacao: `Arquivo: ${file.name}`,
        });
        toast({ title: "Comprovante anexado à evidência." });
      }
    } catch (err: any) {
      toast({ title: "Erro no upload", description: err.message, variant: "destructive" });
    } finally {
      setUploadingFile(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-background shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b" style={{ backgroundColor: NAVY }}>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/60 mb-0.5">{rotina.empresas?.razao_social || "Sem empresa"}</p>
            <h2 className="text-base font-bold text-white leading-tight truncate">{rotina.titulo}</h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <StatusBadge status={rotina.status} />
              {rotina.risco && rotina.risco !== "baixo" && <RiscoBadge risco={rotina.risco} />}
              {rotina.competencia && (
                <span className="text-xs text-white/60">
                  Comp: {format(new Date(rotina.competencia + "T12:00:00"), "MM/yyyy")}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {prazoInt && (
                <span className="text-xs text-amber-300">
                  Prazo interno: {format(prazoInt, "dd/MM")}
                </span>
              )}
              <span className={`text-xs font-medium ${atrasada ? "text-red-300" : dias <= 3 ? "text-amber-300" : "text-white/60"}`}>
                Vence: {format(venc, "dd/MM/yyyy")}
                {rotina.status !== "concluida" && (
                  <> ({dias < 0 ? `${Math.abs(dias)}d atrasada` : dias === 0 ? "hoje" : `${dias}d`})</>
                )}
              </span>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white/60 hover:text-white hover:bg-white/10 shrink-0">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Workflow timeline */}
        <div className="flex items-center gap-0 px-5 py-3 border-b bg-muted/30">
          {ETAPAS.map((e, i) => {
            const done    = i < etapaAtual;
            const current = i === etapaAtual;
            const color   = done || current ? (done ? GREEN : BLUE) : GRAY;
            return (
              <div key={e.id} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-0.5">
                  <div className="h-7 w-7 rounded-full flex items-center justify-center text-white"
                    style={{ backgroundColor: color }}>
                    <e.icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-[10px]" style={{ color }}>{e.label}</span>
                </div>
                {i < ETAPAS.length - 1 && (
                  <div className="flex-1 h-0.5 mx-1 mb-3" style={{ backgroundColor: i < etapaAtual ? GREEN : "#e5e7eb" }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="tarefas" className="h-full">
            <TabsList className="w-full rounded-none border-b px-4 justify-start gap-4 h-10">
              <TabsTrigger value="tarefas" className="text-xs px-0 pb-2">
                <ListChecks className="h-3.5 w-3.5 mr-1" />
                Tarefas {tarefas.length > 0 && `(${tarefasConcluidas}/${tarefas.length})`}
              </TabsTrigger>
              <TabsTrigger value="atividade" className="text-xs px-0 pb-2">
                <MessageSquare className="h-3.5 w-3.5 mr-1" />Atividade
              </TabsTrigger>
              <TabsTrigger value="evidencias" className="text-xs px-0 pb-2">
                <FileText className="h-3.5 w-3.5 mr-1" />Evidências {evidencias.length > 0 && `(${evidencias.length})`}
              </TabsTrigger>
            </TabsList>

            {/* ── Tarefas ── */}
            <TabsContent value="tarefas" className="p-4 space-y-3">
              {/* Barra de progresso */}
              {tarefas.length > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{tarefasConcluidas} de {tarefas.length} concluídas</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: pct === 100 ? GREEN : BLUE }} />
                  </div>
                </div>
              )}

              {/* Lista de tarefas */}
              <div className="space-y-1.5">
                {tarefas.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Nenhuma tarefa. Adicione etapas de execução abaixo.
                  </p>
                )}
                {tarefas.map(t => (
                  <div key={t.id} className={`flex items-start gap-3 rounded-lg border p-2.5 transition-colors
                    ${t.status === "concluida" ? "bg-green-50/60 border-green-200" : "bg-background"}`}>
                    <Checkbox
                      checked={t.status === "concluida"}
                      onCheckedChange={() => toggleTarefa(t)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${t.status === "concluida" ? "line-through text-muted-foreground" : ""}`}>
                        {t.nome}
                      </p>
                      {t.data_conclusao && (
                        <p className="text-xs text-muted-foreground">
                          Concluída {format(new Date(t.data_conclusao), "dd/MM HH:mm")}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost" size="icon" className="h-6 w-6 shrink-0 opacity-40 hover:opacity-100"
                      onClick={() => deleteTarefa.mutateAsync({ id: t.id, rotina_id: t.rotina_id })}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Adicionar tarefa */}
              {rotina.status !== "concluida" && rotina.status !== "cancelada" && (
                <div className="flex gap-2 pt-2 border-t">
                  <Input
                    placeholder="Nova tarefa..."
                    className="h-8 text-sm flex-1"
                    value={novaTarefa}
                    onChange={e => setNovaTarefa(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && adicionarTarefa()}
                  />
                  <Button size="sm" onClick={adicionarTarefa} disabled={!novaTarefa.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Campos extras: status, responsabilidade, responsável */}
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Controle</p>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Status</p>
                    <Select
                      value={rotina.status}
                      onValueChange={v => updateRotina.mutateAsync({ id: rotina.id, status: v as RotinaStatus })}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Responsabilidade (se erro)</p>
                    <Select
                      value={rotina.responsabilidade_erro ?? "_none"}
                      onValueChange={v => updateRotina.mutateAsync({
                        id: rotina.id,
                        responsabilidade_erro: v === "_none" ? null : v as any,
                      })}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">— Não definida —</SelectItem>
                        {Object.entries(RESP_ERRO_CONFIG).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ── Atividade ── */}
            <TabsContent value="atividade" className="p-4 space-y-3">
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {comentarios.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma atividade ainda.</p>
                ) : comentarios.map(c => (
                  <div key={c.id} className={`rounded-lg p-2.5 text-sm ${
                    c.tipo === "revisao_devolvida" ? "bg-orange-50 border border-orange-200" :
                    c.tipo === "status_change"     ? "bg-blue-50/50 border border-blue-100" :
                    "bg-muted/40"
                  }`}>
                    {c.tipo === "revisao_devolvida" && (
                      <p className="text-xs font-semibold text-orange-600 mb-0.5">Devolução</p>
                    )}
                    <p className="text-foreground">{c.mensagem}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(c.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-2 border-t">
                <Textarea
                  placeholder="Adicionar comentário..."
                  value={novoComentario}
                  onChange={e => setNovoComentario(e.target.value)}
                  rows={2} className="text-sm resize-none flex-1"
                />
                <Button size="sm" onClick={addComentario} disabled={!novoComentario.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </TabsContent>

            {/* ── Evidências ── */}
            <TabsContent value="evidencias" className="p-4 space-y-4">
              {evidencias.length > 0 && (
                <div className="space-y-2">
                  {evidencias.map(e => (
                    <div key={e.id} className="rounded-lg border p-3 bg-green-50/40 text-sm">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                        <span className="font-medium capitalize">{e.tipo}</span>
                        {e.numero_protocolo && <span className="text-muted-foreground font-mono">#{e.numero_protocolo}</span>}
                      </div>
                      {e.observacao && <p className="text-muted-foreground mt-1 ml-6">{e.observacao}</p>}
                      <p className="text-xs text-muted-foreground mt-1 ml-6">
                        {format(new Date(e.created_at), "dd/MM/yyyy HH:mm")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {rotina.status !== "concluida" && (
                <div className="space-y-4 border-t pt-3">

                  {/* Upload automático */}
                  <div className="rounded-lg border-2 border-dashed border-blue-200 bg-blue-50/40 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-blue-600" />
                      <p className="text-xs font-semibold text-blue-700">Upload com automação</p>
                    </div>
                    <p className="text-xs text-blue-600">
                      Faça o upload do comprovante e o sistema conclui a obrigação automaticamente (se configurado em Automação de Rotinas).
                    </p>
                    <label className="cursor-pointer block">
                      <input
                        type="file"
                        accept=".pdf,.xlsx,.xml,.png,.jpg"
                        className="sr-only"
                        onChange={e => { if (e.target.files?.[0]) uploadComprovante(e.target.files[0]); }}
                        disabled={uploadingFile}
                      />
                      <div className="flex items-center justify-center gap-2 rounded-md border border-blue-300 bg-white hover:bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 transition-colors">
                        <Upload className="h-3.5 w-3.5" />
                        {uploadingFile ? "Enviando..." : "Selecionar arquivo (PDF, XML, XLSX...)"}
                      </div>
                    </label>
                    {(rotina as any).arquivo_url && (
                      <a href={(rotina as any).arquivo_url} target="_blank" rel="noreferrer"
                        className="text-xs text-blue-600 underline flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Ver arquivo anexado
                      </a>
                    )}
                  </div>

                  {/* Evidência manual */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Ou registrar manualmente</p>
                    <Select value={evidForm.tipo} onValueChange={v => setEvidForm({ ...evidForm, tipo: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="protocolo">Protocolo</SelectItem>
                        <SelectItem value="recibo">Recibo</SelectItem>
                        <SelectItem value="comprovante">Comprovante</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input placeholder="Número de protocolo (opcional)" className="h-8 text-xs"
                      value={evidForm.numero_protocolo}
                      onChange={e => setEvidForm({ ...evidForm, numero_protocolo: e.target.value })} />
                    <Input placeholder="Observação" className="h-8 text-xs"
                      value={evidForm.observacao}
                      onChange={e => setEvidForm({ ...evidForm, observacao: e.target.value })} />
                    <Button size="sm" className="w-full" onClick={addEvidencia}>
                      <Plus className="mr-2 h-3.5 w-3.5" /> Registrar
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer — ações de workflow */}
        {rotina.status !== "concluida" && rotina.status !== "nao_aplicavel" && rotina.status !== "cancelada" && (
          <div className="border-t p-4 space-y-2 bg-background">
            {rotina.etapa === "revisar" && !devolvendo && (
              <Button variant="outline" size="sm" className="w-full border-orange-300 text-orange-600 hover:bg-orange-50"
                onClick={() => setDevolvendo(true)}>
                Devolver para Preparação
              </Button>
            )}
            {devolvendo && (
              <div className="space-y-2">
                <Textarea placeholder="Motivo da devolução..." rows={2} className="text-sm resize-none"
                  value={motivoDevolucao} onChange={e => setMotivoDevolucao(e.target.value)} />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setDevolvendo(false)}>Cancelar</Button>
                  <Button size="sm" className="flex-1 bg-orange-500 hover:bg-orange-600 text-white" onClick={devolver}>
                    Confirmar Devolução
                  </Button>
                </div>
              </div>
            )}
            {next && !devolvendo && (
              <Button className="w-full" onClick={avancar} disabled={updateRotina.isPending}
                style={{ backgroundColor: NAVY }}>
                {next.label}
              </Button>
            )}
          </div>
        )}
        {rotina.status === "concluida" && rotina.contas_pagar_id && (
          <div className="border-t p-3 bg-green-50/50 text-center text-xs text-green-700 flex items-center justify-center gap-1">
            <Link className="h-3.5 w-3.5" /> Conta a pagar criada no Finance AI
          </div>
        )}
      </div>
    </div>
  );
}
