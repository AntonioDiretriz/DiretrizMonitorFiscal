import { useState, useMemo, useEffect } from "react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO, isToday, isSunday, isSaturday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useRotinas, type Rotina, type RotinaStatus } from "@/hooks/useRotinas";
import RotinaDetalhe, { STATUS_CONFIG, StatusBadge } from "@/pages/RotinaDetalhe";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

// ── Palette ───────────────────────────────────────────────────────────────────
const NAVY  = "#10143D";
const RED   = "#ED3237";
const AMBER = "#f59e0b";
const GREEN = "#22c55e";
const GRAY  = "#6b7280";

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function getStatusColor(status: RotinaStatus): string {
  const cfg = STATUS_CONFIG[status];
  return cfg?.color ?? GRAY;
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function CalendarioRotinas() {
  const { user } = useAuth();
  const { data: rotinas = [] } = useRotinas();
  const [mesAtual, setMesAtual] = useState(new Date());
  const [filterEmpresa, setFilterEmpresa] = useState("_todos");
  const [selectedRotinaId, setSelectedRotinaId] = useState<string | null>(null);
  const [empresas, setEmpresas] = useState<{ id: string; razao_social: string }[]>([]);
  const [feriados, setFeriados] = useState<Record<string, string>>({}); // "yyyy-MM-dd" → nome

  useEffect(() => {
    if (!user) return;
    supabase.from("empresas").select("id, razao_social").order("razao_social")
      .then(({ data }) => setEmpresas(data ?? []));
  }, [user]);

  // Carrega feriados do mês exibido
  useEffect(() => {
    const ini = format(startOfMonth(mesAtual), "yyyy-MM-dd");
    const fim = format(endOfMonth(mesAtual),   "yyyy-MM-dd");
    (supabase as any)
      .from("feriados_nacionais")
      .select("data, nome")
      .gte("data", ini)
      .lte("data", fim)
      .then(({ data }: any) => {
        const map: Record<string, string> = {};
        (data ?? []).forEach((f: any) => { map[f.data] = f.nome; });
        setFeriados(map);
      });
  }, [mesAtual]);

  const selectedRotina = useMemo(
    () => (selectedRotinaId ? (rotinas.find(r => r.id === selectedRotinaId) ?? null) : null),
    [rotinas, selectedRotinaId]
  );

  // Build calendar grid
  const mesStart = startOfMonth(mesAtual);
  const mesEnd   = endOfMonth(mesAtual);
  const dias     = eachDayOfInterval({ start: mesStart, end: mesEnd });

  // Leading blank days (Sunday = 0)
  const startDow = getDay(mesStart);

  // Filter rotinas for this month
  const rotinasMes = useMemo(() => {
    let list = rotinas.filter(r => {
      const venc = parseISO(r.data_vencimento);
      return venc >= mesStart && venc <= mesEnd;
    });
    if (filterEmpresa !== "_todos") list = list.filter(r => r.empresa_id === filterEmpresa);
    return list;
  }, [rotinas, mesAtual, filterEmpresa]);

  // Group by day string
  const byDay = useMemo(() => {
    const map: Record<string, Rotina[]> = {};
    rotinasMes.forEach(r => {
      const key = r.data_vencimento.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return map;
  }, [rotinasMes]);

  // KPIs for month
  const kpiTotal    = rotinasMes.length;
  const kpiPendente = rotinasMes.filter(r => !["concluida", "nao_aplicavel"].includes(r.status)).length;
  const kpiAtrasada = rotinasMes.filter(r => {
    const venc = parseISO(r.data_vencimento);
    return venc < new Date() && !["concluida", "nao_aplicavel"].includes(r.status);
  }).length;
  const kpiConcluida = rotinasMes.filter(r => r.status === "concluida").length;

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Calendário de Rotinas</h1>
          <p className="text-sm text-muted-foreground">Visualização mensal das obrigações por vencimento</p>
        </div>
        <Select value={filterEmpresa} onValueChange={setFilterEmpresa}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Todas as empresas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_todos">Todas as empresas</SelectItem>
            {empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.razao_social}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total",     value: kpiTotal,     color: NAVY  },
          { label: "Pendentes", value: kpiPendente,  color: AMBER },
          { label: "Atrasadas", value: kpiAtrasada,  color: RED   },
          { label: "Concluídas",value: kpiConcluida, color: GREEN },
        ].map(k => (
          <Card key={k.label}>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold" style={{ color: k.color }}>{k.value}</p>
              <p className="text-xs text-muted-foreground">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Calendar card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg capitalize" style={{ color: NAVY }}>
              {format(mesAtual, "MMMM yyyy", { locale: ptBR })}
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={() => setMesAtual(m => subMonths(m, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setMesAtual(new Date())}>
                Hoje
              </Button>
              <Button variant="outline" size="icon" onClick={() => setMesAtual(m => addMonths(m, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-2">
            {DIAS_SEMANA.map(d => (
              <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
            {/* Blank leading cells */}
            {Array.from({ length: startDow }).map((_, i) => (
              <div key={`blank-${i}`} className="bg-gray-50 min-h-[90px]" />
            ))}

            {/* Day cells */}
            {dias.map(dia => {
              const key       = format(dia, "yyyy-MM-dd");
              const items     = byDay[key] ?? [];
              const today     = isToday(dia);
              const dow       = getDay(dia); // 0=Dom, 6=Sáb
              const fimSemana = dow === 0 || dow === 6;
              const feriado   = feriados[key];
              const hasAtrasada = items.some(r => {
                const venc = parseISO(r.data_vencimento);
                return venc < new Date() && !["concluida", "nao_aplicavel"].includes(r.status);
              });
              const hasEmRisco = !hasAtrasada && items.some(r => {
                const venc = parseISO(r.data_vencimento);
                const diff = Math.ceil((venc.getTime() - new Date().getTime()) / 86400000);
                return diff >= 0 && diff <= 2 && !["concluida"].includes(r.status);
              });

              let cellBg = "bg-white";
              if (fimSemana) cellBg = "bg-slate-50";
              if (feriado)   cellBg = "bg-purple-50";
              if (hasAtrasada) cellBg = "bg-red-50";
              if (hasEmRisco)  cellBg = "bg-amber-50";

              return (
                <div key={key} className={`${cellBg} min-h-[90px] p-1.5 flex flex-col gap-1`}>
                  {/* Day number */}
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex-1 min-w-0">
                      {feriado && (
                        <p
                          className="text-[9px] leading-tight text-purple-600 font-medium truncate"
                          title={feriado}
                        >
                          {feriado}
                        </p>
                      )}
                    </div>
                    <div
                      className={`text-xs font-bold w-6 h-6 shrink-0 flex items-center justify-center rounded-full ${
                        today ? "text-white" : fimSemana ? "text-slate-400" : hasAtrasada ? "text-red-700" : "text-gray-600"
                      }`}
                      style={today ? { backgroundColor: NAVY } : {}}
                    >
                      {format(dia, "d")}
                    </div>
                  </div>

                  {/* Rotina chips */}
                  {items.slice(0, 3).map(r => (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRotinaId(r.id)}
                      className="text-left w-full rounded px-1 py-0.5 text-[10px] leading-snug truncate font-medium hover:opacity-80 transition-opacity"
                      style={{
                        backgroundColor: getStatusColor(r.status) + "20",
                        color: getStatusColor(r.status),
                        border: `1px solid ${getStatusColor(r.status)}40`,
                      }}
                    >
                      {r.titulo}
                    </button>
                  ))}
                  {items.length > 3 && (
                    <span className="text-[10px] text-gray-400 pl-1">+{items.length - 3} mais</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legenda */}
          <div className="flex flex-wrap gap-3 pt-3 text-[11px] text-muted-foreground border-t mt-2">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-100 border border-purple-300 inline-block" /> Feriado nacional</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-100 border border-slate-200 inline-block" /> Fim de semana</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-300 inline-block" /> Vence em até 2 dias</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-300 inline-block" /> Atrasada</span>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-semibold mb-3" style={{ color: NAVY }}>Legenda — Status</p>
          <div className="flex flex-wrap gap-3">
            {(Object.entries(STATUS_CONFIG) as [RotinaStatus, { label: string; color: string }][]).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: cfg.color + "40", border: `1px solid ${cfg.color}` }} />
                <span className="text-xs text-gray-600">{cfg.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Detalhe drawer */}
      {selectedRotina && (
        <RotinaDetalhe
          rotina={selectedRotina}
          onClose={() => setSelectedRotinaId(null)}
          onUpdated={() => { /* react-query handles refresh */ }}
        />
      )}
    </div>
  );
}
