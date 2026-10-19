import type { XmlNfeData, ExcelNfeData, ConfrontoResult, ConfrontoSummary } from './xml-confront-types';
import { CFOPS_FRETE_IGNORADOS, CFOPS_AJUSTE_ZERADO } from './excel-parser';

const isAjusteZerado = (cfop?: string, valor?: number | null) =>
  !!cfop && CFOPS_AJUSTE_ZERADO.has(cfop) && (valor ?? 0) === 0;

function cleanCnpj(v: string): string {
  return String(v ?? '').replace(/[.\-\/\s]/g, '');
}

function isCpf(v: string | null | undefined): boolean {
  return cleanCnpj(v ?? '').length === 11;
}

/** Normaliza a série ("069 " → "69", "" → "0") para comparação. */
function normSerie(v: string | null | undefined): string {
  const digits = String(v ?? '').replace(/\D/g, '').replace(/^0+/, '');
  return digits || '0';
}



/** CNPJs relevantes de um XML: emitente e destinatário (nota emitida pela própria empresa). */
function xmlCnpjList(x: { cnpjEmitente?: string | null; cnpjDest?: string | null }): string[] {
  return [cleanCnpj(x.cnpjEmitente ?? ''), cleanCnpj(x.cnpjDest ?? '')].filter(Boolean);
}

/** CNPJ da planilha bate com o emitente OU o destinatário do XML. */
function cnpjMatchXml(x: { cnpjEmitente?: string | null; cnpjDest?: string | null }, rowCnpj: string | null | undefined): boolean {
  const c = cleanCnpj(rowCnpj ?? '');
  return !!c && xmlCnpjList(x).includes(c);
}

/** Compatível: bate com emitente/destinatário, ou um dos lados não informa CNPJ. */
function cnpjCompatXml(x: { cnpjEmitente?: string | null; cnpjDest?: string | null }, rowCnpj: string | null | undefined): boolean {
  const c = cleanCnpj(rowCnpj ?? '');
  const list = xmlCnpjList(x);
  return !c || list.length === 0 || list.includes(c);
}

/**
 * Compatibilidade "frouxa": além do compat normal, aceita quando o XML não tem
 * o CNPJ do destinatário gravado (XMLs importados antes da leitura do <dest>).
 * Nesses casos o CNPJ da planilha pode ser o do destinatário — não podemos
 * usar a divergência com o emitente para bloquear o casamento.
 */
function cnpjLooseXml(x: { cnpjEmitente?: string | null; cnpjDest?: string | null }, rowCnpj: string | null | undefined): boolean {
  return cnpjCompatXml(x, rowCnpj) || !cleanCnpj(x.cnpjDest ?? '');
}

/**
 * CNPJ aceitável nos fallbacks (nº+série, nº+valor).
 * Quando a planilha informa o CNPJ/CPF do emitente, ele é obrigatório: só casa
 * com XML cujo emitente ou destinatário seja o mesmo documento. Sem CNPJ na
 * linha, mantém a regra frouxa (XMLs antigos sem destinatário gravado).
 */
function cnpjOkFallback(x: { cnpjEmitente?: string | null; cnpjDest?: string | null }, rowCnpj: string | null | undefined): boolean {
  return cleanCnpj(rowCnpj ?? '') ? cnpjMatchXml(x, rowCnpj) : cnpjLooseXml(x, rowCnpj);
}

/** Mesmo grupo (raiz de 8 dígitos do CNPJ) — matriz/filial. Só usar junto com valor. */
function cnpjRaizOk(x: { cnpjEmitente?: string | null; cnpjDest?: string | null }, rowCnpj: string | null | undefined): boolean {
  if (cnpjOkFallback(x, rowCnpj)) return true;
  const c = cleanCnpj(rowCnpj ?? '');
  if (c.length !== 14) return false;
  return xmlCnpjList(x).some((v) => v.length === 14 && v.slice(0, 8) === c.slice(0, 8));
}

/**
 * Valor do XML comparável ao "Valor Contábil" da planilha.
 * Algumas notas (ex.: Yamaha) somam PIS ST / COFINS ST ao vNF como despesa
 * acessória, valores que o Dealernet não lança no Valor Contábil. Quando o
 * valor escriturado do XML bate com a planilha, é ele que vale.
 */
