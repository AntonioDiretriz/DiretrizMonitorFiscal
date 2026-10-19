// Utilities: BR number/date parsing, formatting, digits-only helpers.

export const onlyDigits = (s: string | number | undefined | null): string =>
  String(s ?? "").replace(/\D+/g, "");

/** Parse Brazilian formatted number: "1.220,63" -> 1220.63. Accepts negatives. */
export function parseBRNumber(v: string | number | undefined | null): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (!s) return 0;
  const neg = /^-/.test(s) || /-$/.test(s);
  const cleaned = s.replace(/[^\d,.-]/g, "").replace(/-/g, "");
  // If both "," and "." present, "." is thousands and "," decimal.
  let numStr: string;
  if (cleaned.includes(",")) {
    numStr = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    // Could be "1234" or "1234.56" already
    numStr = cleaned;
  }
  const n = parseFloat(numStr);
  if (Number.isNaN(n)) return 0;
  return neg ? -n : n;
}

/** "dd/mm/aaaa" -> "AAAA-MM-DD"; passes through if empty. */
export function parseBRDate(v: string | undefined | null): string {
  if (!v) return "";
  const m = String(v).trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return "";
  const d = m[1].padStart(2, "0");
  const mo = m[2].padStart(2, "0");
  let y = m[3];
  if (y.length === 2) y = "20" + y;
  return `${y}-${mo}-${d}`;
}

const MONTH_ABBR: Record<string, string> = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};

export function competenciaFrom(v: string | undefined | null): string {
  if (!v) return "";
  const s = String(v).trim();
  // "MM/AAAA"
  let m = s.match(/^(\d{2})\/(\d{4})$/);
  if (m) return `${m[1]}/${m[2]}`;
  // "AAAA-MM..."
  m = s.match(/^(\d{4})-(\d{2})/);
  if (m) return `${m[2]}/${m[1]}`;
  // Portuguese abbreviation like "jun/26", "jun/2026", "jun 2026"
  m = s.match(/^([a-zç]{3})[\/\s\-.]+(\d{2,4})$/i);
  if (m) {
    const mm = MONTH_ABBR[m[1].toLowerCase().slice(0, 3)];
    let y = m[2];
    if (y.length === 2) y = "20" + y;
    if (mm) return `${mm}/${y}`;
  }
  // Full date "dd/mm/aaaa"
  const iso = parseBRDate(s);
  if (iso) return `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  return s;
}

/** Normalize invoice number: keep only digits, drop trailing ".x" and other punctuation. */
export function normalizeNumeroNota(v: string | undefined | null): string {
  if (!v) return "";
  // remove trailing ".n" suffix (Dealernet format like "1062026.1")
  let s = String(v).trim();
  s = s.replace(/\s+/g, "");
  s = s.replace(/\.\d+$/, "");
  return s.replace(/\D+/g, "");
}

export const fmtBRL = (n: number): string =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

export const fmtNumberBR = (n: number, digits = 2): string =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n || 0);

export function fmtISODateBR(iso: string): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
