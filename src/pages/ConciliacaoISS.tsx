import { Fragment, useId, useMemo, useState } from "react";
import {
  Upload,
  FileText,
  FileSpreadsheet,
  Settings,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  Search,
  ChevronDown,
  ChevronRight,
  Loader2,
  Filter,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { parsePrefeituraCSV } from "@/lib/conciliador-iss/csv";
import { parseDealernetPDF } from "@/lib/conciliador-iss/pdf";
import { reconcile } from "@/lib/conciliador-iss/reconcile";
import { agruparPorNota } from "@/lib/conciliador-iss/agrupar";
import type {
  Config,
  ItemConciliado,
  NotaNormalizada,
  ParsedDealernet,
  ParsedPrefeitura,
  StatusMatch,
} from "@/lib/conciliador-iss/types";
import { fmtBRL, fmtISODateBR, fmtNumberBR } from "@/lib/conciliador-iss/format";


const DEFAULT_CONFIG: Config = {
  cnpjTomador: "11696408000913",
  cmcTomador: "250350",
};

interface RunResult {
  prefeitura: ParsedPrefeitura;
  dealernet: ParsedDealernet;
  reconcile: ReturnType<typeof reconcile>;
}

export default function ConciliacaoISS() {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);

  const canRun = !!csvFile && !!pdfFile && !running;

  async function handleRun() {
    if (!csvFile || !pdfFile) return;
    setRunning(true);
    setError(null);
    try {
      // O PDF traz CNPJ e Inscrição Municipal da filial no cabeçalho: usamos
      // esses dados para configurar automaticamente o filtro de tomador.
      const dealernet = await parseDealernetPDF(pdfFile);
      const effective: Config = {
        cnpjTomador: dealernet.cnpjEmpresa || config.cnpjTomador,
        cmcTomador: dealernet.inscMunicipal || config.cmcTomador,
      };
      if (
        effective.cnpjTomador !== config.cnpjTomador ||
        effective.cmcTomador !== config.cmcTomador
      ) {
        setConfig(effective);
      }
      const prefeitura = await parsePrefeituraCSV(csvFile, effective);
      if (!dealernet.notas.length) {
        throw new Error(
          "Não foi possível ler lançamentos no PDF do Dealernet. Verifique se o arquivo é o Livro de Apuração de ISS gerado em PDF (não pode ser digitalizado/imagem).",
        );
      }
      if (!prefeitura.notas.length) {
        throw new Error(
          "Não foi possível ler lançamentos no CSV da prefeitura. Exporte a consulta de NFS-e em CSV (o PDF/impressão do portal não pode ser lido).",
        );
      }
      const rec = reconcile(prefeitura.notas, dealernet.notas);
      setResult({ prefeitura, dealernet, reconcile: rec });
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }


  function reset() {
    setResult(null);
    setCsvFile(null);
    setPdfFile(null);
    setError(null);
  }

  if (result) {
    return (
      <Dashboard
        result={result}
        config={config}
        onReset={reset}
      />
    );
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Fiscal / ISS</div>
          <h1 className="text-2xl font-bold text-foreground">Conciliador NFS-e Entradas</h1>
        </div>
        <ConfigDialog config={config} onSave={setConfig} />
      </div>

      <main className="mx-auto max-w-5xl py-8">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-semibold text-foreground">Conciliar notas de entrada</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Compare o Livro de Apuração de ISS do Dealernet (PDF) com a Consulta de NFS-e da prefeitura (CSV).
            Todo o processamento acontece no seu navegador.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Dropzone
            title="Consulta NFS-e — Prefeitura"
            subtitle="ConsultaNNFSe-*.csv"
            icon={<FileSpreadsheet className="h-6 w-6" />}
            accept=".csv"
            file={csvFile}
            onFile={setCsvFile}
          />
          <Dropzone
            title="Livro de Apuração ISS — Dealernet"
            subtitle="RFS014_LivroApuracaoISS.pdf"
            icon={<FileText className="h-6 w-6" />}
            accept="application/pdf,.pdf"
            file={pdfFile}
            onFile={setPdfFile}
          />
        </div>

        {error && (
          <div className="mt-6 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="mt-8 flex items-center justify-center gap-3">
          <Button
            size="lg"
            className="min-w-48"
            disabled={!canRun}
            onClick={handleRun}
          >
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processando…
              </>
            ) : (
              <>Conciliar</>
            )}
          </Button>
        </div>

        <div className="mt-10 text-center text-xs text-muted-foreground">
          Filial configurada: CNPJ <span className="tabular">{formatCNPJ(config.cnpjTomador)}</span> · Inscrição Municipal <span className="tabular">{config.cmcTomador}</span>
        </div>
      </main>
    </div>
  );
}

function formatCNPJ(v: string): string {
  const d = v.replace(/\D/g, "").padStart(14, "0");
  if (d.length !== 14) return v;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function ConfigDialog({ config, onSave }: { config: Config; onSave: (c: Config) => void }) {
  const [cnpj, setCnpj] = useState(config.cnpjTomador);
  const [cmc, setCmc] = useState(config.cmcTomador);
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
        >
          <Settings className="mr-2 h-4 w-4" /> Configurações
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurações da filial</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="cnpj">CNPJ do tomador</Label>
            <Input
              id="cnpj"
              className="tabular"
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value.replace(/\D/g, ""))}
              placeholder="Somente dígitos"
            />
          </div>
          <div>
            <Label htmlFor="cmc">Inscrição Municipal (CMC)</Label>
            <Input
              id="cmc"
              className="tabular"
              value={cmc}
              onChange={(e) => setCmc(e.target.value.replace(/\D/g, ""))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            onClick={() => {
              onSave({ cnpjTomador: cnpj, cmcTomador: cmc });
              setOpen(false);
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Dropzone({
  title,
  subtitle,
  icon,
  accept,
  file,
  onFile,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accept: string;
  file: File | null;
  onFile: (f: File | null) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputId = useId();
  return (
    <div className="relative">
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        className={`group flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed bg-card p-8 text-center transition-colors ${
          dragOver
            ? "border-primary bg-primary/5"
            : file
              ? "border-success/50 bg-success/5"
              : "border-border hover:border-primary/60"
        }`}
      >
        <div className={`mb-3 rounded-full p-3 ${file ? "bg-success/10 text-success" : "bg-secondary text-secondary-foreground"}`}>
          {file ? <CheckCircle2 className="h-6 w-6" /> : icon}
        </div>
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>

        {file ? (
          <div className="mt-4 w-full">
            <div className="truncate rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground">
              <span className="font-medium">{file.name}</span>
              <span className="ml-2 text-muted-foreground tabular">
                {(file.size / 1024).toFixed(1)} KB
              </span>
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              Clique para trocar o arquivo
            </div>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Upload className="h-3.5 w-3.5" /> Arraste o arquivo ou clique
          </div>
        )}
      </label>
      <input
        id={inputId}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          // reset so selecting the same file again re-triggers change
          e.target.value = "";
        }}
      />
      {file && (
        <button
          type="button"
          className="absolute right-3 top-3 rounded-md bg-background/80 px-2 py-1 text-[11px] text-muted-foreground underline hover:text-foreground"
          onClick={() => onFile(null)}
        >
          remover
        </button>
      )}
    </div>
  );
}

// ============================================================
// DASHBOARD
// ============================================================

function categorizeSituacao(s: string | undefined): string {
  const v = (s ?? "").trim();
  if (!v) return "Sem situação";
  if (/substitu/i.test(v)) return "Substituída";
  if (/cancel/i.test(v)) return "Cancelada";
  if (/normal/i.test(v)) return "Normal";
  return v;
}

const DEFAULT_SITUACOES = new Set<string>(["Normal"]);
const DEFAULT_TIPOS = new Set<"entrada" | "saida">(["entrada"]);

function Dashboard({
  result,
  config,
  onReset,
}: {
  result: RunResult;
  config: Config;
  onReset: () => void;
}) {
  const { prefeitura, dealernet, reconcile: recRaw } = result;
  const [query, setQuery] = useState("");

  // Categorias disponíveis + contagens (todas as notas do CSV, sem filtro)
  const situacoesDisponiveis = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of prefeitura.notas) {
      const c = categorizeSituacao(n.situacao);
      map.set(c, (map.get(c) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [prefeitura.notas]);

  const tiposDisponiveis = useMemo(() => {
    const map = new Map<"entrada" | "saida", number>();
    for (const n of prefeitura.notas) {
      const t = n.tipo ?? "entrada";
      map.set(t, (map.get(t) ?? 0) + 1);
    }
    return map;
  }, [prefeitura.notas]);

  const [situacaoFilter, setSituacaoFilter] = useState<Set<string>>(() => {
    // se não houver "Normal", começa com tudo marcado
    return new Set(DEFAULT_SITUACOES);
  });
  const [tipoFilter, setTipoFilter] = useState<Set<"entrada" | "saida">>(
    () => new Set(DEFAULT_TIPOS),
  );

  function toggleSituacao(c: string) {
    setSituacaoFilter((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }
  function toggleTipo(t: "entrada" | "saida") {
    setTipoFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  const prefFiltradas = useMemo(() => {
    const base = prefeitura.notas.filter(
      (n) =>
        situacaoFilter.has(categorizeSituacao(n.situacao)) &&
        tipoFilter.has(n.tipo ?? "entrada"),
    );
    return agruparPorNota(base);
  }, [prefeitura.notas, situacaoFilter, tipoFilter]);

  const dealNotas = useMemo(
    () => agruparPorNota(dealernet.notas),
    [dealernet.notas],
  );

  const rec = useMemo(
    () => reconcile(prefFiltradas, dealNotas),
    [prefFiltradas, dealNotas],
  );
  // recRaw só usado para eventual referência futura; mantém compatibilidade
  void recRaw;

  const kpis = useMemo(() => {
    const somaP = sumNotas(prefFiltradas);
    const somaD = sumNotas(dealNotas);
    return { somaP, somaD };
  }, [prefFiltradas, dealNotas]);


  const filtered = useMemo(() => {
    if (!query.trim()) return rec.items;
    const q = query.toLowerCase();
    return rec.items.filter((it) => {
      const nota = it.prefeitura ?? it.dealernet;
      if (!nota) return false;
      return (
        nota.razaoSocial.toLowerCase().includes(q) ||
        nota.cnpjPrestador.includes(q.replace(/\D/g, ""))
      );
    });
  }, [rec.items, query]);

  const byStatus = (statuses: StatusMatch[]) =>
    filtered.filter((it) => statuses.includes(it.status));


  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <header className="rounded-lg border bg-card text-card-foreground">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                Conciliador NFS-e Entradas
              </div>
              <h1 className="mt-0.5 text-lg font-semibold">
                {dealernet.razaoEmpresa || "Empresa"}
              </h1>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="tabular">CNPJ {formatCNPJ(dealernet.cnpjEmpresa || config.cnpjTomador)}</span>
              {dealernet.periodoInicio && (
                <span className="tabular">
                  Período {fmtISODateBR(dealernet.periodoInicio)} a {fmtISODateBR(dealernet.periodoFim || "")}
                </span>
              )}
            </div>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={onReset}
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Novo upload
          </Button>
        </div>
      </header>

      <main className="py-6">
        {(prefeitura.avisos?.length ?? 0) > 0 && (
          <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 p-4 text-sm text-foreground">
            <p className="font-medium">Atenção na leitura do CSV da prefeitura</p>
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              {prefeitura.avisos!.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            {prefeitura.mapeamento && (
              <p className="mt-2 text-xs text-muted-foreground">
                Colunas encontradas: {prefeitura.mapeamento.cabecalhos.join(" · ")}
              </p>
            )}
          </div>
        )}

        {/* KPIs */}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPI
            label="Notas"
            prefeitura={prefFiltradas.length}
            dealernet={dealernet.notas.length}
            format={(n) => String(n)}
          />
          <KPI
            label="Valor Nota"
            prefeitura={kpis.somaP.valorNota}
            dealernet={kpis.somaD.valorNota}
            format={fmtBRL}
          />
          <KPI
            label="Valor ISS"
            prefeitura={kpis.somaP.valorISS}
            dealernet={kpis.somaD.valorISS}
            format={fmtBRL}
          />
          <KPI
            label="ISS Retido"
            prefeitura={kpis.somaP.issRetido}
            dealernet={kpis.somaD.issRetido}
            format={fmtBRL}
          />
        </div>

        <DiagnosticoDivergencia rec={rec} somaP={kpis.somaP} somaD={kpis.somaD} />


        {/* Filtros do CSV da prefeitura */}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border bg-card px-4 py-2.5 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            <span className="font-medium uppercase tracking-wide">Filtrar CSV</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(["entrada", "saida"] as const).map((t) => {
              const count = tiposDisponiveis.get(t) ?? 0;
              const active = tipoFilter.has(t);
              const label = t === "entrada" ? "Entrada" : "Saída";
              return (
                <FilterChip
                  key={t}
                  active={active}
                  disabled={count === 0}
                  onClick={() => toggleTipo(t)}
                  label={label}
                  count={count}
                />
              );
            })}
            <span className="mx-1 h-4 w-px bg-border" />
            {situacoesDisponiveis.map(([c, count]) => (
              <FilterChip
                key={c}
                active={situacaoFilter.has(c)}
                onClick={() => toggleSituacao(c)}
                label={c}
                count={count}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setTipoFilter(new Set(DEFAULT_TIPOS));
              setSituacaoFilter(new Set(DEFAULT_SITUACOES));
            }}
            className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
          >
            Padrão (Entrada · Normal)
          </button>
          <div className="ml-auto tabular text-[11px] text-muted-foreground">
            {prefFiltradas.length} nota(s) · {prefeitura.notas.length} linhas no CSV
          </div>

        </div>

        {/* Toolbar: status + busca */}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border bg-card px-4 py-2.5 text-sm">
          <StatusChip icon={<CheckCircle2 className="h-4 w-4" />} tone="success">
            <span className="tabular font-semibold">{rec.counts.MATCH_OK}</span> OK
          </StatusChip>
          <span className="h-4 w-px bg-border" />
          <StatusChip icon={<AlertTriangle className="h-4 w-4" />} tone="warning">
            <span className="tabular font-semibold">
              {rec.counts.MATCH_COMPETENCIA_DIVERGE +
                rec.counts.MATCH_VALOR_DIVERGE +
                rec.counts.AMBIGUO +
                rec.counts.alertados}
            </span>{" "}
            divergentes
          </StatusChip>
          <span className="h-4 w-px bg-border" />
          <StatusChip icon={<XCircle className="h-4 w-4" />} tone="destructive">
            <span className="tabular font-semibold">
              {rec.counts.SO_NA_PREFEITURA + rec.counts.SO_NO_DEALERNET}
            </span>{" "}
            faltantes
          </StatusChip>
          <div className="ml-auto relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 w-72 pl-8"
              placeholder="Buscar razão social ou CNPJ"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <Tabs defaultValue="todas" className="mt-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="todas">Todas <TabCount n={filtered.length} /></TabsTrigger>
            <TabsTrigger value="ok">
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-success" />
              OK <TabCount n={byStatus(["MATCH_OK"]).filter((it) => it.alertas.length === 0).length} />
            </TabsTrigger>
            <TabsTrigger value="div">
              <AlertTriangle className="mr-1.5 h-3.5 w-3.5 text-warning" />
              Divergentes{" "}
              <TabCount
                n={
                  byStatus([
                    "MATCH_COMPETENCIA_DIVERGE",
                    "MATCH_VALOR_DIVERGE",
                    "AMBIGUO",
                  ]).length +
                  byStatus(["MATCH_OK"]).filter((it) => it.alertas.length > 0).length
                }
              />
            </TabsTrigger>
            <TabsTrigger value="pref">
              <XCircle className="mr-1.5 h-3.5 w-3.5 text-destructive" />
              Só Prefeitura <TabCount n={byStatus(["SO_NA_PREFEITURA"]).length} />
            </TabsTrigger>
            <TabsTrigger value="deal">
              <XCircle className="mr-1.5 h-3.5 w-3.5 text-destructive" />
              Só Dealernet <TabCount n={byStatus(["SO_NO_DEALERNET"]).length} />
            </TabsTrigger>
            <TabsTrigger value="totais">
              <FileText className="mr-1.5 h-3.5 w-3.5" /> Totais do PDF
            </TabsTrigger>
          </TabsList>


          <TabsContent value="todas">
            <ResultsTable items={filtered} filename="conciliacao-todas.csv" />
          </TabsContent>
          <TabsContent value="ok">
            <ResultsTable
              items={byStatus(["MATCH_OK"]).filter((it) => it.alertas.length === 0)}
              filename="conciliacao-ok.csv"
            />
          </TabsContent>
          <TabsContent value="div">
            <ResultsTable
              items={[
                ...byStatus(["MATCH_OK"]).filter((it) => it.alertas.length > 0),
                ...byStatus([
                  "MATCH_COMPETENCIA_DIVERGE",
                  "MATCH_VALOR_DIVERGE",
                  "AMBIGUO",
                ]),
              ]}
              filename="conciliacao-divergentes.csv"
            />
          </TabsContent>
          <TabsContent value="pref">
            <ResultsTable
              items={byStatus(["SO_NA_PREFEITURA"])}
              filename="conciliacao-so-prefeitura.csv"
            />
          </TabsContent>
          <TabsContent value="deal">
            <ResultsTable
              items={byStatus(["SO_NO_DEALERNET"])}
              filename="conciliacao-so-dealernet.csv"
            />
          </TabsContent>
          <TabsContent value="totais">
            <TotaisPanel dealernet={dealernet} calculado={kpis.somaD} />
          </TabsContent>
        </Tabs>

        <div className="mt-6 flex justify-end">
          <Button variant="outline" onClick={() => exportItemsCSV(rec.items, "relatorio-completo.csv")}>
            <Download className="mr-2 h-4 w-4" /> Exportar relatório completo
          </Button>
        </div>
      </main>
    </div>
  );
}

function sumNotas(notas: NotaNormalizada[]) {
  return notas.reduce(
    (acc, n) => {
      acc.valorNota += n.valorNota;
      acc.valorISS += n.valorISS;
      acc.issRetido += n.issRetido;
      acc.baseISS += n.baseISS;
      return acc;
    },
    { valorNota: 0, valorISS: 0, issRetido: 0, baseISS: 0 },
  );
}

function DiagnosticoDivergencia({
  rec,
  somaP,
  somaD,
}: {
  rec: ReturnType<typeof reconcile>;
  somaP: { valorNota: number; valorISS: number; issRetido: number; baseISS: number };
  somaD: { valorNota: number; valorISS: number; issRetido: number; baseISS: number };
}) {
  const diff = somaD.valorNota - somaP.valorNota;
  if (Math.abs(diff) <= 0.02) return null;

  const soDealernet = rec.items.filter((it) => it.status === "SO_NO_DEALERNET" && it.dealernet);
  const soPrefeitura = rec.items.filter((it) => it.status === "SO_NA_PREFEITURA" && it.prefeitura);
  const valorDiverge = rec.items.filter(
    (it) => it.status === "MATCH_VALOR_DIVERGE" && it.prefeitura && it.dealernet,
  );

  const sumDeal = soDealernet.reduce((a, it) => a + (it.dealernet?.baseISS || it.dealernet?.valorNota || 0), 0);
  const sumPref = soPrefeitura.reduce((a, it) => a + (it.prefeitura?.valorNota || 0), 0);
  const sumValDivDeal = valorDiverge.reduce(
    (a, it) => a + ((it.dealernet?.baseISS || it.dealernet?.valorNota || 0) - (it.prefeitura?.valorNota || 0)),
    0,
  );

  const dealMaior = diff > 0;
  const explicado = sumDeal - sumPref + sumValDivDeal;
  const naoExplicado = diff - explicado;

  return (
    <div className="mt-4 rounded-lg border border-warning/40 bg-warning/5 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        <div className="flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="text-sm font-semibold text-foreground">
              Divergência de {fmtBRL(Math.abs(diff))} no Valor Nota
            </h3>
            <span className="text-xs text-muted-foreground">
              Dealernet {dealMaior ? "> " : "< "} Prefeitura
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {dealMaior
              ? "Há lançamentos no Dealernet que não foram encontrados na prefeitura."
              : "Há lançamentos na prefeitura que não foram encontrados no Dealernet."}
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <OriginCard
              tone={dealMaior ? "destructive" : "muted"}
              title="Só no Dealernet"
              subtitle="Falta lançar na prefeitura (ou nota cancelada/fora do município)"
              soma={sumDeal}
              fileName="so-no-dealernet.csv"
              itens={soDealernet.map((it) => ({
                razao: it.dealernet!.razaoSocial,
                cnpj: it.dealernet!.cnpjPrestador,
                numero: it.dealernet!.numeroNota,
                valor: it.dealernet!.baseISS || it.dealernet!.valorNota,
                data: it.dealernet!.data,
              }))}
            />
            <OriginCard
              tone={!dealMaior ? "destructive" : "muted"}
              title="Só na Prefeitura"
              subtitle="Falta lançar no Dealernet"
              soma={sumPref}
              fileName="so-na-prefeitura.csv"
              itens={soPrefeitura.map((it) => ({
                razao: it.prefeitura!.razaoSocial,
                cnpj: it.prefeitura!.cnpjPrestador,
                numero: it.prefeitura!.numeroNota,
                valor: it.prefeitura!.valorNota,
                data: it.prefeitura!.data,
              }))}
            />
            <OriginCard
              tone="warning"
              title="Valor divergente"
              subtitle="Mesmo prestador com valores diferentes entre os dois lados"
              soma={sumValDivDeal}
              somaLabel="Δ Dealernet − Prefeitura"
              fileName="valor-divergente.csv"
              itens={valorDiverge.map((it) => ({
                razao: it.prefeitura!.razaoSocial,
                cnpj: it.prefeitura!.cnpjPrestador,
                numero: it.prefeitura!.numeroNota,
                valor: (it.dealernet!.baseISS || it.dealernet!.valorNota) - it.prefeitura!.valorNota,
                data: it.prefeitura!.data,
              }))}
            />
          </div>


          <div className="mt-3 rounded-md bg-background/60 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Diferença explicada pelos itens acima: </span>
            <span className="tabular font-semibold text-foreground">{fmtBRL(explicado)}</span>
            {Math.abs(naoExplicado) > 0.02 && (
              <>
                <span className="text-muted-foreground"> · Restante não explicado: </span>
                <span className="tabular font-semibold text-destructive">{fmtBRL(naoExplicado)}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface OriginItem {
  razao: string;
  cnpj: string;
  numero: string;
  valor: number;
  data: string;
}

function OriginCard({
  tone,
  title,
  subtitle,
  soma,
  somaLabel,
  itens,
  fileName,
}: {
  tone: "destructive" | "warning" | "muted";
  title: string;
  subtitle: string;
  soma: number;
  somaLabel?: string;
  itens: OriginItem[];
  fileName: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const count = itens.length;
  const visiveis = showAll ? itens : itens.slice(0, 5);

  const toneClasses =
    tone === "destructive"
      ? "border-destructive/30 bg-destructive/5"
      : tone === "warning"
        ? "border-warning/30 bg-warning/5"
        : "border-border bg-card";
  const valueTone =
    tone === "destructive"
      ? "text-destructive"
      : tone === "warning"
        ? "text-warning-foreground"
        : "text-muted-foreground";

  function exportar() {
    const header = ["Nº Nota", "CNPJ Prestador", "Razão Social", "Data", "Valor"];
    const rows = itens.map((a) => [a.numero, a.cnpj, a.razao, a.data, brNum(a.valor)]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={`rounded-md border p-3 ${toneClasses}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">{title}</span>
        <span className="tabular text-[11px] font-medium text-muted-foreground">
          {count} {count === 1 ? "nota" : "notas"}
        </span>
      </div>
      <div className={`tabular mt-1 text-base font-semibold ${valueTone}`}>{fmtBRL(soma)}</div>
      {somaLabel && (
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{somaLabel}</div>
      )}
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{subtitle}</p>
      {count > 0 && (
        <>
          <ul
            className={`mt-2 space-y-1 border-t pt-2 ${showAll ? "max-h-64 overflow-y-auto pr-1" : ""}`}
          >
            {visiveis.map((a, i) => (
              <li key={i} className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="truncate text-foreground" title={`${a.razao} — ${a.cnpj}`}>
                  <span className="text-muted-foreground">#{a.numero}</span> {a.razao}
                </span>
                <span className="tabular shrink-0 font-medium text-foreground">
                  {fmtBRL(a.valor)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-3 border-t pt-2">
            {count > 5 && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
              >
                {showAll ? "Ver menos" : `Ver todas (${count})`}
              </button>
            )}
            <button
              type="button"
              onClick={exportar}
              className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:underline"
            >
              Exportar CSV
            </button>
          </div>
        </>
      )}
    </div>
  );
}


function KPI({

  label,
  prefeitura,
  dealernet,
  format,
}: {
  label: string;
  prefeitura: number;
  dealernet: number;
  format: (n: number) => string;
}) {
  const diff = dealernet - prefeitura;
  const isInt = Number.isInteger(prefeitura) && Number.isInteger(dealernet);
  const hasDiff = isInt ? diff !== 0 : Math.abs(diff) > 0.02;
  const diffStr = isInt ? String(Math.abs(diff)) : format(Math.abs(diff));
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          {hasDiff && (
            <span
              className={`tabular rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                diff > 0
                  ? "bg-warning/15 text-warning-foreground"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              {diff > 0 ? "+" : "−"}
              {diffStr}
            </span>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Prefeitura
            </div>
            <div className="tabular mt-0.5 text-sm font-semibold text-foreground">
              {format(prefeitura)}
            </div>
          </div>
          <div className="border-l pl-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Dealernet
            </div>
            <div className="tabular mt-0.5 text-sm font-semibold text-foreground">
              {format(dealernet)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


function StatusChip({
  icon,
  tone,
  children,
}: {
  icon: React.ReactNode;
  tone: "success" | "warning" | "destructive";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : "text-destructive";
  return (
    <div className={`flex items-center gap-1.5 font-medium ${toneClass}`}>
      {icon}
      <span>{children}</span>
    </div>
  );
}

function FilterChip({
  active,
  disabled,
  onClick,
  label,
  count,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          active ? "bg-primary" : "bg-muted-foreground/40"
        }`}
      />
      {label}
      <span className="tabular text-[10px] opacity-70">{count}</span>
    </button>
  );
}

function TabCount({ n }: { n: number }) {
  return (
    <span className="tabular ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      {n}
    </span>
  );
}

// ============================================================
// TABLE
// ============================================================

const STATUS_META: Record<StatusMatch, { label: string; className: string }> = {
  MATCH_OK: { label: "OK", className: "bg-success/10 text-success border-success/30" },
  MATCH_COMPETENCIA_DIVERGE: {
    label: "Competência ≠",
    className: "bg-warning/15 text-warning-foreground border-warning/40",
  },
  MATCH_VALOR_DIVERGE: {
    label: "Valor ≠",
    className: "bg-warning/15 text-warning-foreground border-warning/40",
  },
  AMBIGUO: {
    label: "Ambíguo",
    className: "bg-warning/15 text-warning-foreground border-warning/40",
  },
  SO_NA_PREFEITURA: {
    label: "Só Prefeitura",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
  SO_NO_DEALERNET: {
    label: "Só Dealernet",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
};

function ResultsTable({ items, filename }: { items: ItemConciliado[]; filename: string }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (k: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {items.length} lançamentos
        </CardTitle>
        <Button variant="outline" size="sm" onClick={() => exportItemsCSV(items, filename)}>
          <Download className="mr-2 h-3.5 w-3.5" /> Exportar CSV
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-6"></TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Prestador</TableHead>
              <TableHead>CNPJ</TableHead>
              <TableHead>Nº Nota</TableHead>
              <TableHead>Competência</TableHead>
              <TableHead className="text-right">Valor Nota</TableHead>
              <TableHead className="text-right">Valor ISS</TableHead>
              <TableHead className="text-right">ISS Retido</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum lançamento nesta visão.
                </TableCell>
              </TableRow>
            )}
            {items.map((it) => {
              const primary = it.prefeitura ?? it.dealernet!;
              const meta = STATUS_META[it.status];
              const isOpen = expanded.has(it.key);
              return (
                <Fragment key={it.key}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => toggle(it.key)}
                  >
                    <TableCell>
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={meta.className}>
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate">{primary.razaoSocial || "—"}</TableCell>
                    <TableCell className="tabular text-xs">{formatCNPJ(primary.cnpjPrestador)}</TableCell>
                    <TableCell className="tabular text-xs">{primary.numeroNota || "—"}</TableCell>
                    <TableCell className="tabular text-xs">{primary.competencia || "—"}</TableCell>
                    <TableCell className="tabular text-right">{fmtBRL(primary.valorNota)}</TableCell>
                    <TableCell className="tabular text-right">{fmtBRL(primary.valorISS)}</TableCell>
                    <TableCell className="tabular text-right">{fmtBRL(primary.issRetido)}</TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={9}>
                        <ExpandedRow item={it} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ExpandedRow({ item }: { item: ItemConciliado }) {
  const p = item.prefeitura;
  const d = item.dealernet;
  const diffs = new Set<string>();
  if (p && d) {
    // Comparamos p.valorNota × d.baseISS (o "Valor Nota" do Dealernet já vem
    // líquido quando há dedução; a Base ISS é o bruto equivalente ao CSV).
    if (Math.abs(p.valorNota - (d.baseISS || d.valorNota)) > 0.02) diffs.add("valorNota");
    if (Math.abs(p.valorISS - d.valorISS) > 0.02) diffs.add("valorISS");
    if (Math.abs(p.issRetido - d.issRetido) > 0.02) diffs.add("issRetido");
    if (p.competencia !== d.competencia) diffs.add("competencia");
    if (p.aliquota && d.aliquota && Math.abs(p.aliquota - d.aliquota) > 0.001) diffs.add("aliquota");
  }

  return (
    <div className="space-y-3 py-2">
      {item.alertas.length > 0 && (
        <ul className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
          {item.alertas.map((a, i) => (
            <li key={i} className="flex items-start gap-2 text-warning-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-warning" />
              {a}
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <SidePanel title="Prefeitura" nota={p} diffs={diffs} />
        <SidePanel title="Dealernet" nota={d} diffs={diffs} />
      </div>
      {item.candidatos && item.candidatos.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            Candidatos no Dealernet ({item.candidatos.length})
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {item.candidatos.map((c, i) => (
              <SidePanel key={i} title={`Candidato #${i + 1}`} nota={c} diffs={new Set()} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SidePanel({
  title,
  nota,
  diffs,
}: {
  title: string;
  nota?: NotaNormalizada;
  diffs: Set<string>;
}) {
  if (!nota) {
    return (
      <div className="rounded-md border bg-card p-3 text-xs text-muted-foreground">
        <div className="mb-2 font-medium text-foreground">{title}</div>
        Sem registro.
      </div>
    );
  }
  const row = (label: string, value: string, key?: string) => (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular text-right ${key && diffs.has(key) ? "font-semibold text-destructive" : ""}`}>
        {value}
      </span>
    </div>
  );
  return (
    <div className="space-y-1.5 rounded-md border bg-card p-3 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-medium text-foreground">{title}</div>
        <Badge variant="secondary" className="tabular text-[10px]">
          {nota.origem}
        </Badge>
      </div>
      {row("Razão social", nota.razaoSocial || "—")}
      {row("CNPJ", formatCNPJ(nota.cnpjPrestador))}
      {row("Nº Nota", nota.numeroNota || "—")}
      {row("Data", fmtISODateBR(nota.data) || "—")}
      {row("Competência", nota.competencia || "—", "competencia")}
      {row("Valor Nota", fmtBRL(nota.valorNota), "valorNota")}
      {row("Base ISS", fmtBRL(nota.baseISS))}
      {row("Alíquota", `${fmtNumberBR(nota.aliquota)}%`, "aliquota")}
      {row("Valor ISS", fmtBRL(nota.valorISS), "valorISS")}
      {row("ISS Retido", fmtBRL(nota.issRetido), "issRetido")}
      {nota.situacao && row("Situação", nota.situacao)}
      {nota.tipoRetencao && row("Tipo Retenção", nota.tipoRetencao)}
    </div>
  );
}

// ============================================================
// TOTAIS PANEL
// ============================================================

function TotaisPanel({
  dealernet,
  calculado,
}: {
  dealernet: ParsedDealernet;
  calculado: { valorNota: number; valorISS: number; issRetido: number; baseISS: number };
}) {
  const t = dealernet.totais;
  const rows: { label: string; impresso?: number; calc: number }[] = [
    { label: "Valor Nota", impresso: t.valorNota, calc: calculado.valorNota },
    { label: "Deduções", impresso: t.deducoes, calc: 0 },
    { label: "Base ISS", impresso: t.baseISS, calc: calculado.baseISS },
    { label: "Valor ISS", impresso: t.valorISS, calc: calculado.valorISS },
    { label: "ISS Retido", impresso: t.issRetido, calc: calculado.issRetido },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Totais impressos no PDF vs calculados</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead></TableHead>
              <TableHead className="text-right">Impresso (Dealernet)</TableHead>
              <TableHead className="text-right">Calculado (soma parse)</TableHead>
              <TableHead className="text-right">Diferença</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const has = r.impresso != null;
              const diff = has ? (r.calc - (r.impresso ?? 0)) : 0;
              const ok = has && Math.abs(diff) <= 0.02;
              return (
                <TableRow key={r.label}>
                  <TableCell className="font-medium">{r.label}</TableCell>
                  <TableCell className="tabular text-right">
                    {has ? fmtBRL(r.impresso!) : "—"}
                  </TableCell>
                  <TableCell className="tabular text-right">{fmtBRL(r.calc)}</TableCell>
                  <TableCell
                    className={`tabular text-right ${!has ? "text-muted-foreground" : ok ? "text-success" : "text-destructive"}`}
                  >
                    {has ? fmtBRL(diff) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
            {t.saldoDevedor != null && (
              <TableRow>
                <TableCell className="font-medium">Saldo Devedor</TableCell>
                <TableCell className="tabular text-right">{fmtBRL(t.saldoDevedor)}</TableCell>
                <TableCell className="tabular text-right text-muted-foreground">—</TableCell>
                <TableCell className="tabular text-right text-muted-foreground">—</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <p className="mt-4 text-xs text-muted-foreground">
          Se alguma linha estiver em vermelho, o parser do PDF pode ter falhado em capturar
          um lançamento — revise os dados brutos antes de tomar decisões.
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================
// EXPORT
// ============================================================

function exportItemsCSV(items: ItemConciliado[], filename: string) {
  const header = [
    "Status",
    "Alertas",
    "Razao Social",
    "CNPJ Prestador",
    "Numero Nota Prefeitura",
    "Numero Nota Dealernet",
    "Competencia Prefeitura",
    "Competencia Dealernet",
    "Data Prefeitura",
    "Data Dealernet",
    "Valor Nota Prefeitura",
    "Valor Nota Dealernet",
    "Base ISS Prefeitura",
    "Base ISS Dealernet",
    "Aliquota Prefeitura",
    "Aliquota Dealernet",
    "Valor ISS Prefeitura",
    "Valor ISS Dealernet",
    "ISS Retido Prefeitura",
    "ISS Retido Dealernet",
    "Situacao Prefeitura",
    "Tipo Retencao Prefeitura",
  ];
  const rows = items.map((it) => {
    const p = it.prefeitura;
    const d = it.dealernet;
    const primary = p ?? d!;
    return [
      it.status,
      it.alertas.join(" | "),
      primary.razaoSocial,
      primary.cnpjPrestador,
      p?.numeroNota ?? "",
      d?.numeroNota ?? "",
      p?.competencia ?? "",
      d?.competencia ?? "",
      p?.data ?? "",
      d?.data ?? "",
      p ? brNum(p.valorNota) : "",
      d ? brNum(d.valorNota) : "",
      p ? brNum(p.baseISS) : "",
      d ? brNum(d.baseISS) : "",
      p ? brNum(p.aliquota) : "",
      d ? brNum(d.aliquota) : "",
      p ? brNum(p.valorISS) : "",
      d ? brNum(d.valorISS) : "",
      p ? brNum(p.issRetido) : "",
      d ? brNum(d.issRetido) : "",
      p?.situacao ?? "",
      p?.tipoRetencao ?? "",
    ];
  });
  const csv = [header, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function brNum(n: number): string {
  return n.toFixed(2).replace(".", ",");
}
