import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Stethoscope, Building2, AlertTriangle, CheckCircle2, RefreshCw,
  Sparkles, ShieldCheck, Settings, Plus, X, Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const NAVY = "#10143D";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Empresa {
  id: string; razao_social: string; cnpj: string;
  regime_tributario: string | null; regime: string | null; atividade: string | null;
  possui_prolabore: boolean; possui_funcionario: boolean;
  tem_retencoes: boolean; tem_reinf: boolean;
  contribuinte_iss: boolean; contribuinte_icms: boolean;
}

interface RotinaAtiva {
  id: string; nome_rotina: string; codigo_rotina: string;
  tipo_rotina: string; departamento: string; periodicidade: string;
  criticidade: string; dia_vencimento: number | null;
  meses_offset: number | null; margem_seguranca: number | null;
  descricao: string | null; origem: string; // 'perfil' | 'manual'
}

interface RotinaModelo {
  id: string; nome_rotina: string; codigo_rotina: string;
  tipo_rotina: string; departamento: string; periodicidade: string;
}

// ── Configs ───────────────────────────────────────────────────────────────────
const DEPT_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  Fiscal:      { label: "Fiscal",       color: "#3b82f6", bg: "#eff6ff" },
  Contábil:    { label: "Contábil",     color: "#8b5cf6", bg: "#f5f3ff" },
  DP:          { label: "Dep. Pessoal", color: "#f59e0b", bg: "#fffbeb" },
  Gestão:      { label: "Gestão",       color: "#22c55e", bg: "#f0fdf4" },
  Legalização: { label: "Legalização",  color: "#6b7280", bg: "#f9fafb" },
  Financeiro:  { label: "Financeiro",   color: "#ec4899", bg: "#fdf2f8" },
};

const CRIT_CONFIG: Record<string, { label: string; color: string }> = {
  critica: { label: "Crítica", color: "#dc2626" },
  alta:    { label: "Alta",    color: "#f59e0b" },
  media:   { label: "Média",   color: "#3b82f6" },
  baixa:   { label: "Baixa",   color: "#22c55e" },
};

const REGIME_LABEL: Record<string, string> = {
  simples: "Simples Nacional", presumido: "Lucro Presumido", real: "Lucro Real", mei: "MEI",
};
const ATIV_LABEL: Record<string, string> = {
  servico: "Serviço", comercio: "Comércio", misto: "Misto",
};

// ── FlagRow ───────────────────────────────────────────────────────────────────
function FlagRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <span className="text-sm text-gray-700">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{value ? "Sim" : "Não"}</span>
        <Switch checked={value} onCheckedChange={onChange} />
      </div>
    </div>
  );
}

