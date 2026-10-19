export type Origem = "prefeitura" | "dealernet";

export type TipoLancamento = "entrada" | "saida";

export interface NotaNormalizada {
  cnpjPrestador: string;
  numeroNota: string;
  valorNota: number;
  valorISS: number;
  issRetido: number;
  baseISS: number;
  aliquota: number;
  competencia: string; // MM/AAAA
  data: string;        // AAAA-MM-DD
  razaoSocial: string;
  situacao?: string;
  tipoRetencao?: string;
  tipo?: TipoLancamento; // entrada = empresa é tomadora; saida = empresa é prestadora
  origem: Origem;
  raw: Record<string, unknown>;
}

export interface TotaisPDF {
  valorNota?: number;
  deducoes?: number;
  baseISS?: number;
  valorISS?: number;
  issRetido?: number;
  saldoDevedor?: number;
}

export interface ParsedDealernet {
  cnpjEmpresa?: string;
  razaoEmpresa?: string;
  inscMunicipal?: string;
  periodoInicio?: string; // ISO
  periodoFim?: string;
  notas: NotaNormalizada[];
  totais: TotaisPDF;
}

export interface MapeamentoCSV {
  /** campo normalizado -> nome da coluna encontrada no arquivo */
  campos: Record<string, string | null>;
  cabecalhos: string[];
  delimitador: string;
  encoding: string;
}

export interface ParsedPrefeitura {
  notas: NotaNormalizada[];
  notasSaidaIgnoradas: number;
  duplicadasIgnoradas: number;
  substituidasIgnoradas: number;
  mapeamento?: MapeamentoCSV;
  avisos?: string[];
}


export type StatusMatch =
  | "MATCH_OK"
  | "MATCH_COMPETENCIA_DIVERGE"
  | "MATCH_VALOR_DIVERGE"
  | "AMBIGUO"
  | "SO_NA_PREFEITURA"
  | "SO_NO_DEALERNET";

export interface ItemConciliado {
  key: string;
  status: StatusMatch;
  alertas: string[]; // amber flags on OK matches
  prefeitura?: NotaNormalizada;
  dealernet?: NotaNormalizada;
  candidatos?: NotaNormalizada[]; // for AMBIGUO
}

export interface Config {
  cnpjTomador: string;
  cmcTomador: string;
}
