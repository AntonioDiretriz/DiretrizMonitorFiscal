import { useState, useEffect, useMemo } from "react";
import { Save, Info, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

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
  [rotina_modelo_id: string]: {
    id?: string;
    dia_vencimento: string;
    dias_margem: string;
  };
}

const DEPT_ORDER = ["Fiscal", "Contábil", "DP", "Gestão", "Legalização", "Financeiro"];

const CRIT_COLOR: Record<string, string> = {
  critica: "bg-red-100 text-red-700 border-red-200",
  alta:    "bg-orange-100 text-orange-700 border-orange-200",
  media:   "bg-yellow-100 text-yellow-700 border-yellow-200",
  baixa:   "bg-green-100 text-green-700 border-green-200",
};

const PERIOD_LABEL: Record<string, string> = {
  mensal: "Mensal", trimestral: "Trimestral",
  anual: "Anual", eventual: "Eventual",
};

function calcPrazoInterno(diaLegal: string, diasMargem: string): string {
  const dia = parseInt(diaLegal);
  const margem = parseInt(diasMargem);
  if (isNaN(dia) || isNaN(margem) || dia < 1 || margem < 0) return "—";
  const resultado = dia - margem;
  if (resultado < 1) return `dia ${resultado} (mês anterior)`;
  return `dia ${resultado}`;
}

