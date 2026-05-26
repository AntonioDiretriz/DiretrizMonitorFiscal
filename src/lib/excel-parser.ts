import * as XLSX from 'xlsx';
import type { ExcelNfeData } from './xml-confront-types';

const HEADER_KEYWORDS = [
  'número', 'numero', 'nº nf', 'n° nf', 'nf', 'chave', 'chnfe',
  'cnpj', 'cpf', 'valor', 'contábil', 'contabil', 'emitente',
  'série', 'serie', 'entrada', 'documento', 'razão', 'razao', 'nome',
  'base', 'icms', 'aliq', 'cfop',
];

// CFOPs de serviço de transporte (CTe) — não há NF-e correspondente, devem ser ignorados
export const CFOPS_FRETE_IGNORADOS = new Set<string>([
  '1352', '2352', '3352',
  '1353', '2353', '3353',
  '1354', '2354', '3354',
  '1355', '2355', '3355',
  '1356', '2356', '3356',
  '1360', '2360',
  '1932', '2932',
]);

// CFOPs de ajuste/estorno — quando valor contábil é zero, ignorar de "ausentes"
export const CFOPS_AJUSTE_ZERADO = new Set<string>(['2949', '1949']);

function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function cleanCnpj(v: string): string {
  return String(v).replace(/[.\-\/\s]/g, '');
}

function formatDate(v: unknown): string {
  if (!v) return '';
  if (v instanceof Date) {
    const d = v.getDate().toString().padStart(2, '0');
    const m = (v.getMonth() + 1).toString().padStart(2, '0');
    return `${d}/${m}/${v.getFullYear()}`;
  }
  return String(v);
}

export function getSheetNames(workbook: XLSX.WorkBook): string[] {
  return workbook.SheetNames;
}

export function readWorkbook(buffer: ArrayBuffer): XLSX.WorkBook {
  return XLSX.read(buffer, { type: 'array', cellDates: true });
}

function findHeaderRow(data: unknown[][]): number {
  for (let i = 0; i < Math.min(data.length, 30); i++) {
    const row = data[i];
    if (!row) continue;
    const cellTexts = row.map((c) => (c ? normalizeStr(String(c)) : ''));
    const matches = cellTexts.filter((t) =>
      HEADER_KEYWORDS.some((kw) => t.includes(kw))
    );
    if (matches.length >= 3) return i;
  }
  return -1;
}

interface ColumnMap {
  nNF: number;
  serie: number;
  dataEntrada: number;
  dataDocumento: number;
  cnpj: number;
  nome: number;
  chNFe: number;
  valorContabil: number;
  vBC: number;
  vICMS: number;
  vST: number;
  cfop: number;
}

function mapColumns(headerRow: unknown[]): ColumnMap {
  const map: ColumnMap = {
    nNF: -1, serie: -1, dataEntrada: -1, dataDocumento: -1,
    cnpj: -1, nome: -1, chNFe: -1, valorContabil: -1,
    vBC: -1, vICMS: -1, vST: -1, cfop: -1,
  };

  headerRow.forEach((cell, idx) => {
    const t = cell ? normalizeStr(String(cell)) : '';
    if (t.includes('chave') || t.includes('chnfe')) map.chNFe = idx;
    else if (t.includes('cfop') || t.includes('c.f.o.p')) map.cfop = idx;
    else if (t.includes('numero') || t.includes('nº') || t.includes('n°') || t === 'nf') map.nNF = idx;
    else if (t.includes('serie') || t.includes('sub')) {
      if (map.serie === -1) map.serie = idx;
    }
    else if (t.includes('entrada')) map.dataEntrada = idx;
    else if (t.includes('documento') || t.includes('emissao')) map.dataDocumento = idx;
    else if (t.includes('cnpj') || t.includes('cpf')) map.cnpj = idx;
    else if (t.includes('nome') || t.includes('razao') || t.includes('razão')) map.nome = idx;
    else if (t.includes('contabil') || t.includes('contábil')) map.valorContabil = idx;
    else if (t.includes('base') && t.includes('calculo')) map.vBC = idx;
    else if (t.includes('creditado') || (t.includes('imposto') && !t.includes('isent'))) map.vICMS = idx;
    else if (t.includes('outras')) map.vST = idx;
  });

  return map;
}