// ── Adicionar Obrigação Dialog ────────────────────────────────────────────────
function AdicionarObrigacaoDialog({
  open, onOpenChange, todasRotinas, ativasIds, onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  todasRotinas: RotinaModelo[];
  ativasIds: Set<string>;
  onAdd: (rotina: RotinaModelo) => void;
}) {
  const [selecionada, setSelecionada] = useState("");
  const disponiveis = todasRotinas.filter(r => !ativasIds.has(r.id));
  const [dept, setDept] = useState("_todos");

  const filtradas = dept === "_todos" ? disponiveis : disponiveis.filter(r => r.departamento === dept);
  const depts = Array.from(new Set(disponiveis.map(r => r.departamento))).sort();

  function handleAdd() {
    const rotina = disponiveis.find(r => r.id === selecionada);
    if (!rotina) return;
    onAdd(rotina);
    setSelecionada(""); onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle style={{ color: NAVY }}>Adicionar Obrigação</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <p className="text-sm text-muted-foreground">
            Adicione uma obrigação que não faz parte do perfil padrão desta empresa.
          </p>
          <div>
            <Label className="text-xs text-muted-foreground">Departamento</Label>
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_todos">Todos</SelectItem>
                {depts.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Obrigação *</Label>
            <Select value={selecionada} onValueChange={setSelecionada}>
              <SelectTrigger><SelectValue placeholder="Selecionar obrigação..." /></SelectTrigger>
              <SelectContent>
                {filtradas.map(r => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.nome_rotina} <span className="text-muted-foreground text-xs ml-1">({r.departamento})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={!selecionada} style={{ backgroundColor: NAVY }} className="text-white">
              Adicionar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DiagnosticoFiscal() {
  const { user, ownerUserId } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId] = useState("");
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [rotinas, setRotinas] = useState<RotinaAtiva[]>([]);
  const [todasRotinas, setTodasRotinas] = useState<RotinaModelo[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [perfil, setPerfil] = useState<Partial<Empresa>>({});
  const [dirty, setDirty] = useState(false);
  const [adicionarOpen, setAdicionarOpen] = useState(false);

  // Carregar empresas e todas as rotinas modelo
  useEffect(() => {
    if (!user) return;
    supabase
      .from("empresas")
      .select("id, razao_social, cnpj, regime_tributario, regime, atividade, possui_prolabore, possui_funcionario, tem_retencoes, tem_reinf, contribuinte_iss, contribuinte_icms")
      .eq("user_id", ownerUserId!).eq("ativa", true).order("razao_social")
      .then(({ data }) => setEmpresas((data ?? []) as unknown as Empresa[]));

    (supabase as any)
      .from("rotina_modelo")
      .select("id, nome_rotina, codigo_rotina, tipo_rotina, departamento, periodicidade")
      .eq("ativo", true).order("departamento").order("nome_rotina")
      .then(({ data }: any) => setTodasRotinas(data ?? []));
  }, [user]);

  function handleSelectEmpresa(id: string) {
    setEmpresaId(id);
    const e = empresas.find(e => e.id === id) ?? null;
    setEmpresa(e); setPerfil(e ? { ...e } : {}); setDirty(false);
    if (e) loadRotinas(e.id);
  }

  async function loadRotinas(id: string) {
    setLoading(true); setRotinas([]);
    try {
      const { data, error } = await (supabase as any).rpc("motor_ativacao", { p_empresa_id: id });
      if (error) throw error;
      setRotinas((data ?? []) as RotinaAtiva[]);
    } catch (err: any) {
      toast({ title: "Erro ao carregar diagnóstico", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  }

  // Excluir obrigação do perfil da empresa (salva override ativo=false)
  async function handleExcluir(rotina: RotinaAtiva) {
    if (!empresa || !user) return;
    try {
      const { error } = await (supabase as any)
        .from("empresa_rotina_config")
        .upsert({
          user_id: user.id,
          empresa_id: empresa.id,
          rotina_modelo_id: rotina.id,
          ativo: false,
        }, { onConflict: "empresa_id,rotina_modelo_id" });
      if (error) throw error;
      setRotinas(prev => prev.filter(r => r.id !== rotina.id));
      toast({ title: `"${rotina.nome_rotina}" removida do perfil.` });
    } catch (err: any) {
      toast({ title: "Erro ao remover", description: err.message, variant: "destructive" });
    }
  }

  // Adicionar obrigação extra ao perfil da empresa (salva override ativo=true)
  async function handleAdicionar(rotina: RotinaModelo) {
    if (!empresa || !user) return;
    try {
      const { error } = await (supabase as any)
        .from("empresa_rotina_config")
        .upsert({
          user_id: user.id,
          empresa_id: empresa.id,
          rotina_modelo_id: rotina.id,
          ativo: true,
        }, { onConflict: "empresa_id,rotina_modelo_id" });
      if (error) throw error;
      // Recarrega para garantir dados completos
      await loadRotinas(empresa.id);
      toast({ title: `"${rotina.nome_rotina}" adicionada ao perfil.` });
    } catch (err: any) {
      toast({ title: "Erro ao adicionar", description: err.message, variant: "destructive" });
    }
  }

  // Salvar flags do perfil fiscal
  async function handleSave() {
    if (!empresa || !dirty) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("empresas").update({
        possui_prolabore: perfil.possui_prolabore,
        possui_funcionario: perfil.possui_funcionario,
        tem_retencoes: perfil.tem_retencoes,
        tem_reinf: perfil.tem_reinf,
        contribuinte_iss: perfil.contribuinte_iss,
        contribuinte_icms: perfil.contribuinte_icms,
      }).eq("id", empresa.id);
      if (error) throw error;
      const updated = { ...empresa, ...perfil } as Empresa;
      setEmpresa(updated);
      setEmpresas(prev => prev.map(e => e.id === updated.id ? updated : e));
      setDirty(false);
      toast({ title: "Perfil atualizado!" });
      await loadRotinas(updated.id);
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  // Agrupar rotinas por departamento
  const rotinasGrupo = rotinas.reduce<Record<string, RotinaAtiva[]>>((acc, r) => {
    if (!acc[r.departamento]) acc[r.departamento] = [];
    acc[r.departamento].push(r);
    return acc;
  }, {});

  const ativasIds = new Set(rotinas.map(r => r.id));
  const regimeEmpresa = empresa?.regime_tributario ?? empresa?.regime ?? null;

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg p-2" style={{ backgroundColor: NAVY + "15" }}>
            <Stethoscope className="h-6 w-6" style={{ color: NAVY }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Diagnóstico Fiscal</h1>
            <p className="text-sm text-muted-foreground">Perfil tributário e obrigações ativas por empresa</p>
          </div>
        </div>
      </div>

      {/* Empresa Selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground mb-1 block">Selecionar empresa</Label>
              <Select value={empresaId} onValueChange={handleSelectEmpresa}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Escolha uma empresa para o diagnóstico..." />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{e.razao_social}</span>
                        <span className="text-xs text-muted-foreground">{e.cnpj}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {empresa && (
              <Button variant="outline" size="sm" onClick={() => loadRotinas(empresa.id)} disabled={loading}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {!empresa && (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
          <Stethoscope className="h-12 w-12 opacity-20" />
          <p className="text-sm">Selecione uma empresa para ver o diagnóstico tributário.</p>
        </div>
      )}

      {empresa && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna esquerda: Perfil */}
          <div className="space-y-4">
            {/* Identificação */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2" style={{ color: NAVY }}>
                  <Building2 className="h-4 w-4" />Identificação
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                <div>
                  <p className="text-xs text-muted-foreground">Regime Tributário</p>
                  {regimeEmpresa
                    ? <Badge variant="outline" className="mt-0.5">{REGIME_LABEL[regimeEmpresa] ?? regimeEmpresa}</Badge>
                    : <span className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Não definido</span>
                  }
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Atividade</p>
                  {empresa.atividade
                    ? <Badge variant="outline" className="mt-0.5">{ATIV_LABEL[empresa.atividade] ?? empresa.atividade}</Badge>
                    : <span className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Não definida</span>
                  }
                </div>
              </CardContent>
            </Card>

            {/* Flags */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2" style={{ color: NAVY }}>
                  <Settings className="h-4 w-4" />Configuração do Perfil
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 px-4">
                <FlagRow label="Possui pró-labore"      value={perfil.possui_prolabore ?? false}  onChange={v => { setPerfil(p => ({ ...p, possui_prolabore: v })); setDirty(true); }} />
                <FlagRow label="Funcionário CLT"        value={perfil.possui_funcionario ?? false} onChange={v => { setPerfil(p => ({ ...p, possui_funcionario: v })); setDirty(true); }} />
                <FlagRow label="Retenções na fonte"     value={perfil.tem_retencoes ?? false}      onChange={v => { setPerfil(p => ({ ...p, tem_retencoes: v })); setDirty(true); }} />
                <FlagRow label="EFD-Reinf"              value={perfil.tem_reinf ?? false}          onChange={v => { setPerfil(p => ({ ...p, tem_reinf: v })); setDirty(true); }} />
                <FlagRow label="Contribuinte ISS"       value={perfil.contribuinte_iss ?? false}   onChange={v => { setPerfil(p => ({ ...p, contribuinte_iss: v })); setDirty(true); }} />
                <FlagRow label="Contribuinte ICMS"      value={perfil.contribuinte_icms ?? false}  onChange={v => { setPerfil(p => ({ ...p, contribuinte_icms: v })); setDirty(true); }} />
                {dirty && (
                  <Button className="w-full mt-3 text-white" style={{ backgroundColor: NAVY }} onClick={handleSave} disabled={saving}>
                    {saving ? "Salvando..." : "Salvar e Rediagnosticar"}
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* KPI */}
            {!loading && rotinas.length > 0 && (
              <Card style={{ backgroundColor: NAVY }}>
                <CardContent className="p-4 text-white">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="h-8 w-8 opacity-80" />
                    <div>
                      <p className="text-3xl font-bold">{rotinas.length}</p>
                      <p className="text-xs opacity-70">obrigações ativas</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {Object.entries(rotinasGrupo).map(([dept, items]) => (
                      <span key={dept} className="text-[10px] px-2 py-0.5 rounded-full bg-white/20">
                        {DEPT_CONFIG[dept]?.label ?? dept}: {items.length}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Coluna direita: Obrigações */}
          <div className="lg:col-span-2 space-y-4">

            {/* Barra de ações */}
            {!loading && empresa && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {rotinas.length > 0
                    ? `${rotinas.length} obrigação${rotinas.length !== 1 ? "ões" : ""} ativa${rotinas.length !== 1 ? "s" : ""} para este perfil`
                    : "Nenhuma obrigação ativa"}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAdicionarOpen(true)}
                  className="gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar obrigação
                </Button>
              </div>
            )}

            {loading && (
              <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
                <RefreshCw className="h-5 w-5 animate-spin" />
                <span>Executando motor de ativação...</span>
              </div>
            )}

            {!loading && rotinas.length === 0 && empresa && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
                  <Info className="h-8 w-8 opacity-30" />
                  <p className="text-sm text-center">
                    Nenhuma obrigação ativa detectada.<br />
                    Verifique se o regime tributário e atividade estão configurados.
                  </p>
                  <Button size="sm" variant="outline" onClick={() => setAdicionarOpen(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Adicionar manualmente
                  </Button>
                </CardContent>
              </Card>
            )}

            {!loading && Object.entries(rotinasGrupo).map(([dept, items]) => {
              const deptCfg = DEPT_CONFIG[dept] ?? { label: dept, color: "#6b7280", bg: "#f9fafb" };
              return (
                <Card key={dept}>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                        style={{ backgroundColor: deptCfg.bg, color: deptCfg.color }}>
                        {deptCfg.label}
                      </span>
                      <span className="text-muted-foreground font-normal">{items.length} obrigação{items.length !== 1 ? "ões" : ""}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {items.map(r => {
                        const crit = CRIT_CONFIG[r.criticidade] ?? CRIT_CONFIG.alta;
                        return (
                          <div key={r.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 group">
                            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" style={{ color: deptCfg.color }} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-gray-800">{r.nome_rotina}</span>
                                <Badge variant="outline" className="text-[10px] uppercase px-1.5 py-0">{r.tipo_rotina}</Badge>
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                                  style={{ backgroundColor: crit.color + "18", color: crit.color }}>
                                  {crit.label}
                                </span>
                                {r.origem === "manual" && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">
                                    adicionada manualmente
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-xs text-muted-foreground capitalize">{r.periodicidade}</span>
                                {r.dia_vencimento && (
                                  <span className="text-xs text-muted-foreground">
                                    vence dia {r.dia_vencimento}
                                    {r.meses_offset && r.meses_offset > 0 ? ` (+${r.meses_offset}m)` : ""}
                                  </span>
                                )}
                                {r.margem_seguranca && (
                                  <span className="text-xs text-muted-foreground">prazo interno {r.margem_seguranca}d antes</span>
                                )}
                              </div>
                            </div>
                            {/* Botão remover */}
                            <button
                              onClick={() => handleExcluir(r)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"
                              title="Remover do perfil desta empresa"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {!loading && rotinas.length > 0 && (
              <Card className="border-dashed">
                <CardContent className="p-4 flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-amber-500 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">Gerar rotinas para este mês</p>
                    <p className="text-xs text-muted-foreground">
                      Cria automaticamente as rotinas de {new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })} com base neste perfil.
                    </p>
                  </div>
                  <Button size="sm" style={{ backgroundColor: NAVY }} className="text-white shrink-0" onClick={() => navigate("/rotinas")}>
                    Ir para Rotinas
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Dialog: adicionar obrigação extra */}
      <AdicionarObrigacaoDialog
        open={adicionarOpen}
        onOpenChange={setAdicionarOpen}
        todasRotinas={todasRotinas}
        ativasIds={ativasIds}
        onAdd={handleAdicionar}
      />
    </div>
  );
}
