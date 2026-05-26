import { supabase } from '@/integrations/supabase/client';
import type { ConfrontoResult, ConfrontoSummary, FechamentoMensal } from './xml-confront-types';

export async function fecharMes(params: {
  empresaId: string;
  competencia: string; // "AAAA-MM"
  titulo: string;
  fechadoPor: string;
  resumo: ConfrontoSummary;
  resultados: ConfrontoResult[];
}): Promise<{ ok: boolean; error?: string }> {
  const { empresaId, competencia, titulo, fechadoPor, resumo, resultados } = params;
  const { error } = await supabase.from('fechamentos_mensais').insert({
    empresa_id: empresaId,
    competencia,
    titulo,
    fechado_por: fechadoPor,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resumo: resumo as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resultados: resultados as any,
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function listarFechamentos(empresaId?: string): Promise<FechamentoMensal[]> {
  let query = supabase
    .from('fechamentos_mensais')
    .select('*')
    .order('fechado_em', { ascending: false });
  if (empresaId) query = query.eq('empresa_id', empresaId);
  const { data, error } = await query;
  if (error || !data) return [];
  return data as unknown as FechamentoMensal[];
}

export async function atualizarFechamento(params: {
  id: string;
  resumo: ConfrontoSummary;
  resultados: ConfrontoResult[];
}): Promise<{ ok: boolean; error?: string }> {
  const { id, resumo, resultados } = params;
  const { error } = await supabase
    .from('fechamentos_mensais')
    .update({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resumo: resumo as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resultados: resultados as any,
    })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function excluirFechamento(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('fechamentos_mensais').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