// Some sheets split header across 2 rows (row N has partial labels, row N+1 has the rest).
// We merge the two header rows before mapping columns.
function mergeHeaderRows(row1: unknown[], row2: unknown[]): unknown[] {
  const len = Math.max(row1.length, row2.length);
  const merged: unknown[] = [];
  for (let i = 0; i < len; i++) {
    const a = row1[i] ? String(row1[i]).trim() : '';
    const b = row2[i] ? String(row2[i]).trim() : '';
    merged[i] = [a, b].filter(Boolean).join(' ');
  }
  return merged;
}

export function parseSheet(workbook: XLSX.WorkBook, sheetName: string): ExcelNfeData[] {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return [];

  const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const headerIdx = findHeaderRow(data);
  if (headerIdx < 0) return [];

  // Merge current header row with the next one (common in these reports)
  const headerRow1 = data[headerIdx] ?? [];
  const headerRow2 = data[headerIdx + 1] ?? [];
  const mergedHeader = mergeHeaderRows(headerRow1 as unknown[], headerRow2 as unknown[]);
  const colMap = mapColumns(mergedHeader);

  // Determine where data starts (skip header rows)
  const dataStart = headerIdx + (headerRow2.some((c) => {
    const t = c ? normalizeStr(String(c)) : '';
    return HEADER_KEYWORDS.some((kw) => t.includes(kw));
  }) ? 2 : 1);

  const results: ExcelNfeData[] = [];

  for (let i = dataStart; i < data.length; i++) {
    const row = data[i] as unknown[];
    if (!row || row.every((c) => !c || String(c).trim() === '')) continue;

    const nNF = colMap.nNF >= 0 ? String(row[colMap.nNF] ?? '').trim() : '';
    const cnpj = colMap.cnpj >= 0 ? cleanCnpj(String(row[colMap.cnpj] ?? '')) : '';

    // Skip rows that don't look like data (need at least nNF or CNPJ)
    if (!nNF && !cnpj) continue;
    // Skip if nNF is not numeric
    if (nNF && !/^\d+$/.test(nNF)) continue;

    // CTe (frete) — não há NF-e correspondente; marcar para entrar como OK
    let isFrete = false;
    let cfopRaw = '';
    if (colMap.cfop >= 0) {
      cfopRaw = String(row[colMap.cfop] ?? '').replace(/\D/g, '');
      if (cfopRaw && CFOPS_FRETE_IGNORADOS.has(cfopRaw)) isFrete = true;
    }

    const valorStr = colMap.valorContabil >= 0 ? row[colMap.valorContabil] : 0;
    const valor = typeof valorStr === 'number' ? valorStr : parseFloat(String(valorStr).replace(/[^\d,.\-]/g, '').replace(',', '.')) || 0;

    const parseCell = (v: unknown): number => {
      if (typeof v === 'number') return v;
      const s = String(v ?? '').replace(/[^\d,.\-]/g, '').replace(',', '.');
      return parseFloat(s) || 0;
    };

    results.push({
      nNF,
      serie: colMap.serie >= 0 ? String(row[colMap.serie] ?? '').trim() : '',
      dataEntrada: colMap.dataEntrada >= 0 ? formatDate(row[colMap.dataEntrada]) : '',
      dataDocumento: colMap.dataDocumento >= 0 ? formatDate(row[colMap.dataDocumento]) : '',
      cnpjEmitente: cnpj,
      nomeEmitente: colMap.nome >= 0 ? String(row[colMap.nome] ?? '').trim() : '',
      chNFe: colMap.chNFe >= 0 ? String(row[colMap.chNFe] ?? '').replace(/\D/g, '') : '',
      valorContabil: valor,
      vBC: colMap.vBC >= 0 ? parseCell(row[colMap.vBC]) : 0,
      vICMS: colMap.vICMS >= 0 ? parseCell(row[colMap.vICMS]) : 0,
      vST: colMap.vST >= 0 ? parseCell(row[colMap.vST]) : 0,
      rowIndex: i,
      sheetName,
      isFrete,
      cfop: cfopRaw || undefined,
    });
  }

  return results;
}

export function autoDetectSheet(workbook: XLSX.WorkBook): string {
  const names = workbook.SheetNames;
  for (const name of names) {
    const ws = workbook.Sheets[name];
    if (!ws) continue;
    const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const headerIdx = findHeaderRow(data);
    if (headerIdx >= 0) return name;
  }
  return names[0] ?? '';
}
