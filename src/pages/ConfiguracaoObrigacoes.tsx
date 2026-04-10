import { useState, useEffect, useMemo } from "react";
import { Save, Info, RotateCcw, Plus, Pencil, Trash2, PackageOpen, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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


const EMPTY_FORM = {
  nome_rotina: "", codigo_rotina: "", tipo_rotina: "", departamento: "Fiscal",
  periodicidade: "mensal", criticidade: "alta",
  dia_vencimento: "", meses_offset: "1", margem_seguranca: "3", descricao: "",
};

// ── Tipos para regras de ativação ─────────────────────────────────────────────
interface RegraAtivacao {
  id?: string;
  regime_tributario: string;
  tipo_atividade: string;
  exige_prolabore: string;
  exige_funcionario: string;
  exige_retencao: string;
  exige_icms: string;
  exige_iss: string;
}

const REGRA_VAZIA: RegraAtivacao = {
  regime_tributario: "qualquer", tipo_atividade: "qualquer",
  exige_prolabore: "qualquer", exige_funcionario: "qualquer",
  exige_retencao: "qualquer", exige_icms: "qualquer", exige_iss: "qualquer",
};

function regraLabel(r: RegraAtivacao): string {
  const parts: string[] = [];
  if (r.regime_tributario !== "qualquer") parts.push({ simples: "Simples", presumido: "Presumido", real: "Real", mei: "MEI" }[r.regime_tributario] ?? r.regime_tributario);
  if (r.tipo_atividade !== "qualquer") parts.push({ servico: "Serviço", comercio: "Comércio", misto: "Misto" }[r.tipo_atividade] ?? r.tipo_atividade);
  if (r.exige_prolabore === "true") parts.push("c/ Pró-labore");
  if (r.exige_funcionario === "true") parts.push("c/ Funcionário");
  if (r.exige_retencao === "true") parts.push("c/ Retenção");
  if (r.exige_icms === "true") parts.push("Contribuinte ICMS");
  if (r.exige_iss === "true") parts.push("Contribuinte ISS");
  return parts.length ? parts.join(" + ") : "Todos os perfis";
}

function empresaMatchesRegra(emp: any, r: RegraAtivacao): boolean {
  const regime = emp.regime_tributario ?? emp.regime ?? "";
  if (r.regime_tributario !== "qualquer" && regime !== r.regime_tributario) return false;
  if (r.tipo_atividade !== "qualquer") {
    const at = emp.atividade ?? "";
    if (r.tipo_atividade === "misto" && at !== "misto") return false;
    if (r.tipo_atividade === "servico" && at !== "servico" && at !== "misto") return false;
    if (r.tipo_atividade === "comercio" && at !== "comercio" && at !== "misto") return false;
  }
  if (r.exige_prolabore === "true" && !emp.possui_prolabore) return false;
  if (r.exige_funcionario === "true" && !emp.possui_funcionario) return false;
  if (r.exige_retencao === "true" && !emp.tem_retencoes) return false;
  if (r.exige_icms === "true" && !emp.contribuinte_icms) return false;
  if (r.exige_iss === "true" && !emp.contribuinte_iss) return false;
  return true;
}

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
  const [regras, setRegras] = useState<RegraAtivacao[]>([]);
  const [novaRegra, setNovaRegra] = useState<RegraAtivacao>(REGRA_VAZIA);
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [tab, setTab] = useState("dados");

  useEffect(() => {
    if (open) {
      setTab("dados");
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

      // Carrega regras e empresas se editando
      if (initial?.id) {
        (supabase as any).from("regra_ativacao_rotina").select("*")
          .eq("rotina_modelo_id", initial.id).eq("ativo", true)
          .then(({ data }: any) => setRegras(data ?? []));
        (supabase as any).from("empresas")
          .select("id, razao_social, regime_tributario, regime, atividade, possui_prolabore, possui_funcionario, tem_retencoes, contribuinte_icms, contribuinte_iss")
          .order("razao_social")
          .then(({ data }: any) => setEmpresas(data ?? []));
      } else {
        setRegras([]);
        setEmpresas([]);
      }
    }
  }, [open, initial]);

  const f = (field: string) => (e: any) => setForm(p => ({ ...p, [field]: e.target.value }));
  const nr = (field: keyof RegraAtivacao) => (v: string) => setNovaRegra(p => ({ ...p, [field]: v }));

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
        dia_vencimento:  form.dia_vencimento   ? parseInt(form.dia_vencimento)   : null,
        meses_offset:    form.meses_offset     ? parseInt(form.meses_offset)     : 1,
        margem_seguranca:form.margem_seguranca ? parseInt(form.margem_seguranca) : 3,
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
    } finally { setSaving(false); }
  }

  async function adicionarRegra() {
    if (!initial?.id) return;
    try {
      const { error } = await (supabase as any).from("regra_ativacao_rotina").insert({
        rotina_modelo_id: initial.id, ...novaRegra, ativo: true,
      });
      if (error) throw error;
      const { data } = await (supabase as any).from("regra_ativacao_rotina")
        .select("*").eq("rotina_modelo_id", initial.id).eq("ativo", true);
      setRegras(data ?? []);
      setNovaRegra(REGRA_VAZIA);
      toast({ title: "Regra adicionada!" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  }

  async function removerRegra(id: string) {
    await (supabase as any).from("regra_ativacao_rotina").update({ ativo: false }).eq("id", id);
    setRegras(p => p.filter(r => r.id !== id));
  }

  // Empresas que batem com pelo menos uma regra
  const empresasAtivadas = useMemo(() =>
    empresas.filter(emp => regras.some(r => empresaMatchesRegra(emp, r))),
    [empresas, regras]
  );

  const SelectRegra = ({ field, options }: { field: keyof RegraAtivacao; options: [string, string][] }) => (
    <Select value={novaRegra[field]} onValueChange={nr(field)}>
      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle style={{ color: NAVY }}>
            {initial ? "Editar Obrigação" : "Nova Obrigação"}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="dados" className="flex-1">Dados</TabsTrigger>
            <TabsTrigger value="perfis" className="flex-1" disabled={!initial}>
              Perfis de Ativação {regras.length > 0 && <Badge className="ml-1 h-4 px-1 text-[10px]">{regras.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="empresas" className="flex-1" disabled={!initial}>
              Empresas {empresasAtivadas.length > 0 && <Badge className="ml-1 h-4 px-1 text-[10px]">{empresasAtivadas.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* ── Aba Dados ── */}
          <TabsContent value="dados" className="space-y-3 pt-2">
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
          </TabsContent>

          {/* ── Aba Perfis de Ativação ── */}
          <TabsContent value="perfis" className="space-y-4 pt-2">
            <p className="text-xs text-muted-foreground">
              Cada linha abaixo é uma condição que ativa esta obrigação. A empresa precisa atender <strong>pelo menos uma</strong> condição.
            </p>

            {/* Regras existentes */}
            {regras.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-4 text-center">Nenhum perfil configurado. Adicione abaixo.</p>
            ) : (
              <div className="space-y-2">
                {regras.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 border text-sm">
                    <span>{regraLabel(r)}</span>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500 hover:text-red-700" onClick={() => removerRegra(r.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Formulário nova regra */}
            <div className="border rounded-lg p-3 space-y-2 bg-blue-50/50">
              <p className="text-xs font-medium text-muted-foreground mb-2">Adicionar novo perfil</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Regime</Label>
                  <SelectRegra field="regime_tributario" options={[["qualquer","Qualquer"],["simples","Simples"],["presumido","Presumido"],["real","Real"],["mei","MEI"]]} />
                </div>
                <div>
                  <Label className="text-xs">Atividade</Label>
                  <SelectRegra field="tipo_atividade" options={[["qualquer","Qualquer"],["servico","Serviço"],["comercio","Comércio"],["misto","Misto"]]} />
                </div>
                <div>
                  <Label className="text-xs">Pró-labore</Label>
                  <SelectRegra field="exige_prolabore" options={[["qualquer","Qualquer"],["true","Sim"],["false","Não"]]} />
                </div>
                <div>
                  <Label className="text-xs">Funcionário</Label>
                  <SelectRegra field="exige_funcionario" options={[["qualquer","Qualquer"],["true","Sim"],["false","Não"]]} />
                </div>
                <div>
                  <Label className="text-xs">Retenção</Label>
                  <SelectRegra field="exige_retencao" options={[["qualquer","Qualquer"],["true","Sim"],["false","Não"]]} />
                </div>
                <div>
                  <Label className="text-xs">Contrib. ISS</Label>
                  <SelectRegra field="exige_iss" options={[["qualquer","Qualquer"],["true","Sim"],["false","Não"]]} />
                </div>
                <div>
                  <Label className="text-xs">Contrib. ICMS</Label>
                  <SelectRegra field="exige_icms" options={[["qualquer","Qualquer"],["true","Sim"],["false","Não"]]} />
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <Button size="sm" onClick={adicionarRegra} style={{ backgroundColor: NAVY }} className="text-white">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar Perfil
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* ── Aba Empresas ── */}
          <TabsContent value="empresas" className="pt-2">
            <p className="text-xs text-muted-foreground mb-3">
              Empresas que atendem ao perfil desta obrigação e receberão esta tarefa na geração automática.
            </p>
            {empresasAtivadas.length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-8">
                Nenhuma empresa corresponde aos perfis configurados.
              </p>
            ) : (
              <div className="space-y-1.5">
                {empresasAtivadas.map((emp: any) => (
                  <div key={emp.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-gray-50 text-sm">
                    <div className="h-7 w-7 rounded-full bg-[#10143D] text-white text-xs flex items-center justify-center font-bold shrink-0">
                      {emp.razao_social?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium">{emp.razao_social}</div>
                      <div className="text-xs text-muted-foreground">
                        {emp.regime_tributario ?? emp.regime ?? "—"} · {emp.atividade ?? "—"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

const PERFIL_LABEL: Record<string, string> = {
  simples: "Simples Nacional", presumido: "Lucro Presumido", real: "Lucro Real", mei: "MEI",
};

function EmpresasPerfilPanel({ perfil, empresas, selectedId, onSelect, onAddObrigacao }: {
  perfil: string;
  empresas: any[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAddObrigacao: () => void;
}) {
  const [busca, setBusca] = useState("");
  const selectedEmpresa = empresas.find(e => e.id === selectedId);
  const filtradas = empresas.filter(e =>
    e.razao_social?.toLowerCase().includes(busca.toLowerCase())
  );

  // Quando empresa está selecionada, mostra só o chip e oculta a tabela
  if (selectedId !== "todas" && selectedEmpresa) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-blue-200 bg-blue-50 flex-wrap">
        <span className="h-6 w-6 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-bold shrink-0">
          {selectedEmpresa.razao_social?.[0]?.toUpperCase()}
        </span>
        <span className="text-sm font-medium text-blue-800">{selectedEmpresa.razao_social}</span>
        <span className="text-xs text-blue-500 capitalize">· {selectedEmpresa.regime_tributario ?? selectedEmpresa.regime ?? "—"} · {selectedEmpresa.atividade ?? "—"}</span>
        <span className="text-xs text-blue-400">— exibindo obrigações desta empresa</span>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-100" onClick={onAddObrigacao}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Incluir Obrigação
          </Button>
          <button
            onClick={() => onSelect("todas")}
            className="text-xs text-blue-500 hover:text-blue-700 underline"
          >
            Limpar filtro
          </button>
        </div>
      </div>
    );
  }

  return (
    <Card className="border-purple-200">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-sm font-semibold text-purple-800">
            Empresas com perfil "{PERFIL_LABEL[perfil] ?? perfil}"
            <span className="ml-2 text-xs font-normal text-purple-600">({empresas.length})</span>
            <span className="ml-2 text-xs font-normal text-muted-foreground">· clique em uma empresa para filtrar as obrigações</span>
          </CardTitle>
          <Input
            placeholder="Buscar empresa..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="h-8 w-52 text-xs"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {filtradas.length === 0 ? (
          <p className="text-xs text-muted-foreground italic text-center py-6">
            {empresas.length === 0 ? "Nenhuma empresa encontrada com este perfil." : "Nenhuma empresa corresponde à busca."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-purple-50/40 text-xs text-muted-foreground">
                <th className="text-left px-4 py-2">Empresa</th>
                <th className="text-left px-4 py-2">Regime</th>
                <th className="text-left px-4 py-2">Atividade</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((e, idx) => (
                <tr
                  key={e.id}
                  onClick={() => onSelect(e.id)}
                  className={`border-b last:border-0 cursor-pointer transition-colors ${idx % 2 === 0 ? "hover:bg-blue-50/60" : "bg-gray-50/40 hover:bg-blue-50/60"}`}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="h-6 w-6 rounded-full bg-[#10143D] text-white text-[10px] flex items-center justify-center font-bold shrink-0">
                        {e.razao_social?.[0]?.toUpperCase()}
                      </span>
                      <span className="font-medium">{e.razao_social}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground capitalize">
                    {e.regime_tributario ?? e.regime ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground capitalize">
                    {e.atividade ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
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
  const [regrasPorModelo, setRegrasPorModelo] = useState<Record<string, RegraAtivacao[]>>({});
  const [todasEmpresas, setTodasEmpresas] = useState<any[]>([]);
  const [filtroEmpresaId, setFiltroEmpresaId] = useState<string>("todas");
  const [filtroPerfil, setFiltroPerfil] = useState<string>("todos");
  const [addObrigacaoOpen, setAddObrigacaoOpen] = useState(false);
  const [addObrigacaoSelecionada, setAddObrigacaoSelecionada] = useState<string>("");
  const [addObrigacaoSaving, setAddObrigacaoSaving] = useState(false);

  async function load() {
    if (!user) return;
    setLoading(true);
    try {
      const uid = ownerUserId ?? user.id;

      // Busca obrigações — tabela sem RLS, sempre acessível
      const { data: mods } = await (supabase as any)
        .from("rotina_modelo")
        .select("*")
        .eq("ativo", true)
        .order("departamento")
        .order("nome_rotina");

      setModelos((mods ?? []) as RotinaModelo[]);

      // Busca regras de ativação (perfis) de todos os modelos
      try {
        const { data: regrasAtiv } = await (supabase as any)
          .from("regra_ativacao_rotina")
          .select("*")
          .eq("ativo", true);
        const rMap: Record<string, RegraAtivacao[]> = {};
        for (const r of (regrasAtiv ?? []) as any[]) {
          if (!rMap[r.rotina_modelo_id]) rMap[r.rotina_modelo_id] = [];
          rMap[r.rotina_modelo_id].push(r);
        }
        setRegrasPorModelo(rMap);
      } catch { /* tabela pode não existir */ }

      // Busca empresas para o filtro
      try {
        const { data: emps } = await (supabase as any)
          .from("empresas")
          .select("id, razao_social, regime_tributario, regime, atividade, possui_prolabore, possui_funcionario, tem_retencoes, contribuinte_icms, contribuinte_iss")
          .order("razao_social");
        setTodasEmpresas(emps ?? []);
      } catch { /* ignora */ }

      // Busca regras do usuário — tabela pode não existir ainda
      try {
        const { data: rules } = await (supabase as any)
          .from("regra_vencimento_usuario")
          .select("*")
          .eq("user_id", uid);
        const map: RegrasMap = {};
        for (const r of (rules ?? []) as any[]) {
          map[r.rotina_modelo_id] = {
            dia_vencimento: r.dia_vencimento?.toString() ?? "",
            dias_margem:    r.dias_margem?.toString() ?? "",
          };
        }
        setRegras(map);
      } catch {
        // tabela ainda não existe — ignora
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [user]);

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

  async function adicionarObrigacaoEmpresa() {
    if (!user || !addObrigacaoSelecionada || filtroEmpresaId === "todas") return;
    const uid = ownerUserId ?? user.id;
    setAddObrigacaoSaving(true);
    try {
      const { error } = await (supabase as any).from("empresa_rotina_config").upsert({
        user_id: uid,
        empresa_id: filtroEmpresaId,
        rotina_modelo_id: addObrigacaoSelecionada,
        ativo: true,
      }, { onConflict: "empresa_id,rotina_modelo_id" });
      if (error) throw error;
      toast({ title: "Obrigação adicionada para esta empresa!" });
      setAddObrigacaoOpen(false);
      setAddObrigacaoSelecionada("");
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setAddObrigacaoSaving(false);
    }
  }

  const empresaFiltro = useMemo(
    () => todasEmpresas.find(e => e.id === filtroEmpresaId) ?? null,
    [todasEmpresas, filtroEmpresaId]
  );

  // Empresas que têm o perfil/regime selecionado
  const empresasNoPerfil = useMemo(() => {
    if (filtroPerfil === "todos") return [];
    return todasEmpresas.filter(e => {
      const reg = e.regime_tributario ?? e.regime ?? "";
      return reg === filtroPerfil;
    });
  }, [todasEmpresas, filtroPerfil]);

  const grupos = useMemo(() => {
    let filtered = modelos;

    // Filtro por empresa
    if (empresaFiltro) {
      filtered = filtered.filter(m => {
        const regras = regrasPorModelo[m.id];
        if (!regras || regras.length === 0) return true;
        return regras.some(r => empresaMatchesRegra(empresaFiltro, r));
      });
    }

    // Filtro por perfil/regime
    if (filtroPerfil !== "todos") {
      filtered = filtered.filter(m => {
        const regras = regrasPorModelo[m.id];
        if (!regras || regras.length === 0) return true;
        return regras.some(r =>
          r.regime_tributario === "qualquer" || r.regime_tributario === filtroPerfil
        );
      });
    }

    const map: Record<string, RotinaModelo[]> = {};
    for (const m of filtered) {
      if (!map[m.departamento]) map[m.departamento] = [];
      map[m.departamento].push(m);
    }
    return DEPT_ORDER.filter(d => map[d]).map(d => ({ dept: d, items: map[d] }));
  }, [modelos, regrasPorModelo, empresaFiltro, filtroPerfil]);

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

      {/* Filtros */}
      {todasEmpresas.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            {/* Filtro por empresa */}
            <div className="flex items-center gap-2 flex-1 min-w-[220px] max-w-xs">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select value={filtroEmpresaId} onValueChange={setFiltroEmpresaId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Filtrar por empresa..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as empresas</SelectItem>
                  {todasEmpresas.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.razao_social}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filtro por perfil */}
            <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-xs">
              <span className="text-xs font-medium text-muted-foreground shrink-0">Perfil:</span>
              <Select value={filtroPerfil} onValueChange={setFiltroPerfil}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Filtrar por perfil..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os perfis</SelectItem>
                  <SelectItem value="simples">Simples Nacional</SelectItem>
                  <SelectItem value="presumido">Lucro Presumido</SelectItem>
                  <SelectItem value="real">Lucro Real</SelectItem>
                  <SelectItem value="mei">MEI</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Painel: empresas do perfil selecionado */}
          {filtroPerfil !== "todos" && (
            <EmpresasPerfilPanel
              perfil={filtroPerfil}
              empresas={empresasNoPerfil}
              selectedId={filtroEmpresaId}
              onSelect={setFiltroEmpresaId}
              onAddObrigacao={() => { setAddObrigacaoSelecionada(""); setAddObrigacaoOpen(true); }}
            />
          )}
        </div>
      )}

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
                Clique em <strong>"Nova Obrigação"</strong> para criar uma obrigação personalizada.
              </p>
            </div>
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
                  <th className="text-left px-4 py-2 w-[24%]">Obrigação</th>
                  <th className="text-left px-4 py-2 w-[8%]">Período</th>
                  <th className="text-left px-4 py-2 w-[8%]">Criticidade</th>
                  <th className="text-left px-4 py-2 w-[16%]">Perfis</th>
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
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {(regrasPorModelo[modelo.id] ?? []).length === 0 ? (
                            <span className="text-[10px] text-muted-foreground italic">Todos</span>
                          ) : (
                            (regrasPorModelo[modelo.id] ?? []).map((r: any) => (
                              <span key={r.id} className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border bg-purple-50 text-purple-700 border-purple-200">
                                {regraLabel(r)}
                              </span>
                            ))
                          )}
                        </div>
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

      {/* Dialog: Incluir obrigação para empresa específica */}
      {(() => {
        const empresa = todasEmpresas.find(e => e.id === filtroEmpresaId);
        // Obrigações que a empresa já recebe pelo perfil (baseado em regras)
        const jaTemIds = new Set(
          modelos
            .filter(m => {
              const regras = regrasPorModelo[m.id];
              if (!regras || regras.length === 0) return true;
              return regras.some(r => empresaMatchesRegra(empresa, r));
            })
            .map(m => m.id)
        );
        const disponiveis = modelos.filter(m => !jaTemIds.has(m.id));
        return (
          <Dialog open={addObrigacaoOpen} onOpenChange={setAddObrigacaoOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle style={{ color: NAVY }}>
                  Incluir Obrigação para {empresa?.razao_social}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-1">
                <p className="text-sm text-muted-foreground">
                  Selecione uma obrigação que não faz parte do perfil padrão desta empresa mas deve ser adicionada manualmente.
                </p>
                {disponiveis.length === 0 ? (
                  <p className="text-sm text-center text-muted-foreground italic py-4">
                    Esta empresa já recebe todas as obrigações cadastradas.
                  </p>
                ) : (
                  <div className="space-y-1 max-h-72 overflow-y-auto border rounded-lg divide-y">
                    {disponiveis.map(m => (
                      <div
                        key={m.id}
                        onClick={() => setAddObrigacaoSelecionada(m.id)}
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                          addObrigacaoSelecionada === m.id
                            ? "bg-[#10143D]/10 border-l-2 border-l-[#10143D]"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex-1">
                          <div className="text-sm font-medium">{m.nome_rotina}</div>
                          <div className="text-xs text-muted-foreground">{m.codigo_rotina} · {m.departamento} · {PERIOD_LABEL[m.periodicidade] ?? m.periodicidade}</div>
                        </div>
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border capitalize ${CRIT_COLOR[m.criticidade] ?? ""}`}>
                          {m.criticidade}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={() => setAddObrigacaoOpen(false)}>Cancelar</Button>
                  <Button
                    onClick={adicionarObrigacaoEmpresa}
                    disabled={!addObrigacaoSelecionada || addObrigacaoSaving}
                    style={{ backgroundColor: NAVY }}
                    className="text-white"
                  >
                    {addObrigacaoSaving ? "Salvando..." : "Incluir Obrigação"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