function valorXmlComparavel(xml: XmlNfeData, planilhaVal: number | null | undefined): number {
  if (planilhaVal != null) {
    const esc = xml.vEscriturado;
    if (esc != null && Math.abs(planilhaVal - esc) <= 0.01) return esc;
    // Dealernet não soma PIS/COFINS (ST) destacados no vNF
    const semPisCofins = +(xml.vNF - (xml.vPIS || 0) - (xml.vCOFINS || 0)).toFixed(2);
    if ((xml.vPIS || xml.vCOFINS) && Math.abs(planilhaVal - semPisCofins) <= 0.01) return semPisCofins;
  }
  return xml.vNF;
}

/** O XML bate em valor com a linha da planilha (vNF ou valor escriturado). */
function valorBate(xml: XmlNfeData, planilhaVal: number | null | undefined): boolean {
  return planilhaVal != null && Math.abs(valorXmlComparavel(xml, planilhaVal) - planilhaVal) <= 0.01;
}



export function recomputeSummary(results: ConfrontoResult[]): ConfrontoSummary {
  return {
    totalPlanilha: results.filter((r) => r.valorPlanilha !== null).length,
    totalXmls: results.filter((r) => r.valorXml !== null).length,
    ok: results.filter((r) => r.status === 'ok').length,
    divergentes: results.filter((r) => r.status === 'divergente').length,
    ausentes: results.filter((r) => r.status === 'ausente_xml').length,
    naoEscriturados: results.filter((r) => r.status === 'nao_escriturado').length,
    canceladas: results.filter((r) => r.status === 'cancelada').length,
  };
}

/**
 * Chave única para detectar duplicatas de resultado.
 * - chNFe (44 dígitos) é a chave preferida.
 * - Fallback: nNF|serie|CNPJ|valor (planilha ou xml).
 */
function resultKey(r: ConfrontoResult): string {
  if (r.chNFe && r.chNFe.length === 44) return `ch:${r.chNFe}`;
  const cnpj = cleanCnpj(r.cnpjEmitente ?? '');
  const valor = r.valorPlanilha ?? r.valorXml ?? '';
  return `n:${r.nNF ?? ''}|${r.serie ?? ''}|${cnpj}|${valor}`;
}

/**
 * Remove resultados duplicados. Mantém a 1ª ocorrência, mas troca quando o
 * existente é `ok`/`cancelada` e o novo é `divergente` (mantém o pior status visível).
 */
export function dedupResults(results: ConfrontoResult[]): ConfrontoResult[] {
  const map = new Map<string, ConfrontoResult>();
  for (const r of results) {
    const k = resultKey(r);
    const existing = map.get(k);
    if (!existing) { map.set(k, r); continue; }
    if ((existing.status === 'ok' || existing.status === 'cancelada') && r.status === 'divergente') {
      map.set(k, r);
    }
  }
  return Array.from(map.values());
}

/**
 * Extracts a YYYY-MM key from a date string.
 * Accepts "DD/MM/AAAA", "DD/MM/AAAA HH:mm", and ISO "AAAA-MM-DDTHH:mm:ss".
 * Returns "sem-data" when no valid date can be parsed.
 */
