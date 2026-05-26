import { supabase } from '@/integrations/supabase/client';
import type { XmlNfeData } from './xml-confront-types';

function cleanCnpj(v: string): string {
  return String(v ?? '').replace(/[.\-\/\s]/g, '');
}

/**
 * Salva (upsert) XMLs novos para uma empresa. Se a chave já existir, ignora.
 * Retorna o número de novos registros inseridos.
 */
export async function salvarXmls(
  empresaId: string,
  uploadedBy: string,
  xmls: XmlNfeData[]
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
      x_nome: x.xNome,
      v_nf: x.vNF,
      v_ipi: x.vIPI,
      cancelada: x.cancelada,
      xml_data: x as unknown as Record<string, unknown>,
      uploaded_by: uploadedBy,
    }));

  if (rows.length === 0) return 0;

  const { data, error } = await supabase
    .from('xmls_armazenados')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(rows as any, { onConflict: 'empresa_id,ch_nfe', ignoreDuplicates: true })
    .select('id');

  if (error) {
    console.error('Erro ao salvar XMLs:', error);
    return 0;
  }
  return data?.length ?? 0;
}

/**
 * Carrega todos os XMLs já armazenados para uma empresa.
 */
export async function carregarXmlsDaEmpresa(empresaId: string): Promise<XmlNfeData[]> {
  const { data, error } = await supabase
    .from('xmls_armazenados')
    .select('xml_data')
    .eq('empresa_id', empresaId);

  if (error || !data) {
    console.error('Erro ao carregar XMLs:', error);
    return [];
  }
  return data.map((r) => r.xml_data as unknown as XmlNfeData);
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
