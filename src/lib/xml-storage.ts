import { supabase } from '@/integrations/supabase/client';
import type { XmlNfeData } from './xml-confront-types';

function cleanCnpj(v: string): string {
  return String(v ?? '').replace(/[.\-\/\s]/g, '');
}

const CHUNK_SALVAR = 500;

/**
 * Salva (upsert) XMLs novos para uma empresa, em lotes, para não estourar o
 * limite de tamanho/tempo de requisição quando o usuário anexa muitos arquivos.
 * Retorna o número de registros gravados.
 */
export async function salvarXmls(
  empresaId: string,
  uploadedBy: string,
  xmls: XmlNfeData[],
  onProgress?: (salvos: number, total: number) => void
): Promise<number> {
  if (xmls.length === 0) return 0;
  const rows = xmls
    .filter((x) => x.chNFe && x.chNFe.length === 44)
    .map((x) => ({
      empresa_id: empresaId,
      ch_nfe: x.chNFe,
      n_nf: x.nNF,
      serie: x.serie,
      dh_emi: x.dhEmi,
      cnpj_emitente: cleanCnpj(x.cnpjEmitente),
      cnpj_dest: cleanCnpj(x.cnpjDest ?? '') || null,
      x_nome: x.xNome,
      v_nf: x.vNF,
      v_ipi: x.vIPI,
      v_escriturado: x.vEscriturado ?? null,

      cancelada: x.cancelada,
      xml_data: x as unknown as Record<string, unknown>,
      uploaded_by: uploadedBy,
    }));

  if (rows.length === 0) return 0;

  let salvos = 0;
  for (let i = 0; i < rows.length; i += CHUNK_SALVAR) {
    const chunk = rows.slice(i, i + CHUNK_SALVAR);
    const { data, error } = await supabase
      .from('xmls_armazenados')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(chunk as any, { onConflict: 'empresa_id,ch_nfe', ignoreDuplicates: false })
      .select('id');

    if (error) {
      console.error('Erro ao salvar XMLs:', error);
      throw new Error(
        `Falha ao salvar XMLs (lote ${Math.floor(i / CHUNK_SALVAR) + 1}, ${error.code ?? 'erro'}): ${error.message}`
      );
    }
    salvos += data?.length ?? 0;
    onProgress?.(Math.min(i + chunk.length, rows.length), rows.length);
  }
  return salvos;
}

/**
 * IDs das empresas do mesmo grupo (mesma raiz de CNPJ — 8 primeiros dígitos).
 * Garante que XMLs subidos na matriz/filial errada ainda sejam encontrados.
 */
async function idsDoGrupo(empresaId: string): Promise<string[]> {
  const { data: emp } = await supabase
    .from('empresas')
    .select('cnpj')
    .eq('id', empresaId)
    .maybeSingle();
  const raiz = cleanCnpj(emp?.cnpj ?? '').slice(0, 8);
  if (raiz.length !== 8) return [empresaId];
  const { data } = await supabase.from('empresas').select('id, cnpj');
  const ids = (data ?? [])
    .filter((e) => cleanCnpj(e.cnpj ?? '').slice(0, 8) === raiz)
    .map((e) => e.id);
  return ids.length > 0 ? ids : [empresaId];
}

// Tipado como string: os aliases de JSON path estouram a inferência de tipos do supabase-js.
const SLIM_COLS: string = 'ch_nfe, n_nf, serie, dh_emi, cnpj_emitente, cnpj_dest, x_nome, v_nf, v_ipi, v_escriturado, cancelada, v_pis:xml_data->>vPIS, v_cofins:xml_data->>vCOFINS';

interface SlimRow {
  ch_nfe: string | null;
  n_nf: string | null;
  serie: string | null;
  dh_emi: string | null;
  cnpj_emitente: string | null;
  cnpj_dest?: string | null;
  x_nome: string | null;
  v_nf: number | null;
  v_ipi: number | null;
  v_escriturado?: number | null;
  cancelada: boolean | null;
  v_pis?: string | number | null;
  v_cofins?: string | number | null;
}

function toXmlNfe(r: SlimRow): XmlNfeData {
  return {
    chNFe: r.ch_nfe ?? '',
    nNF: r.n_nf ?? '',
    serie: r.serie ?? '',
    dhEmi: r.dh_emi ?? '',
    cnpjEmitente: r.cnpj_emitente ?? '',
    cnpjDest: r.cnpj_dest ?? undefined,
    xNome: r.x_nome ?? '',
    vNF: Number(r.v_nf ?? 0),
    vBC: 0,
    vICMS: 0,
    vBCST: 0,
    vST: 0,
    vIPI: Number(r.v_ipi ?? 0),
    vPIS: Number(r.v_pis ?? 0) || 0,
    vCOFINS: Number(r.v_cofins ?? 0) || 0,
    vProd: 0,
    vEscriturado: r.v_escriturado == null ? undefined : Number(r.v_escriturado),
    cancelada: !!r.cancelada,
  };
}


const PAGE = 1000;
const CONCURRENCY = 4;

/** Executa tarefas com concorrência limitada, preservando a ordem dos resultados. */
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
 * Carrega todos os XMLs armazenados da empresa (e das filiais do mesmo CNPJ
 * raiz), lendo apenas as colunas usadas pelo confronto — o campo `xml_data`
 * completo tornava a leitura pesada (dezenas de MB). As páginas de 1000
 * registros são buscadas em paralelo, com concorrência limitada.
 */
export async function carregarXmlsDaEmpresa(
  empresaId: string,
  onProgress?: (carregados: number, total: number) => void
): Promise<XmlNfeData[]> {
  const ids = await idsDoGrupo(empresaId);

  const { count, error: countError } = await supabase
    .from('xmls_armazenados')
    .select('ch_nfe', { count: 'exact', head: true })
    .in('empresa_id', ids);

  if (countError) {
    console.error('Erro ao contar XMLs:', countError);
    throw new Error(`Falha ao consultar a base de XMLs (${countError.code ?? 'erro'}): ${countError.message}`);
  }

  const total = count ?? 0;
  if (total === 0) return [];

  const paginas = Math.min(Math.ceil(total / PAGE), 500);
  let carregados = 0;

  const tasks = Array.from({ length: paginas }, (_, p) => async () => {
    const from = p * PAGE;
    const { data, error } = await supabase
      .from('xmls_armazenados')
      .select(SLIM_COLS)
      .in('empresa_id', ids)
      .order('ch_nfe', { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      console.error('Erro ao carregar XMLs:', error);
      throw new Error(`Falha ao carregar XMLs da base (${error.code ?? 'erro'}): ${error.message}`);
    }
    const rows = (data ?? []) as unknown as SlimRow[];
    carregados += rows.length;
    onProgress?.(carregados, total);
    return rows.map(toXmlNfe);
  });

  const pages = await poolAll(tasks);
  return pages.flat();
}

/**
 * Mescla duas listas de XMLs eliminando duplicatas pela chave NF-e.
 */
export function mesclarXmls(a: XmlNfeData[], b: XmlNfeData[]): XmlNfeData[] {
  const map = new Map<string, XmlNfeData>();
  for (const x of [...a, ...b]) {
    const key = x.chNFe || `${x.nNF}_${cleanCnpj(x.cnpjEmitente)}`;
    if (!map.has(key)) map.set(key, x);
  }
  return Array.from(map.values());
}
