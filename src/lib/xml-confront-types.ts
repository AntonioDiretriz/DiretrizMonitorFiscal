export interface XmlNfeData {
  chNFe: string;
  nNF: string;
  serie: string;
  dhEmi: string;
  cnpjEmitente: string;
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
}

export interface Empresa {
  id: string;
  razao_social: string;
  cnpj: string;
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
  nomeEmitente: string;
  valorPlanilha: number | null;
  valorXml: number | null;
  diferenca: number | null;
  chNFe: string;
  sheetName?: string;
  cfop?: string;
  isFrete?: boolean;
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
