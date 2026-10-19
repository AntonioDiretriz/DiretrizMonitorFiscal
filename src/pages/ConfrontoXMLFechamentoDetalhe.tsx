import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ResultsSection } from '@/components/confronto-xml/ResultsSection';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, CalendarDays, Lock } from 'lucide-react';
import { toast } from 'sonner';
import type { FechamentoMensal, ConfrontoResult, ConfrontoSummary } from '@/lib/xml-confront-types';
import { atualizarFechamento } from '@/lib/fechamentos';
import { sanitizeLegacyResults } from '@/lib/confronto-engine';

const MONTH_NAMES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function formatMonthLabel(key: string) {
  if (!key || key === 'sem-data') return 'Sem data';
  const [year, month] = key.split('-');
  const idx = parseInt(month, 10) - 1;
  return `${MONTH_NAMES_PT[idx] ?? month}/${year}`;
}

function formatDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface FechamentoCarregado {
  fechamento: FechamentoMensal;
  empresaNome: string;
  /** Linhas reclassificadas automaticamente (CPF / CT-e) ainda não persistidas. */
  pendingFix: { results: ConfrontoResult[]; summary: ConfrontoSummary; changed: number } | null;
}

export default function ConfrontoXMLFechamentoDetalhe() {
  const { fechamentoId } = useParams<{ fechamentoId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [savingFix, setSavingFix] = useState(false);

  const queryKey = ['fechamento', fechamentoId];
  const { data, isLoading, error, refetch } = useQuery<FechamentoCarregado | null>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fechamentos_mensais')
        .select('*')
        .eq('id', fechamentoId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const f = data as unknown as FechamentoMensal;
      const sane = sanitizeLegacyResults(f.resultados);

      const { data: emp } = await supabase
        .from('empresas')
        .select('razao_social')
        .eq('id', f.empresa_id)
        .maybeSingle();

      return sane.changed > 0
        ? { fechamento: { ...f, resultados: sane.results, resumo: sane.summary }, empresaNome: emp?.razao_social ?? '', pendingFix: sane }
        : { fechamento: f, empresaNome: emp?.razao_social ?? '', pendingFix: null };
    },
    enabled: !!fechamentoId,
  });

  const voltar = () => navigate('/confronto-xml?tab=fechamentos');

  const salvar = async (resultados: ConfrontoResult[], resumo: ConfrontoSummary) => {
    const res = await atualizarFechamento({ id: fechamentoId!, resumo, resultados });
    if (!res.ok) {
      toast.error('Falha ao atualizar análise', { description: res.error });
      return false;
    }
    queryClient.setQueryData<FechamentoCarregado | null>(queryKey, (old) =>
      old ? { ...old, fechamento: { ...old.fechamento, resultados, resumo }, pendingFix: null } : old
    );
    queryClient.invalidateQueries({ queryKey: ['fechamentos_mensais'] });
    return true;
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Carregando análise...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-xl mx-auto mt-16 text-center space-y-4">
        <h1 className="text-xl font-semibold">Não foi possível carregar a análise</h1>
        <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
        <div className="flex justify-center gap-2">
          <Button onClick={() => refetch()}>Tentar novamente</Button>
          <Button variant="outline" onClick={voltar}>Voltar</Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 max-w-xl mx-auto mt-16 text-center space-y-4">
        <h1 className="text-2xl font-bold text-destructive">Análise não encontrada</h1>
        <p className="text-muted-foreground">O fechamento solicitado não existe ou foi excluído.</p>
        <Button variant="outline" onClick={voltar}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar ao Histórico
        </Button>
      </div>
    );
  }

  const { fechamento, empresaNome, pendingFix } = data;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Back + Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={voltar}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Histórico
        </Button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 shrink-0">
            <CalendarDays className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground truncate">
              {fechamento.titulo ?? `Análise de ${formatMonthLabel(fechamento.competencia)}`}
            </h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
              {empresaNome && <span className="font-medium text-foreground">{empresaNome}</span>}
              <Badge variant="outline" className="border-primary/30 text-primary text-[10px]">
                {formatMonthLabel(fechamento.competencia)}
              </Badge>
              <span>Salvo em {formatDate(fechamento.fechado_em)}</span>
              <Badge variant="outline" className="border-border text-muted-foreground text-[10px] flex items-center gap-1">
                <Lock className="h-2.5 w-2.5" /> Leitura com edição de XMLs
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {pendingFix && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-center justify-between gap-3">
          <span>
            {pendingFix.changed} linha(s) reclassificada(s) automaticamente como <strong>OK</strong> (CPF de pessoa física ou CT-e/Frete). As alterações estão sendo exibidas, mas ainda não foram salvas no banco.
          </span>
          <Button
            size="sm"
            disabled={savingFix}
            onClick={async () => {
              setSavingFix(true);
              const ok = await salvar(pendingFix.results, pendingFix.summary);
              setSavingFix(false);
              if (ok) toast.success('Correções salvas');
            }}
          >
            {savingFix ? 'Salvando…' : 'Salvar correções'}
          </Button>
        </div>
      )}

      {/* Results */}
      <ResultsSection
        results={fechamento.resultados}
        summary={fechamento.resumo}
        onReset={() => navigate('/confronto-xml')}
        empresaId={fechamento.empresa_id}
        readOnly
        resetLabel="Novo Confronto"
        onUpdate={async (results, summary) => {
          if (await salvar(results, summary)) toast.success('Análise atualizada');
        }}
      />
    </div>
  );
}