export default function ConfiguracaoObrigacoes() {
  const { user, ownerUserId } = useAuth();
  const { toast } = useToast();

  const [modelos, setModelos] = useState<RotinaModelo[]>([]);
  const [regras, setRegras] = useState<RegrasMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null); // id que está salvando

  // Carrega rotina_modelo + regras do usuário
  useEffect(() => {
    if (!user) return;
    async function load() {
      setLoading(true);
      const uid = ownerUserId ?? user!.id;

      const [{ data: mods }, { data: rules }] = await Promise.all([
        supabase.from("rotina_modelo").select("*").eq("ativo", true).order("departamento").order("nome_rotina"),
        supabase.from("regra_vencimento_usuario").select("*").eq("user_id", uid),
      ]);

      setModelos((mods ?? []) as RotinaModelo[]);

      // Monta mapa de regras existentes
      const map: RegrasMap = {};
      for (const r of (rules ?? []) as any[]) {
        map[r.rotina_modelo_id] = {
          id: r.id,
          dia_vencimento: r.dia_vencimento?.toString() ?? "",
          dias_margem:    r.dias_margem?.toString() ?? "",
        };
      }
      setRegras(map);
      setLoading(false);
    }
    load();
  }, [user, ownerUserId]);

  function getRegra(modeloId: string, field: "dia_vencimento" | "dias_margem"): string {
    return regras[modeloId]?.[field] ?? "";
  }

  function setRegra(modeloId: string, field: "dia_vencimento" | "dias_margem", value: string) {
    setRegras(prev => ({
      ...prev,
      [modeloId]: {
        ...prev[modeloId],
        [field]: value,
      },
    }));
  }

  async function salvarRegra(modelo: RotinaModelo) {
    if (!user) return;
    const uid = ownerUserId ?? user.id;
    const regra = regras[modelo.id];
    const diaVenc = regra?.dia_vencimento ? parseInt(regra.dia_vencimento) : null;
    const diasMargem = regra?.dias_margem ? parseInt(regra.dias_margem) : null;

    setSaving(modelo.id);
    try {
      const payload = {
        user_id: uid,
        rotina_modelo_id: modelo.id,
        dia_vencimento: diaVenc,
        dias_margem: diasMargem,
      };

      const { error } = await (supabase as any)
        .from("regra_vencimento_usuario")
        .upsert(payload, { onConflict: "user_id,rotina_modelo_id" });

      if (error) throw error;
      toast({ title: `Regra salva: ${modelo.nome_rotina}` });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  async function resetarRegra(modelo: RotinaModelo) {
    if (!user) return;
    const uid = ownerUserId ?? user.id;
    try {
      await (supabase as any)
        .from("regra_vencimento_usuario")
        .delete()
        .eq("user_id", uid)
        .eq("rotina_modelo_id", modelo.id);

      setRegras(prev => {
        const next = { ...prev };
        delete next[modelo.id];
        return next;
      });
      toast({ title: `Regra resetada para padrão: ${modelo.nome_rotina}` });
    } catch (err: any) {
      toast({ title: "Erro ao resetar", description: err.message, variant: "destructive" });
    }
  }

  async function salvarTodos() {
    if (!user) return;
    const uid = ownerUserId ?? user.id;
    setSaving("all");
    try {
      const payload = Object.entries(regras)
        .filter(([_, r]) => r.dia_vencimento || r.dias_margem)
        .map(([rotina_modelo_id, r]) => ({
          user_id: uid,
          rotina_modelo_id,
          dia_vencimento: r.dia_vencimento ? parseInt(r.dia_vencimento) : null,
          dias_margem:    r.dias_margem    ? parseInt(r.dias_margem)    : null,
        }));

      if (payload.length === 0) {
        toast({ title: "Nenhuma regra configurada para salvar." });
        return;
      }

      const { error } = await (supabase as any)
        .from("regra_vencimento_usuario")
        .upsert(payload, { onConflict: "user_id,rotina_modelo_id" });

      if (error) throw error;
      toast({ title: `${payload.length} regras salvas com sucesso!` });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  // Agrupa por departamento
  const grupos = useMemo(() => {
    const map: Record<string, RotinaModelo[]> = {};
    for (const m of modelos) {
      if (!map[m.departamento]) map[m.departamento] = [];
      map[m.departamento].push(m);
    }
    return DEPT_ORDER
      .filter(d => map[d])
      .map(d => ({ dept: d, items: map[d] }));
  }, [modelos]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Carregando obrigações...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Configuração de Obrigações</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Defina o vencimento legal e o prazo interno de cada obrigação para o seu escritório.
          </p>
        </div>
        <Button
          onClick={salvarTodos}
          disabled={saving === "all"}
          style={{ backgroundColor: NAVY }}
          className="text-white shrink-0"
        >
          <Save className="h-4 w-4 mr-2" />
          {saving === "all" ? "Salvando..." : "Salvar Todos"}
        </Button>
      </div>

      {/* Legenda */}
      <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
        <div>
          <strong>Como funciona:</strong> Configure o <em>Dia de Vencimento Legal</em> (data da Receita Federal/Prefeitura) e o
          <em> Prazo Interno</em> em dias antes do vencimento legal. Exemplo: DAS vence dia 20 → prazo interno 10 dias antes → entrega interna até dia 10.
          Campos em branco usam o padrão do sistema.
        </div>
      </div>

      {/* Tabela por departamento */}
      {grupos.map(({ dept, items }) => (
        <Card key={dept}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold" style={{ color: NAVY }}>
              {dept}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-xs text-muted-foreground">
                  <th className="text-left px-4 py-2 w-[35%]">Obrigação</th>
                  <th className="text-left px-4 py-2 w-[12%]">Periodicidade</th>
                  <th className="text-left px-4 py-2 w-[10%]">Criticidade</th>
                  <th className="text-center px-4 py-2 w-[14%]">
                    Dia Legal
                    <div className="font-normal text-[10px] text-muted-foreground/70 leading-tight">padrão do sistema</div>
                  </th>
                  <th className="text-center px-4 py-2 w-[14%]">
                    Prazo Interno
                    <div className="font-normal text-[10px] text-muted-foreground/70 leading-tight">dias antes do vencimento</div>
                  </th>
                  <th className="text-center px-4 py-2 w-[13%]">
                    Resultado
                  </th>
                  <th className="px-4 py-2 w-[12%]"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((modelo, idx) => {
                  const diaLegalCustom   = getRegra(modelo.id, "dia_vencimento");
                  const diasMargemCustom = getRegra(modelo.id, "dias_margem");
                  const diaLegalExib     = diaLegalCustom || (modelo.dia_vencimento?.toString() ?? "—");
                  const diasMargemExib   = diasMargemCustom || (modelo.margem_seguranca?.toString() ?? "3");
                  const temCustom        = !!(diaLegalCustom || diasMargemCustom);
                  const isSaving         = saving === modelo.id;

                  return (
                    <tr key={modelo.id} className={`border-b last:border-0 ${idx % 2 === 0 ? "" : "bg-gray-50/40"}`}>
                      {/* Nome */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{modelo.nome_rotina}</div>
                        <div className="text-xs text-muted-foreground">{modelo.codigo_rotina}</div>
                      </td>

                      {/* Periodicidade */}
                      <td className="px-4 py-3 text-muted-foreground">
                        {PERIOD_LABEL[modelo.periodicidade] ?? modelo.periodicidade}
                      </td>

                      {/* Criticidade */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border capitalize ${CRIT_COLOR[modelo.criticidade] ?? ""}`}>
                          {modelo.criticidade}
                        </span>
                      </td>

                      {/* Dia Legal (editável) */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-center">
                          <Input
                            type="number"
                            min={1}
                            max={31}
                            placeholder={modelo.dia_vencimento?.toString() ?? "—"}
                            value={diaLegalCustom}
                            onChange={e => setRegra(modelo.id, "dia_vencimento", e.target.value)}
                            className="w-16 h-8 text-center text-sm"
                          />
                        </div>
                      </td>

                      {/* Prazo Interno em dias (editável) */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-center">
                          <Input
                            type="number"
                            min={0}
                            max={31}
                            placeholder={modelo.margem_seguranca?.toString() ?? "3"}
                            value={diasMargemCustom}
                            onChange={e => setRegra(modelo.id, "dias_margem", e.target.value)}
                            className="w-16 h-8 text-center text-sm"
                          />
                          <span className="text-xs text-muted-foreground shrink-0">dias</span>
                        </div>
                      </td>

                      {/* Resultado calculado */}
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                          {calcPrazoInterno(diaLegalExib, diasMargemExib)}
                        </span>
                      </td>

                      {/* Ações */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {temCustom && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-muted-foreground hover:text-red-600"
                              title="Resetar para padrão"
                              onClick={() => resetarRegra(modelo)}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2"
                            disabled={isSaving}
                            onClick={() => salvarRegra(modelo)}
                          >
                            <Save className="h-3.5 w-3.5 mr-1" />
                            {isSaving ? "..." : "Salvar"}
                          </Button>
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
    </div>
  );
}