export function getMonthKey(data: string | null | undefined): string {
  if (!data) return 'sem-data';
  const s = String(data).trim();
  // ISO format YYYY-MM-DD...
  const isoMatch = s.match(/^(\d{4})-(\d{2})-\d{2}/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`;
  // BR format DD/MM/AAAA
  const brMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}`;
  return 'sem-data';
}

/**
 * Atualiza o "Valor Planilha" de uma análise salva com os valores atuais da
 * base de planilhas da empresa (ex.: linha corrigida após reenvio). Linhas com
 * XML cujo valor mudou passam a "divergente" para serem recomparadas por
 * `reconcileMissing`. Retorna quantas linhas mudaram.
 */
export function refreshPlanilhaValues(
  results: ConfrontoResult[],
  excelRows: ExcelNfeData[]
): { results: ConfrontoResult[]; changed: number } {
  const byKey = new Map<string, ExcelNfeData[]>();
  const keyOf = (nNF: string, cnpj: string) => `${nNF}|${cleanCnpj(cnpj)}`;
  for (const r of excelRows) {
    if (!r.nNF) continue;
    const k = keyOf(r.nNF, r.cnpjEmitente ?? '');
    const arr = byKey.get(k) ?? [];
    arr.push(r);
    byKey.set(k, arr);
  }
  let changed = 0;
  const out = results.map((row) => {
    if (row.valorPlanilha == null || !row.nNF) return row;
    if (row.status !== 'ok' && row.status !== 'divergente' && row.status !== 'ausente_xml') return row;
    const cand = byKey.get(keyOf(row.nNF, row.cnpjEmitente ?? '')) ?? [];
    const sameSerie = cand.filter((c) => normSerie(c.serie) === normSerie(row.serie));
    const lista = sameSerie.length > 0 ? sameSerie : cand;
    if (lista.length !== 1) return row; // ambíguo ou inexistente: não mexe
    const novo = lista[0].valorContabil;
    if (novo == null || Math.abs(novo - row.valorPlanilha) <= 0.01) return row;
    changed++;
    return {
      ...row,
      valorPlanilha: novo,
      isZerada: novo === 0,
      status: row.valorXml != null && row.status !== 'ausente_xml' ? 'divergente' : row.status,
    } as ConfrontoResult;
  });
  return { results: out, changed };
}

export function reconcileMissing(
  currentResults: ConfrontoResult[],
  newXmlData: XmlNfeData[],
  monthFilter?: (row: ConfrontoResult) => boolean
): { results: ConfrontoResult[]; summary: ConfrontoSummary; matched: number; unmatched: number } {
  const results = [...currentResults];
  let matched = 0;
  const usedXmlIdx = new Set<number>();

  // Pre-conta nNF dentro do conjunto novo para detectar ambiguidade no fallback por nNF apenas
  const nnfCounts = new Map<string, number>();
  for (const xml of newXmlData) {
    if (!xml.nNF) continue;
    nnfCounts.set(xml.nNF, (nnfCounts.get(xml.nNF) ?? 0) + 1);
  }

  for (let i = 0; i < results.length; i++) {
    const row = results[i];
    // Revisita ausentes e também divergentes: uma divergência pode ser apenas
    // despesa acessória (PIS/COFINS ST) somada ao vNF, resolvida ao recomparar.
    const revisitando = row.status === 'divergente';
    if (row.status !== 'ausente_xml' && !revisitando) continue;
    if (monthFilter && !monthFilter(row)) continue;

    let xmlIdx = -1;

    // 1) Match por chNFe (44 dígitos)
    if (row.chNFe && row.chNFe.length === 44) {
      xmlIdx = newXmlData.findIndex(
        (xml, idx) => !usedXmlIdx.has(idx) && xml.chNFe === row.chNFe
      );
    }

    // 2) Match por nNF + CNPJ
    if (xmlIdx === -1 && row.nNF && row.cnpjEmitente) {
      xmlIdx = newXmlData.findIndex(
        (xml, idx) =>
          !usedXmlIdx.has(idx) &&
          xml.nNF === row.nNF &&
          cnpjMatchXml(xml, row.cnpjEmitente)
      );
    }

    // 2b) Match por nNF + série (relatórios sem CNPJ, ex. RFS008 Modelo A)
    if (xmlIdx === -1 && row.nNF) {
      const serieRow = normSerie(row.serie);
      xmlIdx = newXmlData.findIndex(
        (xml, idx) =>
          !usedXmlIdx.has(idx) &&
          xml.nNF === row.nNF &&
          normSerie(xml.serie) === serieRow &&
          cnpjOkFallback(xml, row.cnpjEmitente)
      );
    }

    // Linhas já divergentes só são reavaliadas com casamento seguro (chave/nNF+CNPJ/série)
    if (revisitando && xmlIdx === -1) continue;

    // 2c) Match por nNF + valor aproximado
    if (xmlIdx === -1 && row.nNF && row.valorPlanilha != null) {
      const planilhaVal = row.valorPlanilha;
      xmlIdx = newXmlData.findIndex(
        (xml, idx) =>
          !usedXmlIdx.has(idx) &&
          xml.nNF === row.nNF &&
          cnpjRaizOk(xml, row.cnpjEmitente) &&
          normSerie(xml.serie) === normSerie(row.serie) &&
          valorBate(xml, planilhaVal)
      );
    }


    // 3) Fallback: nNF apenas (somente se único no conjunto novo E a linha não tem CNPJ).

    // Se a linha da planilha tem CNPJ e não casou no step 2, é NF de outro emitente
    // (ex.: frete vs. produto com mesmo nº de NF) — não podemos casar só por nNF.
    if (xmlIdx === -1 && row.nNF && !row.cnpjEmitente && (nnfCounts.get(row.nNF) ?? 0) === 1) {
      xmlIdx = newXmlData.findIndex(
        (xml, idx) => !usedXmlIdx.has(idx) && xml.nNF === row.nNF
      );
    }

    // 4) Fallback: CNPJ + valor aproximado (quando não há nNF na linha)
    if (xmlIdx === -1 && (!row.nNF || row.nNF === '0') && row.cnpjEmitente && row.valorPlanilha != null) {
      const planilhaVal = row.valorPlanilha;
      xmlIdx = newXmlData.findIndex(
        (xml, idx) =>
          !usedXmlIdx.has(idx) &&
          cnpjMatchXml(xml, row.cnpjEmitente) &&
          valorBate(xml, planilhaVal)
      );
    }

    if (xmlIdx === -1) continue;
    usedXmlIdx.add(xmlIdx);
    const xml = newXmlData[xmlIdx];
    const planilhaVal = (row.valorPlanilha ?? 0);
    const valorXml = valorXmlComparavel(xml, planilhaVal);
    const diff = Math.abs(planilhaVal - valorXml);
    results[i] = {
      ...row,
      status: xml.cancelada ? 'cancelada' : (diff <= 0.01 ? 'ok' : 'divergente'),
      valorXml,
      diferenca: xml.cancelada ? null : (diff > 0.01 ? planilhaVal - valorXml : 0),
      chNFe: xml.chNFe || row.chNFe,
      nomeEmitente: row.nomeEmitente || xml.xNome,
    };

    matched++;
  }

  // Remove linhas "não escriturado" de XMLs que acabaram de casar
  const chavesCasadas = new Set<string>();
  usedXmlIdx.forEach((idx) => { const k = newXmlData[idx].chNFe; if (k) chavesCasadas.add(k); });
  for (let i = results.length - 1; i >= 0; i--) {
    const r = results[i];
    if ((r.status === 'nao_escriturado' || r.status === 'cancelada') && r.valorPlanilha == null && r.chNFe && chavesCasadas.has(r.chNFe)) results.splice(i, 1);
  }

  // Unmatched XMLs become "nao_escriturado"
  let unmatched = 0;
  for (let i = 0; i < newXmlData.length; i++) {
    if (usedXmlIdx.has(i)) continue;
    const xml = newXmlData[i];
    results.push({
      status: xml.cancelada ? 'cancelada' : 'nao_escriturado',
      nNF: xml.nNF,
      serie: xml.serie,
      data: xml.dhEmi,
      cnpjEmitente: xml.cnpjEmitente,
      cnpjDest: xml.cnpjDest,
      nomeEmitente: xml.xNome,
      valorPlanilha: null,
      valorXml: xml.vNF,
      diferenca: null,
      chNFe: xml.chNFe,
    });
    unmatched++;
  }

  return { results: dedupResults(results), summary: recomputeSummary(dedupResults(results)), matched, unmatched };
}

/**
 * Reconcilia novas linhas de Excel (escrituração) com resultados atuais.
 * Espelho de `reconcileMissing` — tenta casar linhas com XMLs marcados como
 * `nao_escriturado`. Linhas sem correspondência viram novas entradas
 * `ausente_xml` (com regras auto-OK para CPF/frete/ajuste zerado).
 */
export function reconcileExcel(
  currentResults: ConfrontoResult[],
  newExcelRows: ExcelNfeData[],
  monthFilter?: (row: ConfrontoResult) => boolean
): { results: ConfrontoResult[]; summary: ConfrontoSummary; matched: number; unmatched: number } {
  const results = [...currentResults];
  let matched = 0;
  const usedRowIdx = new Set<number>();

  const nnfCounts = new Map<string, number>();
  for (const row of newExcelRows) {
    if (!row.nNF) continue;
    nnfCounts.set(row.nNF, (nnfCounts.get(row.nNF) ?? 0) + 1);
  }

  for (let i = 0; i < results.length; i++) {
    const xmlRow = results[i];
    // Reconcilia/atualiza qualquer linha cujo valor de planilha possa mudar
    // após reprocessar o Excel (inclui linhas já divergentes/ok/ausente_xml).
    if (
      xmlRow.status !== 'nao_escriturado' &&
      xmlRow.status !== 'divergente' &&
      xmlRow.status !== 'ok' &&
      xmlRow.status !== 'ausente_xml'
    ) continue;
    if (monthFilter && !monthFilter(xmlRow)) continue;

    let rowIdx = -1;

    // 1) chNFe
    if (xmlRow.chNFe && xmlRow.chNFe.length === 44) {
      rowIdx = newExcelRows.findIndex(
        (r, idx) => !usedRowIdx.has(idx) && r.chNFe === xmlRow.chNFe
      );
    }

    // 2) nNF + CNPJ
    if (rowIdx === -1 && xmlRow.nNF && xmlRow.cnpjEmitente) {
      rowIdx = newExcelRows.findIndex(
        (r, idx) =>
          !usedRowIdx.has(idx) &&
          r.nNF === xmlRow.nNF &&
          cnpjMatchXml(xmlRow, r.cnpjEmitente)
      );
    }

    // 2b) nNF + série
    if (rowIdx === -1 && xmlRow.nNF) {
      const serieXml = normSerie(xmlRow.serie);
      rowIdx = newExcelRows.findIndex(
        (r, idx) =>
          !usedRowIdx.has(idx) &&
          r.nNF === xmlRow.nNF &&
          normSerie(r.serie) === serieXml &&
          cnpjOkFallback(xmlRow, r.cnpjEmitente)
      );
    }

    // 2c) nNF + valor aproximado
    if (rowIdx === -1 && xmlRow.nNF && xmlRow.valorXml != null) {
      const xmlVal0 = xmlRow.valorXml;
      rowIdx = newExcelRows.findIndex(
        (r, idx) =>
          !usedRowIdx.has(idx) &&
          r.nNF === xmlRow.nNF &&
          cnpjRaizOk(xmlRow, r.cnpjEmitente) &&
          normSerie(xmlRow.serie) === normSerie(r.serie) &&
          r.valorContabil != null &&
          Math.abs(r.valorContabil - xmlVal0) <= 0.01
      );
    }

    // 3) nNF único — só quando a linha do XML não tem CNPJ para desambiguar

    if (rowIdx === -1 && xmlRow.nNF && !xmlRow.cnpjEmitente && (nnfCounts.get(xmlRow.nNF) ?? 0) === 1) {
      rowIdx = newExcelRows.findIndex(
        (r, idx) => !usedRowIdx.has(idx) && r.nNF === xmlRow.nNF
      );
    }

    // 4) CNPJ + valor aproximado (somente para nao_escriturado, onde temos só XML)
    if (
      rowIdx === -1 &&
      xmlRow.status === 'nao_escriturado' &&
      xmlRow.cnpjEmitente &&
      xmlRow.valorXml != null
    ) {
      const xmlVal = xmlRow.valorXml;
      rowIdx = newExcelRows.findIndex(
        (r, idx) =>
          !usedRowIdx.has(idx) &&
          cnpjMatchXml(xmlRow, r.cnpjEmitente) &&
          r.valorContabil != null &&
          Math.abs(r.valorContabil - xmlVal) <= 0.01
      );
    }

    if (rowIdx === -1) continue;
    usedRowIdx.add(rowIdx);
    const row = newExcelRows[rowIdx];
    const xmlVal = xmlRow.valorXml;
    const planilhaVal = row.valorContabil;
    // Recalcula status: se há XML, compara; se não, mantém ausente_xml.
    let newStatus = xmlRow.status;
    let diff: number | null = xmlRow.diferenca;
    if (xmlVal != null) {
      const d = Math.abs(planilhaVal - xmlVal);
      newStatus = d <= 0.01 ? 'ok' : 'divergente';
      diff = d > 0.01 ? planilhaVal - xmlVal : 0;
    }
    results[i] = {
      ...xmlRow,
      status: newStatus,
      nNF: xmlRow.nNF || row.nNF,
      serie: xmlRow.serie || row.serie,
      cnpjEmitente: xmlRow.cnpjEmitente || row.cnpjEmitente,
      nomeEmitente: xmlRow.nomeEmitente || row.nomeEmitente,
      valorPlanilha: planilhaVal,
      diferenca: diff,
      sheetName: row.sheetName,
      cfop: row.cfop,
      isFrete: row.isFrete,
      isZerada: row.isZerada ?? planilhaVal === 0,
    };

    matched++;
  }

  // Linhas Excel sem correspondência viram ausente_xml (com auto-OK)
  let unmatched = 0;
  for (let i = 0; i < newExcelRows.length; i++) {
    if (usedRowIdx.has(i)) continue;
    const row = newExcelRows[i];
    const cpf = isCpf(row.cnpjEmitente);
    const ajuste = isAjusteZerado(row.cfop, row.valorContabil);
    const autoOk = row.isFrete || cpf || ajuste;
    const valorPlanilha = row.valorContabil;
    results.push({
      status: autoOk ? 'ok' : 'ausente_xml',
      nNF: row.nNF,
      serie: row.serie,
      data: row.dataDocumento || row.dataEntrada,
      cnpjEmitente: row.cnpjEmitente,
      nomeEmitente: row.nomeEmitente || (row.isFrete ? 'CT-e (Frete)' : (ajuste ? 'Ajuste/Estorno (CFOP 2949)' : (cpf ? 'Pessoa Física (CPF)' : ''))),
      valorPlanilha,
      valorXml: autoOk ? valorPlanilha : null,
      diferenca: autoOk ? 0 : null,
      chNFe: row.chNFe,
      sheetName: row.sheetName,
      cfop: row.cfop,
      isFrete: row.isFrete,
      isZerada: row.isZerada ?? valorPlanilha === 0,
    });

    unmatched++;
  }

  const deduped = dedupResults(results);
  return { results: deduped, summary: recomputeSummary(deduped), matched, unmatched };
}

export function runConfronto(
  excelData: ExcelNfeData[],
  xmlData: XmlNfeData[]
): { results: ConfrontoResult[]; summary: ConfrontoSummary } {
  const results: ConfrontoResult[] = [];
  const usedXmlIdx = new Set<number>();

  // Build XML lookup structures (CNPJ sempre normalizado nos dois lados)
  const xmlByChave = new Map<string, number>();
  const xmlByNnfCnpj = new Map<string, number>();
  const xmlByNnf = new Map<string, number[]>();
  const nnfCounts = new Map<string, number>();

  for (let i = 0; i < xmlData.length; i++) {
    const xml = xmlData[i];
    if (xml.chNFe && xml.chNFe.length === 44) {
      xmlByChave.set(xml.chNFe, i);
    }
    if (xml.nNF) {
      for (const c of xmlCnpjList(xml)) {
        const key = `${xml.nNF}_${c}`;
        if (!xmlByNnfCnpj.has(key)) xmlByNnfCnpj.set(key, i);
      }
      nnfCounts.set(xml.nNF, (nnfCounts.get(xml.nNF) ?? 0) + 1);
      const list = xmlByNnf.get(xml.nNF);
      if (list) list.push(i); else xmlByNnf.set(xml.nNF, [i]);
    }
  }

  // Process each Excel row
  for (const row of excelData) {
    let matchedIdx = -1;

    // 1) Match por chNFe
    if (row.chNFe && row.chNFe.length === 44) {
      const idx = xmlByChave.get(row.chNFe);
      if (idx !== undefined && !usedXmlIdx.has(idx)) matchedIdx = idx;
    }

    // 2) Match por nNF + CNPJ
    if (matchedIdx === -1 && row.nNF && row.cnpjEmitente) {
      const key = `${row.nNF}_${cleanCnpj(row.cnpjEmitente)}`;
      const idx = xmlByNnfCnpj.get(key);
      if (idx !== undefined && !usedXmlIdx.has(idx)) matchedIdx = idx;
    }

    // 2b) Match por nNF + série (relatórios sem CNPJ, ex. RFS008 Modelo A)
    if (matchedIdx === -1 && row.nNF) {
      const serieRow = normSerie(row.serie);
      const cand = xmlByNnf.get(row.nNF) ?? [];
      const found = cand.find(
        (idx) =>
          !usedXmlIdx.has(idx) &&
          normSerie(xmlData[idx].serie) === serieRow &&
          cnpjOkFallback(xmlData[idx], row.cnpjEmitente)
      );
      if (found !== undefined) matchedIdx = found;
    }

    // 2c) Match por nNF + valor aproximado
    if (matchedIdx === -1 && row.nNF && row.valorContabil != null) {
      const cand = xmlByNnf.get(row.nNF) ?? [];
      const found = cand.find(
        (idx) =>
          !usedXmlIdx.has(idx) &&
          cnpjRaizOk(xmlData[idx], row.cnpjEmitente) &&
          normSerie(xmlData[idx].serie) === normSerie(row.serie) &&
          valorBate(xmlData[idx], row.valorContabil)
      );
      if (found !== undefined) matchedIdx = found;
    }

    // 3) Fallback: nNF apenas — só quando a linha da planilha não tem CNPJ.
    // Evita casar linhas de frete (transportadora) com XML de produto de mesmo nNF.
    if (matchedIdx === -1 && row.nNF && !row.cnpjEmitente && (nnfCounts.get(row.nNF) ?? 0) === 1) {
      matchedIdx = xmlData.findIndex(
        (xml, idx) => !usedXmlIdx.has(idx) && xml.nNF === row.nNF
      );
    }

    // 4) Fallback: CNPJ + valor aproximado (linhas sem nNF)
    if (matchedIdx === -1 && (!row.nNF || row.nNF === '0') && row.cnpjEmitente && row.valorContabil != null) {
      matchedIdx = xmlData.findIndex(
        (xml, idx) =>
          !usedXmlIdx.has(idx) &&
          cnpjMatchXml(xml, row.cnpjEmitente) &&
          valorBate(xml, row.valorContabil)
      );
    }


    const matchedXml = matchedIdx >= 0 ? xmlData[matchedIdx] : undefined;

    if (matchedXml) {
      usedXmlIdx.add(matchedIdx);
      const valorPlanilha = row.valorContabil;
      const valorXmlComp = valorXmlComparavel(matchedXml, valorPlanilha);
      const diff = Math.abs(valorPlanilha - valorXmlComp);
      results.push({
        status: matchedXml.cancelada ? 'cancelada' : (diff <= 0.01 ? 'ok' : 'divergente'),
        nNF: row.nNF,
        serie: row.serie,
        data: row.dataDocumento || row.dataEntrada,
        cnpjEmitente: row.cnpjEmitente,
        nomeEmitente: row.nomeEmitente || matchedXml.xNome,
        valorPlanilha,
        valorXml: valorXmlComp,
        diferenca: matchedXml.cancelada ? null : (diff > 0.01 ? valorPlanilha - valorXmlComp : 0),

        chNFe: matchedXml.chNFe,
        sheetName: row.sheetName,
        cfop: row.cfop,
        isFrete: row.isFrete,
        isZerada: row.isZerada ?? valorPlanilha === 0,
      });

    } else {
      const cpf = isCpf(row.cnpjEmitente);
      const ajuste = isAjusteZerado(row.cfop, row.valorContabil);
      const autoOk = row.isFrete || cpf || ajuste;
      const valorPlanilha = row.valorContabil;
      results.push({
        status: autoOk ? 'ok' : 'ausente_xml',
        nNF: row.nNF,
        serie: row.serie,
        data: row.dataDocumento || row.dataEntrada,
        cnpjEmitente: row.cnpjEmitente,
        nomeEmitente: row.nomeEmitente || (row.isFrete ? 'CT-e (Frete)' : (ajuste ? 'Ajuste/Estorno (CFOP 2949)' : (cpf ? 'Pessoa Física (CPF)' : ''))),
        valorPlanilha,
        valorXml: autoOk ? valorPlanilha : null,
        diferenca: autoOk ? 0 : null,
        chNFe: row.chNFe,
        sheetName: row.sheetName,
        cfop: row.cfop,
        isFrete: row.isFrete,
        isZerada: row.isZerada ?? valorPlanilha === 0,
      });

    }
  }

  // Find XMLs not used in spreadsheet matching
  for (let i = 0; i < xmlData.length; i++) {
    if (usedXmlIdx.has(i)) continue;
    const xml = xmlData[i];
    results.push({
      status: xml.cancelada ? 'cancelada' : 'nao_escriturado',
      nNF: xml.nNF,
      serie: xml.serie,
      data: xml.dhEmi,
      cnpjEmitente: xml.cnpjEmitente,
      cnpjDest: xml.cnpjDest,
      nomeEmitente: xml.xNome,
      valorPlanilha: null,
      valorXml: xml.vNF,
      diferenca: null,
      chNFe: xml.chNFe,
    });
  }

  const deduped = dedupResults(results);
  return { results: deduped, summary: recomputeSummary(deduped) };
}

/**
 * Sanitiza resultados antigos (fechamentos salvos antes das regras de CPF/Frete):
 * - Linhas `ausente_xml` com CPF (11 dígitos) viram `ok`.
 * - Linhas `ausente_xml` com `isFrete` ou `cfop` em CFOPS_FRETE_IGNORADOS viram `ok`.
 * Retorna { results, summary, changed } — `changed` indica se algo foi reclassificado.
 */
function normalizeName(s: string | null | undefined): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const FRETE_NAME_RE = /\b(transporte|transportes|transportadora|logistica|cargo|cargas|frete)\b/;
const SEGURO_NAME_RE = /\b(seguros|seguradora|seguro)\b/;

export function sanitizeLegacyResults(
  input: ConfrontoResult[]
): { results: ConfrontoResult[]; summary: ConfrontoSummary; changed: number } {
  let changed = 0;
  const results = input.map((r0) => {
    // Marca notas zeradas (valor contábil 0) para poderem ser ocultadas.
    let r = r0;
    if (r.isZerada === undefined && r.valorPlanilha === 0) {
      r = { ...r, isZerada: true };
      changed++;
    }
    if (r.status !== 'ausente_xml') return r;
    const cpf = isCpf(r.cnpjEmitente);
    const cfopFrete = !!(r.cfop && CFOPS_FRETE_IGNORADOS.has(r.cfop));
    const ajuste = isAjusteZerado(r.cfop, r.valorPlanilha);
    const nome = normalizeName(r.nomeEmitente);
    const nomeFrete = FRETE_NAME_RE.test(nome);
    const nomeSeguro = SEGURO_NAME_RE.test(nome);
    if (!cpf && !cfopFrete && !r.isFrete && !nomeFrete && !nomeSeguro && !ajuste) return r;
    changed++;
    const valor = r.valorPlanilha ?? 0;
    let label = r.nomeEmitente;
    if (!label) {
      if (cfopFrete || r.isFrete || nomeFrete) label = 'CT-e (Frete)';
      else if (nomeSeguro) label = 'Apólice de Seguro';
      else if (ajuste) label = 'Ajuste/Estorno (CFOP 2949)';
      else label = 'Pessoa Física (CPF)';
    }
    return {
      ...r,
      status: 'ok' as const,
      nomeEmitente: label,
      valorXml: valor,
      diferenca: 0,
    };
  });

  const deduped = dedupResults(results);
  return { results: deduped, summary: recomputeSummary(deduped), changed: changed + (results.length - deduped.length) };
}
