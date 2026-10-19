import Papa from "papaparse";
import type { Config, MapeamentoCSV, NotaNormalizada, ParsedPrefeitura } from "./types";
import {
  competenciaFrom,
  normalizeNumeroNota,
  onlyDigits,
  parseBRDate,
  parseBRNumber,
} from "./format";

/**
 * Leitor multi-modelo da "Consulta de NFS-e" da prefeitura.
 * - Detecta encoding (UTF-8 x ISO-8859-1) e delimitador (";" , "," ou TAB).
 * - Reconhece as colunas por sinônimos, de forma que exportações de prefeituras
 *   diferentes (Camaragibe, Recife, etc.) sejam aceitas sem alteração de código.
 * - Não filtra nada: cada nota é marcada com `tipo` (entrada/saida) e mantém a
 *   `situacao` original para que a UI possa filtrar dinamicamente.
 */

const SINONIMOS: Record<string, string[]> = {
  numeroNota: ["n nfse", "no nfse", "numero nfse", "numero da nfse", "numero nota", "n da nota fiscal eletronica", "nota", "num nota", "numero", "nfse", "n nota", "n da nota", "numero do documento"],
  // Fallback quando a coluna principal de número vem vazia (ex.: Recife, onde o
  // número fica em "NFS-e Nacional" e "Nº da Nota Fiscal Eletrônica" vem em branco)
  numeroNotaAlt: ["nfs e nacional", "nfs-e nacional", "numero nfs e nacional", "numero do rps", "no do rps", "rps"],
  dataEmissao: ["data da emissao", "data de emissao", "data emissao", "emissao", "dt emissao", "data"],
  competencia: ["competencia", "mes competencia", "periodo"],
  situacao: ["situacao nota", "situacao", "status", "situacao da nota"],
  cnpjPrestador: ["cpf cnpj prestador", "cnpj prestador", "cpf/cnpj prestador", "cnpj do prestador", "prestador cnpj", "cpf cnpj do prestador", "documento prestador"],
  razaoPrestador: ["razao social prestador", "prestador", "nome prestador", "razao social do prestador", "nome/razao social prestador"],
  cnpjTomador: ["cpf cnpj do tomador", "cpf cnpj tomador", "cnpj tomador", "cpf/cnpj/tomador", "cnpj do tomador", "tomador cnpj", "documento tomador"],
  cmcTomador: ["cmc tomador", "inscricao municipal do tomador", "inscricao municipal tomador", "im tomador", "cmc do tomador"],
  razaoTomador: ["razao social tomador", "tomador", "nome tomador", "razao social do tomador"],
  valorNota: ["vl do serv", "vl do servico", "valor dos servicos", "valor do servico", "valor servico", "valor da nota", "valor nota", "vl servico", "valor total do servico", "valor total", "vl total"],
  deducoes: ["deducoes reducoes", "deducoes/reducoes", "deducoes", "reducoes", "valor deducoes"],
  aliquota: ["aliquota", "aliquota (%)", "aliq", "aliquota iss", "% iss"],
  retencao: ["retencao", "valor retencao", "iss retido", "valor iss retido"],
  valorISS: ["issqn apurado", "issqn", "valor iss", "iss apurado", "iss", "valor do iss"],
  tipoRetencao: ["tipo retencao", "tipo de retencao"],
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();

function detectarLayout(headers: string[]): MapeamentoCSV["campos"] {
  const normalizados = headers.map((h) => ({ raw: h, n: norm(h) }));
  const campos: Record<string, string | null> = {};
  for (const [campo, opts] of Object.entries(SINONIMOS)) {
    let achou: string | null = null;
    // 1) match exato
    for (const opt of opts) {
      const hit = normalizados.find((h) => h.n === norm(opt));
      if (hit) {
        achou = hit.raw;
        break;
      }
    }
    // 2) match por "contém"
    if (!achou) {
      for (const opt of opts) {
        const o = norm(opt);
        const hit = normalizados.find((h) => h.n.includes(o) || o.includes(h.n));
        if (hit && hit.n.length > 2) {
          achou = hit.raw;
          break;
        }
      }
    }
    campos[campo] = achou;
  }
  return campos;
}

function decode(buf: ArrayBuffer): { text: string; encoding: string } {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  // "" indica bytes latin1 mal interpretados como UTF-8
  const ruim = (utf8.match(/\uFFFD/g) ?? []).length;
  if (ruim > 0) {
    return { text: new TextDecoder("iso-8859-1").decode(buf), encoding: "ISO-8859-1" };
  }
  // Heurística inversa: "Ã§" / "Ã£" indicam UTF-8 lido como latin1 na origem
  return { text: utf8, encoding: "UTF-8" };
}

function detectarDelimitador(text: string): string {
  const linha = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const cand = [";", ",", "\t", "|"];
  let best = ";";
  let bestCount = -1;
  for (const c of cand) {
    const n = linha.split(c).length - 1;
    if (n > bestCount) {
      bestCount = n;
      best = c;
    }
  }
  return best;
}

export async function parsePrefeituraCSV(
  file: File,
  config: Config,
  overrides?: Partial<Record<string, string>>,
): Promise<ParsedPrefeitura> {
  const buf = await file.arrayBuffer();
  const { text, encoding } = decode(buf);
  const delimitador = detectarDelimitador(text);

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    delimiter: delimitador,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const cabecalhos = (parsed.meta.fields ?? []).filter(Boolean);
  const campos: Record<string, string | null> = {
    ...detectarLayout(cabecalhos),
    ...(overrides ?? {}),
  } as Record<string, string | null>;


  const avisos: string[] = [];
  for (const obrigatorio of ["numeroNota", "cnpjPrestador", "valorNota"]) {
    if (!campos[obrigatorio]) {
      avisos.push(`Coluna não identificada no CSV: ${obrigatorio}. Use o mapeamento manual.`);
    }
  }

  const get = (row: Record<string, string>, campo: string): string => {
    const col = campos[campo];
    return col ? String(row[col] ?? "") : "";
  };

  const cnpjTomadorCfg = onlyDigits(config.cnpjTomador);
  const cmcTomadorCfg = onlyDigits(config.cmcTomador);

  const notas: NotaNormalizada[] = [];

  for (const row of parsed.data) {
    if (!row || typeof row !== "object") continue;
    const temAlgo = Object.values(row).some((v) => String(v ?? "").trim());
    if (!temAlgo) continue;

    // Ignora linhas de totalização do rodapé (ex.: Recife exporta "Total;300;...")
    const primeiraCelula = String(Object.values(row)[0] ?? "").trim().toLowerCase();
    if (primeiraCelula === "total" || primeiraCelula.startsWith("total ")) continue;

    // Número da nota com fallback (Recife: "Nº da Nota" vem vazio, número real em "NFS-e Nacional")
    const numeroRaw = get(row, "numeroNota").trim() || get(row, "numeroNotaAlt").trim();
    const cnpjPrestRow = onlyDigits(get(row, "cnpjPrestador"));
    // Linha sem número E sem prestador não é nota (subtotais/quebras)
    if (!normalizeNumeroNota(numeroRaw) && !cnpjPrestRow) continue;

    // Recife exporta "Status da Nota Fiscal" como código (1=Normal, 2=Cancelada, 3=Substituída)
    const situacaoRaw = get(row, "situacao").trim();
    const situacao =
      { "1": "Normal", "2": "Cancelada", "3": "Substituída" }[situacaoRaw] ?? situacaoRaw;
    const cnpjTomRow = onlyDigits(get(row, "cnpjTomador"));
    const cmcTomRow = onlyDigits(get(row, "cmcTomador"));
    const isEntrada =
      (!!cnpjTomadorCfg && cnpjTomRow === cnpjTomadorCfg) ||
      (!!cmcTomadorCfg && cmcTomRow === cmcTomadorCfg);

    const valorNota = parseBRNumber(get(row, "valorNota"));
    const baseISS = valorNota - parseBRNumber(get(row, "deducoes"));
    const valorISS = parseBRNumber(get(row, "valorISS"));
    const tipoRetencao = get(row, "tipoRetencao").trim();
    const retencaoRaw = get(row, "retencao").trim();
    const retencaoVal = parseBRNumber(retencaoRaw);
    // Recife: "ISS Retido" é flag 0/1 (não valor); Camaragibe: "Retenção" pode ser valor
    const retencaoEhFlag = /^[01]([.,]0+)?$/.test(retencaoRaw) || /^[sn]$/i.test(retencaoRaw);
    const retencaoFlag = /^1([.,]0+)?$/.test(retencaoRaw) || /^s$/i.test(retencaoRaw);
    const isRetido =
      (retencaoEhFlag && retencaoFlag) ||
      (/^retido|^sim/i.test(tipoRetencao) && !/n[aã]o/i.test(tipoRetencao));
    const issRetido = isRetido ? valorISS || retencaoVal : 0;

    notas.push({
      cnpjPrestador: cnpjPrestRow,
      numeroNota: normalizeNumeroNota(numeroRaw),
      valorNota,
      valorISS,
      issRetido,
      baseISS,
      aliquota: parseBRNumber(get(row, "aliquota")),
      competencia: competenciaFrom(get(row, "competencia") || get(row, "dataEmissao")),
      data: parseBRDate(get(row, "dataEmissao")),
      razaoSocial: get(row, "razaoPrestador").trim(),
      situacao,
      tipoRetencao: tipoRetencao || (retencaoEhFlag && retencaoFlag ? "Retido" : ""),
      tipo: isEntrada ? "entrada" : "saida",
      origem: "prefeitura",
      raw: row,
    });
  }

  return {
    notas,
    notasSaidaIgnoradas: 0,
    duplicadasIgnoradas: 0,
    substituidasIgnoradas: 0,
    mapeamento: { campos, cabecalhos, delimitador, encoding },
    avisos,
  };
}
