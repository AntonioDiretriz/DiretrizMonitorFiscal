import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Loader2, Upload, CalendarDays, Search, Lock, Save, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { ConfrontoResult, ConfrontoSummary, ConfrontoStatus } from '@/lib/xml-confront-types';
import { exportResults } from '@/lib/export-excel';
import { getMonthKey, recomputeSummary } from '@/lib/confronto-engine';
import { fecharMes } from '@/lib/fechamentos';
import { useAuth } from '@/contexts/AuthContext';

interface ResultsSectionProps {
  results: ConfrontoResult[];
  summary: ConfrontoSummary;
  onReset: () => void;
  empresaId?: string;
  readOnly?: boolean;
  resetLabel?: string;
  /** Quando fornecido em readOnly, permite adicionar XMLs e persiste a análise atualizada. */
  onUpdate?: (results: ConfrontoResult[], summary: ConfrontoSummary) => Promise<void> | void;
}

const STATUS_CONFIG: Record<ConfrontoStatus, { label: string; color: string; emoji: string }> = {
  ok: { label: 'OK', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', emoji: '✅' },
  divergente: { label: 'Divergente', color: 'bg-amber-100 text-amber-800 border-amber-200', emoji: '⚠️' },
  ausente_xml: { label: 'Ausente no XML', color: 'bg-red-100 text-red-800 border-red-200', emoji: '❌' },
  nao_escriturado: { label: 'Não escriturado', color: 'bg-blue-100 text-blue-800 border-blue-200', emoji: '🔵' },
  cancelada: { label: 'Cancelada', color: 'bg-zinc-200 text-zinc-700 border-zinc-300', emoji: '🚫' },
};

type FilterType = 'todos' | ConfrontoStatus;
type MonthSelection = 'todos' | string;

const MONTH_NAMES_PT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

function formatMonthLabel(key: string): string {
  if (!key || key === 'sem-data') return 'Sem data';
  const [year, month] = String(key).split('-');
  const idx = parseInt(month ?? '', 10) - 1;
  if (!Number.isFinite(idx) || idx < 0 || idx > 11) return key;
  return `${MONTH_NAMES_PT[idx]}/${year}`;
}


function formatCurrency(v: number | null | undefined): string {
  if (v === null || v === undefined || typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatCnpj(v: string | null | undefined): string {
  const s = String(v ?? '');
  if (s.length === 14) {
    return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  if (s.length === 11) {
    return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  return s;
}


export function ResultsSection({ results: initialResults, summary: initialSummary, onReset, empresaId, readOnly = false, resetLabel, onUpdate }: ResultsSectionProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [results, setResults] = useState<ConfrontoResult[]>(initialResults);
  const [summary, setSummary] = useState<ConfrontoSummary>(initialSummary);
  const [filter, setFilter] = useState<FilterType>('todos');
  const [selectedMonth, setSelectedMonth] = useState<MonthSelection>('todos');
  const [searchNf, setSearchNf] = useState('');
  const [showZeradas, setShowZeradas] = useState(false);

  const [deleteIdx, setDeleteIdx] = useState<number | null>(null);
  const [isAddingXmls, setIsAddingXmls] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [isAddingExcel, setIsAddingExcel] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [competenciasFechadas] = useState<Set<string>>(new Set());
  const [isClosing, setIsClosing] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveTitulo, setSaveTitulo] = useState('');
  const [saveCompetencia, setSaveCompetencia] = useState<string>('');
  const [excelSheetDialog, setExcelSheetDialog] = useState<{ workbook: import('xlsx').WorkBook; sheets: string[]; selected: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  // Notas zeradas (valor contábil 0) — ocultas por padrão
  const isZeradaRow = (r: ConfrontoResult) =>
    r.isZerada ?? (r.valorPlanilha === 0 && (r.valorXml ?? 0) === 0);
  const zeradasCount = useMemo(() => results.filter(isZeradaRow).length, [results]);
  const visibleResults = useMemo(
    () => (showZeradas ? results : results.filter((r) => !isZeradaRow(r))),
    [results, showZeradas]
  );

  // Months available in the dataset, sorted chronologically with counts
  const monthsAvailable = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of visibleResults) {
      const key = getMonthKey(r.data);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort(([a], [b]) => {
        if (a === 'sem-data') return 1;
        if (b === 'sem-data') return -1;
        return a.localeCompare(b);
      })
      .map(([key, count]) => ({ key, count }));
  }, [visibleResults]);

  // Results filtered by selected month
  const resultsForMonth = useMemo(
    () => (selectedMonth === 'todos' ? visibleResults : visibleResults.filter((r) => getMonthKey(r.data) === selectedMonth)),
    [visibleResults, selectedMonth]
  );

  // Summary recalculated for the current visible set
  const summaryForMonth = useMemo<ConfrontoSummary>(
    () => recomputeSummary(resultsForMonth),
    [resultsForMonth]
  );

  const filtered = useMemo(() => {
    let arr = filter === 'todos' ? resultsForMonth : resultsForMonth.filter((r) => r.status === filter);
    const q = searchNf.trim();
    if (q) arr = arr.filter((r) => r.nNF && r.nNF.includes(q));
    return arr;
  }, [resultsForMonth, filter, searchNf]);


  // Paginação da tabela (evita renderizar milhares de linhas de uma vez)
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * pageSize;
  const paged = useMemo(
    () => filtered.slice(pageStart, pageStart + pageSize),
    [filtered, pageStart, pageSize]
  );

  useEffect(() => {
    setPage(0);
  }, [filter, searchNf, selectedMonth, pageSize, showZeradas]);


  // Competências válidas para escolher como rótulo da análise (exclui "sem-data")
  const competenciasOpcoes = useMemo(
    () => monthsAvailable.map((m) => m.key).filter((k) => k !== 'sem-data'),
    [monthsAvailable]
  );

  // Default da competência: mês selecionado, ou a mais frequente
  const defaultCompetencia = useMemo(() => {
    if (selectedMonth !== 'todos' && selectedMonth !== 'sem-data') return selectedMonth;
    if (competenciasOpcoes.length === 0) return '';
    let best = competenciasOpcoes[0];
    let bestCount = 0;
    for (const m of monthsAvailable) {
      if (m.key === 'sem-data') continue;
      if (m.count > bestCount) { best = m.key; bestCount = m.count; }
    }
    return best;
  }, [selectedMonth, competenciasOpcoes, monthsAvailable]);

  const canSave = !!empresaId && !!user && !readOnly && results.length > 0 && competenciasOpcoes.length > 0;

  const openSaveDialog = () => {
    const comp = defaultCompetencia;
    setSaveCompetencia(comp);
    const dataAtual = new Date().toLocaleDateString('pt-BR');
    setSaveTitulo(comp ? `Análise ${formatMonthLabel(comp)} — ${dataAtual}` : `Análise — ${dataAtual}`);
    setSaveDialogOpen(true);
  };

  const handleSaveAnalise = async () => {
    if (!empresaId || !user) return;
    const titulo = saveTitulo.trim();
    if (!titulo) {
      toast.error('Informe um título para a análise');
      return;
    }
    if (!saveCompetencia) {
      toast.error('Selecione a competência');
      return;
    }
    setIsClosing(true);
    try {
      const res = await fecharMes({
        empresaId,
        competencia: saveCompetencia,
        titulo,
        fechadoPor: user.id,
        resumo: recomputeSummary(visibleResults),
        resultados: visibleResults,
      });
      if (res.ok) {
        toast.success('Análise salva em Fechamentos');
        exportResults(visibleResults);

        setSaveDialogOpen(false);
        navigate('/confronto-xml?tab=fechamentos');
      } else {
        toast.error(res.error || 'Erro ao salvar análise');
      }
    } finally {
      setIsClosing(false);
    }
  };

  const filters: { key: FilterType; label: string; count: number }[] = [
    { key: 'todos', label: 'Todos', count: resultsForMonth.length },
    { key: 'ok', label: '✅ OK', count: summaryForMonth.ok },
    { key: 'divergente', label: '⚠️ Divergente', count: summaryForMonth.divergentes },
    { key: 'ausente_xml', label: '❌ Ausente no XML', count: summaryForMonth.ausentes },
    { key: 'nao_escriturado', label: '🔵 Não escriturado', count: summaryForMonth.naoEscriturados },
    { key: 'cancelada', label: '🚫 Cancelada', count: summaryForMonth.canceladas },
  ];

  const handleAddXmlsClick = () => fileInputRef.current?.click();

  const monthFilterFn = () =>
    selectedMonth === 'todos'
      ? undefined
      : (row: ConfrontoResult) => {
          const k = getMonthKey(row.data);
          return k === selectedMonth || k === 'sem-data';
        };

  const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

  const processXmlFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setIsAddingXmls(true);
    let etapa = 'preparar';
    try {
      const { parseXmlFiles } = await import('@/lib/xml-parser');
      const { reconcileMissing } = await import('@/lib/confronto-engine');
      const { salvarXmls } = await import('@/lib/xml-storage');

      etapa = 'ler os XMLs';
      const xmlData = await parseXmlFiles(files);

      // Persistir os XMLs na base da empresa para reaproveitamento futuro
      let salvos = 0;
      if (empresaId && user && xmlData.length > 0) {
        etapa = 'salvar na base';
        salvos = await salvarXmls(empresaId, user.id, xmlData, (feitos, total) =>
          setProgressMsg(`Salvando ${feitos.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} XML(s)…`)
        );
        setProgressMsg(null);
      }

      etapa = 'reconciliar';
      const { results: newResults, summary: newSummary, matched, unmatched } = reconcileMissing(
        results,
        xmlData,
        monthFilterFn()
      );
      setResults(newResults);
      setSummary(newSummary);
      if (onUpdate) {
        try {
          await onUpdate(newResults, newSummary);
        } catch (persistErr) {
          console.error('Erro ao persistir análise atualizada:', persistErr);
          toast.error(`XMLs reconciliados, mas falha ao salvar atualização: ${errMsg(persistErr)}`);
        }
      }
      const monthLabel = selectedMonth === 'todos' ? '' : `${formatMonthLabel(selectedMonth)}: `;
      const descParts: string[] = [];
      if (unmatched > 0) descParts.push(`${unmatched} XML(s) sem correspondência adicionado(s) como "Não escriturado"`);
      if (salvos > 0) descParts.push(`${salvos} XML(s) salvo(s) na base da empresa`);
      toast.success(`${monthLabel}${matched} nota(s) reconciliada(s)`, {
        description: descParts.length > 0 ? descParts.join(' · ') : undefined,
      });
    } catch (err) {
      console.error(`Erro ao adicionar XMLs (etapa: ${etapa}):`, err);
      toast.error(`Falha ao ${etapa}: ${errMsg(err)}`, { duration: 12000 });
    } finally {
      setProgressMsg(null);
      setIsAddingXmls(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /**
   * Reconcilia as linhas "Ausente no XML" contra os XMLs já armazenados na base
   * da empresa (e das filiais do mesmo CNPJ raiz), sem precisar reanexar arquivos.
   */
  const reconciliarComBase = async () => {
    if (!empresaId) {
      toast.error('Selecione uma empresa para reconciliar com a base');
      return;
    }
    setIsReconciling(true);
    let etapa = 'carregar a base de XMLs';
    try {
      const { carregarXmlsDaEmpresa } = await import('@/lib/xml-storage');
      const { carregarLinhasDaEmpresa } = await import('@/lib/excel-storage');
      const { reconcileMissing, refreshPlanilhaValues } = await import('@/lib/confronto-engine');
      const base = await carregarXmlsDaEmpresa(empresaId, (feitos, total) =>
        setProgressMsg(`Carregando ${feitos.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} XML(s) da base…`)
      );
      setProgressMsg(null);
      if (base.length === 0) {
        toast.info('Nenhum XML armazenado para esta empresa');
        return;
      }

      // Atualiza os valores da planilha com a base atual (linhas corrigidas/reenviadas)
      etapa = 'carregar a base de planilhas';
      const linhasBase = await carregarLinhasDaEmpresa(empresaId, (feitas, total) =>
        setProgressMsg(`Carregando ${feitas.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} linha(s) de planilha da base…`)
      );
      setProgressMsg(null);
      const { results: atualizados } = refreshPlanilhaValues(results, linhasBase);

      etapa = 'reconciliar com a base';
      // Divergentes também podem ser recomparados com o XML da mesma chave
      const existentes = new Set(
        atualizados
          .filter((r) => r.status === 'ok' || r.status === 'cancelada')
          .map((r) => r.chNFe)
          .filter((c) => !!c && c.length === 44)
      );
      const candidatos = base.filter((x) => !existentes.has(x.chNFe));

      const { results: newResults, summary: newSummary, matched } = reconcileMissing(
        atualizados,
        candidatos,
        monthFilterFn()
      );
      // Não transformar toda a base em "Não escriturado": manter só linhas já existentes + as reconciliadas
      const keys = new Set(results.map((r) => (r.chNFe && r.chNFe.length === 44 ? `ch:${r.chNFe}` : `n:${r.nNF}|${r.serie}|${r.valorPlanilha ?? r.valorXml ?? ''}`)));
      const filtered = newResults.filter((r) => {
        const k = r.chNFe && r.chNFe.length === 44 ? `ch:${r.chNFe}` : `n:${r.nNF}|${r.serie}|${r.valorPlanilha ?? r.valorXml ?? ''}`;
        return keys.has(k) || r.status !== 'nao_escriturado';
      });
      const { recomputeSummary: recompute } = await import('@/lib/confronto-engine');
      const finalResults = filtered;
      const finalSummary = filtered.length === newResults.length ? newSummary : recompute(filtered);

      setResults(finalResults);
      setSummary(finalSummary);
      if (onUpdate) {
        try {
          await onUpdate(finalResults, finalSummary);
        } catch (persistErr) {
          console.error('Erro ao persistir análise atualizada:', persistErr);
          toast.error(`Reconciliado, mas falha ao salvar atualização: ${errMsg(persistErr)}`);
        }
      }
      const monthLabel = selectedMonth === 'todos' ? '' : `${formatMonthLabel(selectedMonth)}: `;
      toast.success(`${monthLabel}${matched} nota(s) reconciliada(s) com a base`, {
        description: `${base.length.toLocaleString('pt-BR')} XML(s) da base consultados`,
      });
    } catch (err) {
      console.error(`Erro ao reconciliar com a base (etapa: ${etapa}):`, err);
      toast.error(`Falha ao ${etapa}: ${errMsg(err)}`, { duration: 12000 });
    } finally {
      setProgressMsg(null);
      setIsReconciling(false);
    }
  };


  const handleXmlFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.name.toLowerCase().endsWith('.xml'));
    await processXmlFiles(files);
  };

  const handleAddExcelClick = () => excelInputRef.current?.click();

  const processExcelSheets = async (workbook: import('xlsx').WorkBook, sheets: string[]) => {
    setIsAddingExcel(true);
    try {
      const { parseSheet } = await import('@/lib/excel-parser');
      const { reconcileExcel } = await import('@/lib/confronto-engine');
      const { salvarLinhasExcel } = await import('@/lib/excel-storage');
      const novasLinhas = sheets.flatMap((s) => parseSheet(workbook, s));
      if (novasLinhas.length === 0) {
        toast.error('Nenhuma linha encontrada nas abas selecionadas');
        return;
      }
      let salvas = 0;
      if (empresaId && user) {
        salvas = await salvarLinhasExcel(empresaId, user.id, novasLinhas);
      }
      const monthFilter = selectedMonth === 'todos'
        ? undefined
        : (row: ConfrontoResult) => {
            const k = getMonthKey(row.data);
            return k === selectedMonth || k === 'sem-data';
          };
      const { results: newResults, summary: newSummary, matched, unmatched } = reconcileExcel(
        results,
        novasLinhas,
        monthFilter
      );
      setResults(newResults);
      setSummary(newSummary);
      if (onUpdate) {
        try {
          await onUpdate(newResults, newSummary);
        } catch (err) {
          console.error('Erro ao persistir análise atualizada:', err);
          toast.error('Linhas reconciliadas, mas falha ao salvar atualização');
        }
      }
      const monthLabel = selectedMonth === 'todos' ? '' : `${formatMonthLabel(selectedMonth)}: `;
      const descParts: string[] = [];
      if (unmatched > 0) descParts.push(`${unmatched} linha(s) sem correspondência adicionada(s) como "Ausente no XML"`);
      if (salvas > 0) descParts.push(`${salvas} linha(s) salva(s) na base da empresa`);
      toast.success(`${monthLabel}${matched} linha(s) reconciliada(s)`, {
        description: descParts.length > 0 ? descParts.join(' · ') : undefined,
      });
    } catch (err) {
      console.error('Erro ao adicionar Excel:', err);
      toast.error('Falha ao processar Excel');
    } finally {
      setIsAddingExcel(false);
      if (excelInputRef.current) excelInputRef.current.value = '';
    }
  };

  const handleExcelFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { readWorkbook, getSheetNames, autoDetectSheet } = await import('@/lib/excel-parser');
      const buffer = await file.arrayBuffer();
      const wb = readWorkbook(buffer);
      const names = getSheetNames(wb);
      if (names.length === 0) {
        toast.error('Planilha sem abas');
        return;
      }
      if (names.length === 1) {
        await processExcelSheets(wb, names);
        return;
      }
      const auto = autoDetectSheet(wb);
      setExcelSheetDialog({ workbook: wb, sheets: names, selected: auto ? [auto] : [names[0]] });
    } catch (err) {
      console.error('Erro ao ler Excel:', err);
      toast.error('Falha ao ler arquivo Excel');
    } finally {
      if (excelInputRef.current) excelInputRef.current.value = '';
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files ?? []).filter((f) => f.name.toLowerCase().endsWith('.xml'));
    if (files.length === 0) {
      toast.error('Nenhum arquivo XML encontrado');
      return;
    }
    await processXmlFiles(files);
  };

  const handleConfirmDelete = async () => {
    if (deleteIdx === null) return;
    const rowToDelete = filtered[deleteIdx];
    const realIdx = results.indexOf(rowToDelete);
    if (realIdx === -1) {
      setDeleteIdx(null);
      return;
    }
    const { recomputeSummary } = await import('@/lib/confronto-engine');
    const newResults = results.filter((_, i) => i !== realIdx);
    setResults(newResults);
    setSummary(recomputeSummary(newResults));
    setDeleteIdx(null);
    toast.success('Registro removido');
  };

  const canEditXmls = !readOnly || !!onUpdate;
  const showDropzone = canEditXmls && selectedMonth !== 'todos' && summaryForMonth.ausentes > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 notranslate" translate="no">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Resultado do Confronto</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            {selectedMonth !== 'todos' && (
              <>
                <CalendarDays className="h-4 w-4" />
                <span className="font-medium text-foreground">{formatMonthLabel(selectedMonth)}</span>
                <span>·</span>
              </>
            )}
            {resultsForMonth.length} registro{resultsForMonth.length === 1 ? '' : 's'}
            {selectedMonth !== 'todos' ? ' nesta competência' : ' processados'}
          </p>
          {progressMsg && (
            <p className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
              <Loader2 className="h-3 w-3 animate-spin" /> {progressMsg}
            </p>
          )}
        </div>
        <div className="flex gap-3 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml"
            multiple
            className="hidden"
            onChange={handleXmlFiles}
          />
          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx,.xlsb,.xls"
            className="hidden"
            onChange={handleExcelFile}
          />
          {canEditXmls && (
            <Button variant="outline" onClick={handleAddXmlsClick} disabled={isAddingXmls}>
              {isAddingXmls ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Adicionar XMLs
            </Button>
          )}
          {canEditXmls && !!empresaId && (
            <Button variant="outline" onClick={reconciliarComBase} disabled={isReconciling || isAddingXmls}>
              {isReconciling ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Reconciliar com a base
            </Button>
          )}
          {canEditXmls && (
            <Button variant="outline" onClick={handleAddExcelClick} disabled={isAddingExcel}>
              {isAddingExcel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Adicionar Excel
            </Button>
          )}
          {readOnly && (
            <Badge variant="outline" className="border-primary/40 text-primary flex items-center gap-1 px-3">
              <Lock className="h-3 w-3" /> Análise salva
            </Badge>
          )}
          <Button variant="outline" onClick={() => exportResults(resultsForMonth)}>
            Exportar Excel
          </Button>
          {!readOnly && (
            <Button variant="outline" onClick={onReset}>
              {resetLabel ?? 'Nova Análise'}
            </Button>
          )}
          {canSave && (
            <Button
              onClick={openSaveDialog}
              disabled={isClosing}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              title="Salva esta análise em Fechamentos"
            >
              {isClosing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar análise
            </Button>
          )}
          {readOnly && (
            <Button onClick={onReset} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {resetLabel ?? 'Nova Análise'}
            </Button>
          )}
        </div>
      </div>

      {/* Search by NF number */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative max-w-sm flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por nº da NF…"
            value={searchNf}
            onChange={(e) => setSearchNf(e.target.value)}
            className="pl-9"
          />
        </div>
        {zeradasCount > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showZeradas}
              onChange={(e) => setShowZeradas(e.target.checked)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            Mostrar notas zeradas ({zeradasCount})
          </label>
        )}
      </div>


      {/* Month chips */}
      {monthsAvailable.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground mr-1">Competência:</span>
          <button
            onClick={() => setSelectedMonth('todos')}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              selectedMonth === 'todos'
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-background text-foreground hover:bg-muted'
            }`}
          >
            Todos ({visibleResults.length})
          </button>
          {monthsAvailable.map((m) => {
            const closed = competenciasFechadas.has(m.key);
            return (
              <button
                key={m.key}
                onClick={() => setSelectedMonth(m.key)}
                className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  selectedMonth === m.key
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-background text-foreground hover:bg-muted'
                }`}
              >
                {closed && <Lock className="h-3 w-3" />}
                {formatMonthLabel(m.key)} ({m.count})
              </button>
            );
          })}
        </div>
      )}

      {/* Dropzone for selected month */}
      {showDropzone && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={handleAddXmlsClick}
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors ${
            isDragOver
              ? 'border-primary bg-primary/5'
              : 'border-primary/30 bg-background hover:bg-muted/30'
          }`}
        >
          {isAddingXmls ? (
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          ) : (
            <Upload className="h-6 w-6 text-primary" />
          )}
          <p className="text-sm font-medium text-foreground">
            Arraste XMLs de {formatMonthLabel(selectedMonth)} aqui ou clique para selecionar
          </p>
          <p className="text-xs text-muted-foreground">
            {summaryForMonth.ausentes} nota(s) ausente(s) aguardando reconciliação
          </p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-7">
        <SummaryCard label="Total Planilha" value={summaryForMonth.totalPlanilha} />
        <SummaryCard label="Total XMLs" value={summaryForMonth.totalXmls} />
        <SummaryCard label="OK" value={summaryForMonth.ok} color="text-emerald-600" />
        <SummaryCard label="Divergentes" value={summaryForMonth.divergentes} color="text-amber-600" />
        <SummaryCard label="Ausentes" value={summaryForMonth.ausentes} color="text-red-600" />
        <SummaryCard label="Não escriturados" value={summaryForMonth.naoEscriturados} color="text-blue-600" />
        <SummaryCard label="Canceladas" value={summaryForMonth.canceladas} color="text-zinc-600" />
      </div>

      {/* Filter Chips */}
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === f.key
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-background text-foreground hover:bg-muted'
            }`}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* Results Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <TooltipProvider>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[140px]">Status</TableHead>
                    <TableHead>Nº NF</TableHead>
                    <TableHead>Série</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>CNPJ Emitente</TableHead>
                    <TableHead>Nome Emitente</TableHead>
                    <TableHead className="text-right">Valor Planilha</TableHead>
                    <TableHead className="text-right">Valor XML</TableHead>
                    <TableHead className="text-right">Diferença</TableHead>
                    <TableHead>Chave NF-e</TableHead>
                    {!readOnly && <TableHead className="w-[60px] text-right">Ações</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((row, i) => {
                    const cfg = STATUS_CONFIG[row.status];
                    return (
                      <TableRow key={pageStart + i} className={i % 2 === 0 ? '' : 'bg-muted/30'}>

                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`whitespace-nowrap ${cfg.color}`}
                          >
                            {cfg.emoji} {cfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono">{row.nNF}</TableCell>
                        <TableCell>{row.serie}</TableCell>
                        <TableCell className="whitespace-nowrap">{row.data}</TableCell>
                        <TableCell className="font-mono text-xs">{formatCnpj(row.cnpjEmitente)}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{row.nomeEmitente}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(row.valorPlanilha)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(row.valorXml)}</TableCell>
                        <TableCell className={`text-right font-mono ${row.diferenca && row.diferenca !== 0 ? 'font-bold text-amber-600' : ''}`}>
                          {row.diferenca !== null && row.diferenca !== 0
                            ? formatCurrency(row.diferenca)
                            : '—'}
                        </TableCell>
                        <TableCell>
                          {row.chNFe ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help font-mono text-xs text-muted-foreground">
                                  {row.chNFe.slice(0, 12)}...{row.chNFe.slice(-6)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-xs">
                                <p className="font-mono text-xs break-all">{row.chNFe}</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        {!readOnly && (
                          <TableCell className="text-right">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => setDeleteIdx(pageStart + i)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="left">Excluir registro</TooltipContent>
                            </Tooltip>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={readOnly ? 10 : 11} className="py-8 text-center text-muted-foreground">
                        Nenhum registro encontrado para este filtro.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TooltipProvider>
          </div>
          {filtered.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                {(pageStart + 1).toLocaleString('pt-BR')}–{Math.min(pageStart + pageSize, filtered.length).toLocaleString('pt-BR')} de{' '}
                {filtered.length.toLocaleString('pt-BR')} linhas
              </span>
              <div className="flex items-center gap-2">
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="h-8 w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[50, 100, 250, 500].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n} por página</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                  Anterior
                </Button>
                <span className="text-muted-foreground whitespace-nowrap">
                  {safePage + 1} / {totalPages}
                </span>
                <Button variant="outline" size="sm" disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>


      <AlertDialog open={deleteIdx !== null} onOpenChange={(open) => !open && setDeleteIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este registro do confronto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove o registro apenas desta sessão e dos resultados exportados. Use para descartar notas canceladas ou lançamentos inválidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={saveDialogOpen} onOpenChange={(o) => !isClosing && setSaveDialogOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salvar análise em Fechamentos</DialogTitle>
            <DialogDescription>
              Defina um título para identificar esta análise e a competência (mês de referência) à qual ela pertence.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="save-titulo">Título da análise</Label>
              <Input
                id="save-titulo"
                value={saveTitulo}
                onChange={(e) => setSaveTitulo(e.target.value)}
                placeholder="Ex.: Fechamento oficial Mar/26"
                disabled={isClosing}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="save-competencia">Competência</Label>
              <Select value={saveCompetencia} onValueChange={setSaveCompetencia} disabled={isClosing}>
                <SelectTrigger id="save-competencia">
                  <SelectValue placeholder="Selecione a competência" />
                </SelectTrigger>
                <SelectContent>
                  {competenciasOpcoes.map((c) => (
                    <SelectItem key={c} value={c}>{formatMonthLabel(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {visibleResults.length} registro{visibleResults.length === 1 ? "" : "s"} serão salvos nesta análise.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)} disabled={isClosing}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveAnalise}
              disabled={isClosing || !saveTitulo.trim() || !saveCompetencia}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isClosing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar análise
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!excelSheetDialog} onOpenChange={(o) => !isAddingExcel && !o && setExcelSheetDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Selecione as abas para processar</DialogTitle>
            <DialogDescription>
              Marque as abas da planilha que devem ser importadas e reconciliadas com os XMLs já carregados.
            </DialogDescription>
          </DialogHeader>
          {excelSheetDialog && (
            <div className="flex flex-wrap gap-2 py-2">
              {excelSheetDialog.sheets.map((name) => {
                const active = excelSheetDialog.selected.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() =>
                      setExcelSheetDialog((d) =>
                        d
                          ? {
                              ...d,
                              selected: active ? d.selected.filter((s) => s !== name) : [...d.selected, name],
                            }
                          : d
                      )
                    }
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-foreground hover:bg-muted'
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcelSheetDialog(null)} disabled={isAddingExcel}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (!excelSheetDialog || excelSheetDialog.selected.length === 0) return;
                const { workbook, selected } = excelSheetDialog;
                setExcelSheetDialog(null);
                await processExcelSheets(workbook, selected);
              }}
              disabled={isAddingExcel || !excelSheetDialog || excelSheetDialog.selected.length === 0}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isAddingExcel ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Processar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center p-4">
        <span className={`text-2xl font-bold ${color ?? 'text-foreground'}`}>{value}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </CardContent>
    </Card>
  );
}
