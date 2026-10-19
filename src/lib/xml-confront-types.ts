export interface XmlNfeData {
  chNFe: string;
  nNF: string;
  serie: string;
  dhEmi: string;
  cnpjEmitente: string;
  /** CNPJ do destinatário — usado para casar notas emitidas pela própria empresa. */
  cnpjDest?: string;
  xNome: string;
  vNF: number;
  vBC: number;
  vICMS: number;
  vBCST: number;
  vST: number;
  vIPI: number;
  vPIS: number;
  vCOFINS: number;
  vProd: number;
  /** Frete, seguro, outras despesas e desconto (totais da NF-e). */
  vFrete?: number;
  vSeguro?: number;
  vOutro?: number;
  vDesc?: number;
  /**
   * Valor da nota como o Dealernet escritura no "Valor Contábil":
   * produtos + frete + seguro + outras despesas - desconto + ICMS ST + IPI.
   * Ignora despesas acessórias somadas ao vNF (ex.: PIS ST / COFINS ST).
   */
  vEscriturado?: number;
  cancelada: boolean;

}

export interface ExcelNfeData {
  nNF: string;
  serie: string;
  dataEntrada: string;
  dataDocumento: string;
  cnpjEmitente: string;
  nomeEmitente: string;
  chNFe: string;
  valorContabil: number;
  vBC: number;
  vICMS: number;
  vST: number;
  rowIndex: number;
  sheetName: string;
  isFrete?: boolean;
  cfop?: string;
  /** Valor contábil zerado — ocultada do relatório por padrão. */
  isZerada?: boolean;

}

export interface Empresa {
  id: string;
  razao_social: string;
  cnpj: string;
  soma_ipi_dealernet: boolean;
  ativo: boolean;
}

export interface XmlArmazenado {
  id: string;
  empresa_id: string;
  ch_nfe: string;
  xml_data: XmlNfeData;
  created_at: string;
}

export interface FechamentoMensal {
  id: string;
  empresa_id: string;
  competencia: string;
  titulo: string | null;
  fechado_por: string | null;
  fechado_em: string;
  resumo: ConfrontoSummary;
  resultados: ConfrontoResult[];
}

export type ConfrontoStatus = 'ok' | 'divergente' | 'ausente_xml' | 'nao_escriturado' | 'cancelada';

export interface ConfrontoResult {
  status: ConfrontoStatus;
  nNF: string;
  serie: string;
  data: string;
  cnpjEmitente: string;
  /** CNPJ do destinatário do XML casado (notas emitidas pela própria empresa). */
  cnpjDest?: string;
  nomeEmitente: string;
  valorPlanilha: number | null;
  valorXml: number | null;
  diferenca: number | null;
  chNFe: string;
  sheetName?: string;
  cfop?: string;
  isFrete?: boolean;
  /** Valor contábil zerado — ocultada do relatório por padrão. */
  isZerada?: boolean;
}


export interface ConfrontoSummary {
  totalPlanilha: number;
  totalXmls: number;
  ok: number;
  divergentes: number;
  ausentes: number;
  naoEscriturados: number;
  canceladas: number;
}
