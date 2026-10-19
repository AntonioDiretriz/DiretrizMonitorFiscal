import type { NotaNormalizada, ParsedDealernet, TotaisPDF } from "./types";
import {
  competenciaFrom,
  normalizeNumeroNota,
  parseBRDate,
  parseBRNumber,
} from "./format";

// Lazy import of pdfjs to keep initial bundle light. Worker URL is bundled by Vite.
async function getPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (
    await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
  ).default;
  (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc =
    workerUrl;
  return pdfjs;
}

const MONEY_RE = /^-?\d{1,3}(?:\.\d{3})*,\d{2}$|^-?\d+,\d{2}$/;
const DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

interface Tok {
  x: number; // left edge
  r: number; // right edge
  s: string;
}

interface RawLine {
  y: number;
  text: string;
  tokens: string[];
  parts: Tok[];
}

/** Money columns are right-aligned; map them by the right edge of the header label. */
const MONEY_COLS = [
  ["Valor Nota", "valorNota"],
  ["Deduções", "deducoes"],
  ["Base ISS", "baseISS"],
  ["%ISS", "aliquota"],
  ["Valor ISS", "valorISS"],
  ["ISS Retido", "issRetido"],
] as const;

type MoneyKey = (typeof MONEY_COLS)[number][1];

/** Text columns are left-aligned; map them by the left edge of the header label. */
const TEXT_COLS = [
  ["Data", "data"],
  ["Nota", "nota"],
  ["Cliente", "cliente"],
  ["CNPJ", "cnpj"],
  ["Observação", "obs"],
] as const;

type TextKey = (typeof TEXT_COLS)[number][1];

interface Layout {
  right: Partial<Record<MoneyKey, number>>;
  left: Partial<Record<TextKey, number>>;
}

function groupLinesByY(items: { str: string; transform: number[]; width?: number }[]): RawLine[] {
  const buckets = new Map<number, Tok[]>();
  for (const it of items) {
    const raw = it.str;
    if (!raw || !raw.trim()) continue;
    const x = it.transform[4];
    const y = Math.round(it.transform[5]);
    let key = y;
    for (const k of buckets.keys()) {
      if (Math.abs(k - y) <= 2) {
        key = k;
        break;
      }
    }
    const bucket = buckets.get(key) ?? [];
    bucket.push({ x, r: x + (it.width ?? 0), s: raw.trim() });
    buckets.set(key, bucket);
  }
  const lines: RawLine[] = [];
  for (const [y, parts] of buckets.entries()) {
    parts.sort((a, b) => a.x - b.x);
    const tokens = parts.map((p) => p.s).filter(Boolean);
    const text = tokens.join(" ").replace(/\s+/g, " ").trim();
    if (text) lines.push({ y, text, tokens, parts });
  }
  lines.sort((a, b) => b.y - a.y);
  return lines;
}

function detectLayout(line: RawLine): Layout | null {
  const has = (label: string) => line.parts.find((p) => p.s === label);
  if (!has("Valor Nota") || !has("Base ISS")) return null;
  const layout: Layout = { right: {}, left: {} };
  for (const [label, key] of MONEY_COLS) {
    const it = has(label);
    if (it) layout.right[key] = it.r;
  }
  for (const [label, key] of TEXT_COLS) {
    const it = has(label);
    if (it) layout.left[key] = it.x;
  }
  return layout;
}

function pickMoney(line: RawLine, layout: Layout, key: MoneyKey, tol = 9): number | null {
  const target = layout.right[key];
  if (target == null) return null;
  const hit = line.parts.find((p) => MONEY_RE.test(p.s) && Math.abs(p.r - target) <= tol);
  return hit ? parseBRNumber(hit.s) : null;
}

function findCNPJ(s: string): string | null {
  const digits = s.replace(/\D+/g, "");
  const m2 = digits.match(/\d{14}/);
  return m2 ? m2[0] : null;
}

