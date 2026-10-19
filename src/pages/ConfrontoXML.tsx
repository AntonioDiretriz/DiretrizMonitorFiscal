import { useState, useCallback, Component, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UploadSection } from '@/components/confronto-xml/UploadSection';
import { ResultsSection } from '@/components/confronto-xml/ResultsSection';
import { BaseNfeSection } from '@/components/confronto-xml/BaseNfeSection';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { parseSheet } from '@/lib/excel-parser';
import { parseXmlFiles } from '@/lib/xml-parser';
import { runConfronto } from '@/lib/confronto-engine';
import { salvarXmls, carregarXmlsDaEmpresa, mesclarXmls } from '@/lib/xml-storage';
import { salvarLinhasExcel, carregarLinhasDaEmpresa, mesclarLinhas } from '@/lib/excel-storage';
import { listarFechamentos, excluirFechamento, carregarResultados } from '@/lib/fechamentos';
import { exportResults } from '@/lib/export-excel';
import { useAuth } from '@/contexts/AuthContext';
import type { WorkBook } from 'xlsx';
import type { ConfrontoResult, ConfrontoSummary, FechamentoMensal } from '@/lib/xml-confront-types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Trash2, ExternalLink, CalendarDays, FileCheck2, ScanSearch, Database, Download, Loader2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function formatMonthLabel(key: string) {
  if (!key || key === 'sem-data') return 'Sem data';
  const [year, month] = key.split('-');
  const idx = parseInt(month, 10) - 1;
  const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${MONTH_NAMES[idx] ?? month}/${year}`;
}

function formatDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

class ResultsErrorBoundary extends Component<{ children: ReactNode; onReset: () => void }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[confronto] erro ao exibir os resultados:', error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="mx-auto max-w-3xl rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <h2 className="text-lg font-semibold text-destructive">Não foi possível exibir os resultados</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          O confronto foi processado, mas ocorreu um erro ao montar a tela. Detalhe técnico:
        </p>
        <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-muted p-3 font-mono text-xs text-destructive">
          {error.name}: {error.message}
        </pre>
        <div className="mt-4 flex gap-3">
          <Button onClick={() => this.setState({ error: null })}>Tentar novamente</Button>
          <Button
            variant="outline"
            onClick={() => {
              this.setState({ error: null });
              this.props.onReset();
            }}
          >
            Voltar ao envio
          </Button>
        </div>
      </div>
    );
  }
}

/* -------------------------------------------------------------------------- */
/* ConfrontoXML Page                                                           */
/* -------------------------------------------------------------------------- */

type Stage = 'upload' | 'results';

interface ConfrontoState {
  results: ConfrontoResult[];
  summary: ConfrontoSummary;
  empresaId: string;
}

export default function ConfrontoXML() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') ?? 'confronto';

  const [stage, setStage] = useState<Stage>('upload');
  const [state, setState] = useState<ConfrontoState | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  /* ---- Fechamentos list ---- */
  const { data: fechamentos = [], isLoading: loadingFechamentos } = useQuery<FechamentoMensal[]>({
    queryKey: ['fechamentos_mensais'],
    queryFn: () => listarFechamentos(),
    enabled: !!user,
  });

  const deleteMutation = useMutation({
    mutationFn: excluirFechamento,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fechamentos_mensais'] });
      toast.success('Fechamento excluído');
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* ---- Processing handler ---- */
  const handleProcess = useCallback(
    async (xmlFiles: File[], workbook: WorkBook | null, selectedSheets: string[], empresaId: string) => {
      if (!user) {
        toast.error('Faça login para continuar');
        return;
      }
      setIsProcessing(true);
      setProgressLabel('');
      try {
        // 1. Lê os XMLs enviados
        const novosXmls = xmlFiles.length > 0
          ? await parseXmlFiles(xmlFiles, (lidos, total) =>
              setProgressLabel(`Lendo XMLs: ${lidos} de ${total}`))
          : [];

        // 2. Salva os XMLs novos na base da empresa
        let xmlsSalvos = 0;
        if (novosXmls.length > 0) {
          xmlsSalvos = await salvarXmls(empresaId, user.id, novosXmls, (salvos, total) =>
            setProgressLabel(`Salvando XMLs: ${salvos} de ${total}`));
        }

        // 3. Carrega a base de XMLs da empresa (e filiais) e mescla
        setProgressLabel('Carregando base de XMLs…');
        const historicoXmls = await carregarXmlsDaEmpresa(empresaId, (carregados, total) =>
          setProgressLabel(`Carregando base de XMLs: ${carregados} de ${total}`));
        const todosXmls = mesclarXmls(novosXmls, historicoXmls);

        // 4. Lê a planilha (se enviada), salva as linhas novas e mescla com a base histórica
        setProgressLabel('Lendo planilha…');
        const novasLinhas = workbook
          ? selectedSheets.flatMap((sheet) => parseSheet(workbook, sheet))
          : [];
        let linhasSalvas = 0;
        if (novasLinhas.length > 0) {
          setProgressLabel(`Salvando ${novasLinhas.length} linha(s) da planilha…`);
          linhasSalvas = await salvarLinhasExcel(empresaId, user.id, novasLinhas);
        }
        const historicoLinhas = await carregarLinhasDaEmpresa(empresaId, (carregadas, total) =>
          setProgressLabel(`Carregando base de planilhas: ${carregadas} de ${total}`));
        const todasLinhas = mesclarLinhas(novasLinhas, historicoLinhas);

        if (todasLinhas.length === 0) {
          toast.error('Nenhuma linha de planilha disponível para esta empresa. Envie um Excel.');
          return;
        }

        setProgressLabel(`Comparando ${todasLinhas.length} linha(s) com ${todosXmls.length} XML(s)…`);
        await new Promise((r) => setTimeout(r, 0));
        const { results, summary } = runConfronto(todasLinhas, todosXmls);

        setState({ results, summary, empresaId });
        setStage('results');

        const partes: string[] = [];
        if (novosXmls.length > 0) partes.push(`${xmlsSalvos} novo(s) XML salvo(s)`);
        if (novasLinhas.length > 0) partes.push(`${linhasSalvas} nova(s) linha(s) Excel salva(s)`);
        if (historicoXmls.length > 0) partes.push(`${historicoXmls.length} XML(s) histórico(s)`);
        if (historicoLinhas.length > 0) partes.push(`${historicoLinhas.length} linha(s) Excel histórica(s)`);
        toast.success(`Confronto concluído: ${results.length} registros processados`, {
          description: partes.join(' · ') || undefined,
        });
      } catch (err) {
        console.error('[ConfrontoXML] handleProcess error:', err);
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Erro ao processar confronto: ${msg}`, { duration: 12000 });
      } finally {
        setProgressLabel('');
        setIsProcessing(false);
      }
    },
    [user]
  );

  const handleReset = () => {
    setState(null);
    setStage('upload');
  };

  const baixarFechamento = async (f: FechamentoMensal) => {
    setDownloadingId(f.id);
    try {
      const resultados = await carregarResultados(f.id);
      if (resultados.length === 0) {
        toast.error('Esta análise não tem resultados para exportar');
        return;
      }
      exportResults(resultados);
    } finally {
      setDownloadingId(null);
    }
  };

  const activeTab = tabParam === 'fechamentos' || tabParam === 'base' ? tabParam : 'confronto';
  const setTab = (t: string) => setSearchParams(t === 'confronto' ? {} : { tab: t });

  /* ---- Summary row for a fechamento ---- */
  const SummaryBadge = ({ label, value, color }: { label: string; value: number; color?: string }) =>
    value > 0 ? (
      <span className={`text-xs ${color ?? 'text-muted-foreground'}`}>
        {label}: <strong>{value}</strong>
      </span>
    ) : null;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <ScanSearch className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Confronto de XML</h1>
          <p className="text-sm text-muted-foreground">
            Compare XMLs de NF-e com o Registro de Entrada e identifique divergências
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList className="h-10">
          <TabsTrigger value="confronto" className="gap-2">
            <FileCheck2 className="h-4 w-4" />
            Novo Confronto
          </TabsTrigger>
          <TabsTrigger value="fechamentos" className="gap-2">
            <CalendarDays className="h-4 w-4" />
            Histórico de Fechamentos
            {fechamentos.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 rounded-full px-2 text-[10px]">
                {fechamentos.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="base" className="gap-2">
            <Database className="h-4 w-4" />
            Base de NF-e
          </TabsTrigger>
        </TabsList>

        {/* ── TAB: Novo Confronto ── */}
        <TabsContent value="confronto" className="mt-6">
          {stage === 'upload' && (
            <UploadSection onProcess={handleProcess} isProcessing={isProcessing} progressLabel={progressLabel} />
          )}
          {stage === 'results' && state && (
            <ResultsErrorBoundary onReset={handleReset}>
              <ResultsSection
                results={state.results}
                summary={state.summary}
                onReset={handleReset}
                empresaId={state.empresaId}
              />
            </ResultsErrorBoundary>
          )}
        </TabsContent>

        {/* ── TAB: Histórico de Fechamentos ── */}
        <TabsContent value="fechamentos" className="mt-6">
          <div className="space-y-4">
            {loadingFechamentos && (
              <div className="flex items-center gap-3 text-muted-foreground py-10 justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Carregando fechamentos...
              </div>
            )}
            {!loadingFechamentos && fechamentos.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="py-14 flex flex-col items-center gap-3 text-center">
                  <CalendarDays className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-base font-medium text-muted-foreground">Nenhuma análise salva</p>
                  <p className="text-sm text-muted-foreground/70 max-w-xs">
                    Após processar um confronto, clique em "Salvar análise" para registrá-la aqui.
                  </p>
                  <Button variant="outline" onClick={() => setTab('confronto')}>
                    Ir para Novo Confronto
                  </Button>
                </CardContent>
              </Card>
            )}
            {!loadingFechamentos && fechamentos.length > 0 && (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {fechamentos.map((f) => (
                  <Card key={f.id} className="relative group hover:border-primary/30 transition-colors">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-sm font-semibold leading-tight truncate">
                            {f.titulo ?? `Análise de ${formatMonthLabel(f.competencia)}`}
                          </CardTitle>
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <CalendarDays className="h-3 w-3" />
                            <span className="font-medium text-foreground">{formatMonthLabel(f.competencia)}</span>
                            <span>·</span>
                            <span>{formatDate(f.fechado_em)}</span>
                          </div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title="Ver detalhes"
                            onClick={() => navigate(`/confronto-xml/fechamento/${f.id}`)}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title="Baixar Excel"
                            disabled={downloadingId === f.id}
                            onClick={() => baixarFechamento(f)}
                          >
                            {downloadingId === f.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Download className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            title="Excluir"
                            onClick={() => setDeleteTarget(f.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <SummaryBadge label="Total" value={f.resumo.totalPlanilha} />
                        <SummaryBadge label="OK" value={f.resumo.ok} color="text-emerald-600" />
                        <SummaryBadge label="Divergentes" value={f.resumo.divergentes} color="text-amber-600" />
                        <SummaryBadge label="Ausentes" value={f.resumo.ausentes} color="text-red-600" />
                        <SummaryBadge label="Não escriturados" value={f.resumo.naoEscriturados} color="text-blue-600" />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-3 h-8 w-full text-xs text-primary hover:bg-primary/5"
                        onClick={() => navigate(`/confronto-xml/fechamento/${f.id}`)}
                      >
                        Ver análise completa →
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── TAB: Base de NF-e ── */}
        <TabsContent value="base" className="mt-6">
          <BaseNfeSection />
        </TabsContent>
      </Tabs>

      {/* Delete dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta análise?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. O registro será permanentemente removido do histórico de fechamentos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
