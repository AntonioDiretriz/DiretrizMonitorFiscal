import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UploadSection } from '@/components/confronto-xml/UploadSection';
import { ResultsSection } from '@/components/confronto-xml/ResultsSection';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { parseSheet, readWorkbook } from '@/lib/excel-parser';
import { parseXmlFiles } from '@/lib/xml-parser';
import { runConfronto } from '@/lib/confronto-engine';
import { salvarXmls, carregarXmlsDaEmpresa, mesclarXmls } from '@/lib/xml-storage';
import { listarFechamentos, excluirFechamento } from '@/lib/fechamentos';
import { useAuth } from '@/contexts/AuthContext';
import type { WorkBook } from 'xlsx';
import type { ConfrontoResult, ConfrontoSummary, FechamentoMensal } from '@/lib/xml-confront-types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Trash2, ExternalLink, CalendarDays, FileCheck2, ScanSearch } from 'lucide-react';
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
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

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
    async (xmlFiles: File[], workbook: WorkBook, selectedSheets: string[], empresaId: string) => {
      if (!user) {
        toast.error('Faça login para continuar');
        return;
      }
      setIsProcessing(true);
      try {
        // 1. Parse spreadsheet rows
        const allRows = selectedSheets.flatMap((sheet) => parseSheet(workbook, sheet));
        if (allRows.length === 0) {
          toast.error('Nenhum dado encontrado na planilha. Verifique se as abas selecionadas têm dados.');
          return;
        }

        // 2. Parse XML files
        const newXmlData = xmlFiles.length > 0 ? await parseXmlFiles(xmlFiles) : [];

        // 3. Load previously stored XMLs from DB for this company
        const storedXmlData = await carregarXmlsDaEmpresa(empresaId);

        // 4. Save new XMLs to DB
        if (newXmlData.length > 0) {
          const count = await salvarXmls(empresaId, user.id, newXmlData);
          if (count > 0) {
            toast.success(`${count} XML(s) salvo(s) na base da empresa`);
          }
        }

        // 5. Merge all XML data and run confronto
        const allXmlData = mesclarXmls(storedXmlData, newXmlData);

        if (allXmlData.length === 0 && xmlFiles.length === 0) {
          toast('Nenhum XML armazenado para esta empresa. Carregue arquivos XML para confronto.', {
            description: 'Você pode fazer o confronto usando apenas a planilha. Todos os registros ficarão como "Ausente no XML".',
          });
        }

        const { results, summary } = runConfronto(allRows, allXmlData);

        setState({ results, summary, empresaId });
        setStage('results');

        toast.success(`Confronto concluído: ${results.length} registros processados`, {
          description: `${summary.ok} OK · ${summary.divergentes} divergentes · ${summary.ausentes} ausentes`,
        });
      } catch (err) {
        console.error('[ConfrontoXML] handleProcess error:', err);
        toast.error(err instanceof Error ? err.message : 'Erro ao processar');
      } finally {
        setIsProcessing(false);
      }
    },
    [user]
  );

  const handleReset = () => {
    setState(null);
    setStage('upload');
  };

  const activeTab = tabParam === 'fechamentos' ? 'fechamentos' : 'confronto';
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
        </TabsList>

        {/* ── TAB: Novo Confronto ── */}
        <TabsContent value="confronto" className="mt-6">
          {stage === 'upload' && (
            <UploadSection onProcess={handleProcess} isProcessing={isProcessing} />
          )}
          {stage === 'results' && state && (
            <ResultsSection
              results={state.results}
              summary={state.summary}
              onReset={handleReset}
              empresaId={state.empresaId}
            />
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