export async function parseDealernetPDF(file: File): Promise<ParsedDealernet> {
  const pdfjs = await getPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;

  const allLines: RawLine[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items as { str: string; transform: number[]; width?: number }[];
    allLines.push(...groupLinesByY(items));
  }

  const notas: NotaNormalizada[] = [];
  const totais: TotaisPDF = {};
  let cnpjEmpresa: string | undefined;
  let razaoEmpresa: string | undefined;
  let inscMunicipal: string | undefined;
  let periodoInicio: string | undefined;
  let periodoFim: string | undefined;

  // The column header appears only on the first page, but coordinates are the
  // same on every page, so the layout is kept across pages.
  let layout: Layout | null = null;
  let currentDateStr = "";

  for (const line of allLines) {
    const text = line.text;

    if (!cnpjEmpresa) {
      const m = text.match(/CNPJ[:\s]*([\d./-]{14,20})/i);
      if (m) cnpjEmpresa = m[1].replace(/\D+/g, "");
      const e = text.match(/Empresa[:\s]*(.+?)(?:\s{2,}|\s+CNPJ|$)/i);
      if (e && !razaoEmpresa) razaoEmpresa = e[1].trim();
    }
    if (!inscMunicipal) {
      const m = text.match(/Insc\.?\s*Mun\.?[:\s]*([\d.-]+)/i);
      if (m) inscMunicipal = m[1].replace(/\D+/g, "");
    }
    if (!periodoInicio) {
      const m = text.match(/(\d{2}\/\d{2}\/\d{4})\s*(?:a|até|-|à)\s*(\d{2}\/\d{2}\/\d{4})/i);
      if (m) {
        periodoInicio = parseBRDate(m[1]);
        periodoFim = parseBRDate(m[2]);
      }
    }

    const detected = detectLayout(line);
    if (detected) {
      layout = detected;
      continue;
    }
    if (!layout) continue;

    // Totals rows
    if (/Total\s*\(Geral\)/i.test(text)) {
      assignTotals(totais, line, layout);
      continue;
    }
    if (/Sub[-\s]?Total\s+Entradas\s+por\s+Movimento/i.test(text)) {
      assignTotals(totais, line, layout);
      continue;
    }
    if (/Saldo\s+Devedor/i.test(text)) {
      const nums = extractMoneyTokens(line.tokens);
      if (nums.length) totais.saldoDevedor = nums[nums.length - 1];
      continue;
    }
    if (/Sub[-\s]?Total|Total\s+Entradas|Total\s+Sa[ií]das|Empresa:|Endereço:/i.test(text)) {
      continue;
    }

    // Date column (grouped rows inherit the last printed date)
    const dateX = layout.left.data ?? 0;
    const dateTok = line.parts.find((p) => DATE_RE.test(p.s) && Math.abs(p.x - dateX) <= 8);
    if (dateTok) currentDateStr = dateTok.s;

    // A data row is any line carrying a value in the "Valor Nota" column
    const valorNota = pickMoney(line, layout, "valorNota");
    if (valorNota == null) continue;

    const cnpjX = layout.left.cnpj ?? 0;
    const cnpjTok = line.parts.find(
      (p) => Math.abs(p.x - cnpjX) <= 14 && /^\d{11,14}$/.test(p.s.replace(/\D+/g, "")),
    );
    const cnpjPrestador = cnpjTok ? cnpjTok.s.replace(/\D+/g, "") : (findCNPJ(text) ?? "");

    const notaX = layout.left.nota ?? 0;
    const notaTok = line.parts.find((p) => Math.abs(p.x - notaX) <= 8);
    const numeroRaw = notaTok ? notaTok.s : "";

    const clienteX = layout.left.cliente ?? 0;
    const clienteTokens = line.parts
      .filter((p) => p.x >= clienteX - 25 && p.x < cnpjX - 10)
      .map((p) => p.s);
    if (clienteTokens.length && /^\d+$/.test(clienteTokens[0])) clienteTokens.shift();
    const razaoSocial = clienteTokens.join(" ").trim();

    const obsX = layout.left.obs ?? 0;
    const obsText = line.parts
      .filter((p) => p.x >= obsX - 10 && !MONEY_RE.test(p.s))
      .map((p) => p.s)
      .join(" ")
      .trim();

    const issRetidoCol = pickMoney(line, layout, "issRetido") ?? 0;
    const valorISS = pickMoney(line, layout, "valorISS") ?? 0;
    const hasRetido = /RETIDO/i.test(obsText);
    const issRetido = issRetidoCol || (hasRetido ? valorISS : 0);

    notas.push({
      cnpjPrestador,
      numeroNota: normalizeNumeroNota(numeroRaw),
      valorNota,
      valorISS,
      issRetido,
      baseISS: pickMoney(line, layout, "baseISS") ?? valorNota,
      aliquota: pickMoney(line, layout, "aliquota") ?? 0,
      competencia: competenciaFrom(currentDateStr),
      data: parseBRDate(currentDateStr),
      razaoSocial,
      tipo: "entrada",
      origem: "dealernet",
      raw: {
        line: text,
        numeroRaw,
        deducoes: pickMoney(line, layout, "deducoes") ?? 0,
        observacao: obsText,
      },
    });
  }

  return {
    cnpjEmpresa,
    razaoEmpresa,
    inscMunicipal,
    periodoInicio,
    periodoFim,
    notas,
    totais,
  };
}

function extractMoneyTokens(tokens: string[]): number[] {
  const text = tokens.join(" ");
  const re = /-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/g;
  return (text.match(re) ?? []).map((m) => parseBRNumber(m));
}

function assignTotals(totais: TotaisPDF, line: RawLine, layout: Layout) {
  const v = pickMoney(line, layout, "valorNota");
  if (v != null) totais.valorNota = v;
  const d = pickMoney(line, layout, "deducoes");
  if (d != null) totais.deducoes = d;
  const b = pickMoney(line, layout, "baseISS");
  if (b != null) totais.baseISS = b;
  const i = pickMoney(line, layout, "valorISS");
  if (i != null) totais.valorISS = i;
  const r = pickMoney(line, layout, "issRetido");
  if (r != null) totais.issRetido = r;
}
