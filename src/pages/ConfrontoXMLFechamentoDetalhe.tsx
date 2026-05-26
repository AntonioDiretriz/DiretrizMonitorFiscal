import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ResultsSection } from '@/components/confronto-xml/ResultsSection';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, CalendarDays, Lock } from 'lucide-react';
import { toast } from 'sonner';
import type { FechamentoMensal, ConfrontoResult, ConfrontoSummary } from '@/lib/xml-confront-types';
import { atualizarFechamento } from '@/lib/fechamentos';
import { recomputeSummary } from '@/lib/confronto-engine';

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

export default function ConfrontoXMLFechamentoDetalhe() {
  const { fechamentoId } = useParams<{ fechamentoId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: fechamento, isLoading, error } = useQuery<FechamentoMensal>({
    queryKey: ['fechamento', fechamentoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fechamentos_mensais')
        .select('*')
        .eq('id', fechamentoId)
        .single();
      if (error) throw new Error(error.message);
      return data as unknown as FechamentoMensal;
    },
    enabled: !!fechamentoId,
  });

  const updateMutation = useMutation({
    mutationFn: ({ results, summary }: { results: ConfrontoResult[]; summary: ConfrontoSummary }) =>
      atualizarFechamento({ id: fechamentoId!, results, summary }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fechamento', fechamentoId] });
      queryClient.invalidateQueries({ queryKey: ['fechamentos_mensais'] });
      toast.success('Análise atualizada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleUpdate = async (results: ConfrontoResult[], summary: ConfrontoSummary) => {
    await updateMutation.mutateAsync({ results, summary });
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

  if (error || !fechamento) {
    return (
      <div className="p-8 max-w-xl mx-auto mt-16 text-center space-y-4">
        <h1 className="text-2xl font-bold text-destructive">Análise não encontrada</h1>
        <p className="text-muted-foreground">O fechamento solicitado não existe ou foi excluído.</p>
        <Button variant="outline" onClick={() => navigate('/confronto-xml?tab=fechamentos')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar ao Histórico
        </Button>
      </div>
    );
  }

  const summary = recomputeSummary(fechamento.resultados);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Back + Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/confronto-xml?tab=fechamentos')}
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

      {/* Results */}
      <ResultsSection
        results={fechamento.resultados}
        summary={summary}
        onReset={() => navigate('/confronto-xml')}
        empresaId={fechamento.empresa_id}
        readOnly
        resetLabel="Novo Confronto"
        onUpdate={handleUpdate}
      />
    </div>
  );
}
