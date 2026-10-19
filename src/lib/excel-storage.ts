import { supabase } from '@/integrations/supabase/client';
import type { ExcelNfeData } from './xml-confront-types';

function cleanCnpj(v: string): string {
  return String(v ?? '').replace(/[.\-\/\s]/g, '');
}

/** Deriva 'YYYY-MM' a partir de 'DD/MM/YYYY' ou outro formato comum. */
function competenciaFromData(data: string): string | null {
  if (!data) return null;
  const m = data.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}`;
  const iso = data.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const d = new Date(data);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  return null;
}

/**
 * Salva (upsert) linhas de Excel novas para uma empresa.
 * Linhas com mesma (empresa, nNF, serie, CNPJ, data_documento) são ignoradas.
 * Retorna a quantidade de linhas efetivamente inseridas.
 */
export async function salvarLinhasExcel(
  empresaId: string,
  uploadedBy: string,
  linhas: ExcelNfeData[]
): Promise<number> {
  if (linhas.length === 0) return 0;

  const rows = linhas
    .filter((l) => l.nNF && /^\d+$/.test(l.nNF))
    .map((l) => ({
      empresa_id: empresaId,
      n_nf: l.nNF,
      serie: l.serie ?? '',
      cnpj_emitente: cleanCnpj(l.cnpjEmitente),
      nome_emitente: l.nomeEmitente ?? null,
      ch_nfe: l.chNFe || null,
      data_entrada: l.dataEntrada || null,
      data_documento: l.dataDocumento ?? '',
      competencia: competenciaFromData(l.dataDocumento) ?? competenciaFromData(l.dataEntrada),
      valor_contabil: l.valorContabil ?? 0,
      v_bc: l.vBC ?? 0,
      v_icms: l.vICMS ?? 0,
      v_st: l.vST ?? 0,
      cfop: l.cfop ?? null,
      sheet_name: l.sheetName ?? null,
      row_data: l as unknown as Record<string, unknown>,
      uploaded_by: uploadedBy,
    }));

  if (rows.length === 0) return 0;

  // Sobrescreve linhas existentes (mesma empresa/nNF/serie/CNPJ/data_documento)
  // com os valores recém-parseados. Isso garante que correções no parser
  // (ex.: soma de AR para Yamaha) atualizem o histórico em reuploads.
  const { data, error } = await supabase
    .from('excel_linhas_armazenadas')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(rows as any, {
      onConflict: 'empresa_id,n_nf,serie,cnpj_emitente,data_documento',
      ignoreDuplicates: false,
    })
    .select('id');

  if (error) {
    console.error('Erro ao salvar linhas Excel:', error);
    return 0;
  }
  return data?.length ?? 0;
}

const PAGE = 1000;
const CONCURRENCY = 4;

async function poolAll<T>(tasks: Array<() => Promise<T>>, limit = CONCURRENCY): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= tasks.length) return;
      out[i] = await tasks[i]();
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Carrega todas as linhas Excel armazenadas para uma empresa.
 * Paginado (a API limita 1000 registros por resposta) e com as páginas
 * buscadas em paralelo, com concorrência limitada.
 */
export async function carregarLinhasDaEmpresa(
  empresaId: string,
  onProgress?: (carregadas: number, total: number) => void
): Promise<ExcelNfeData[]> {
  const { count, error: countError } = await supabase
    .from('excel_linhas_armazenadas')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId);

  if (countError) {
    console.error('Erro ao contar linhas Excel:', countError);
    throw new Error(`Falha ao consultar a base de planilhas (${countError.code ?? 'erro'}): ${countError.message}`);
  }

  const total = count ?? 0;
  if (total === 0) return [];

  const paginas = Math.min(Math.ceil(total / PAGE), 500);
  let carregadas = 0;

  const tasks = Array.from({ length: paginas }, (_, p) => async () => {
    const from = p * PAGE;
    const { data, error } = await supabase
      .from('excel_linhas_armazenadas')
      .select('row_data')
      .eq('empresa_id', empresaId)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      console.error('Erro ao carregar linhas Excel:', error);
      throw new Error(`Falha ao carregar a base de planilhas (${error.code ?? 'erro'}): ${error.message}`);
    }
    const rows = data ?? [];
    carregadas += rows.length;
    onProgress?.(carregadas, total);
    return rows.map((r) => r.row_data as unknown as ExcelNfeData);
  });

  const pages = await poolAll(tasks);
  return pages.flat();
}


/** Mescla duas listas eliminando duplicatas pela chave composta. */
export function mesclarLinhas(a: ExcelNfeData[], b: ExcelNfeData[]): ExcelNfeData[] {
  const map = new Map<string, ExcelNfeData>();
  for (const l of [...a, ...b]) {
    const key = `${l.nNF}|${l.serie ?? ''}|${cleanCnpj(l.cnpjEmitente)}|${l.dataDocumento ?? ''}`;
    if (!map.has(key)) map.set(key, l);
  }
  return Array.from(map.values());
}
