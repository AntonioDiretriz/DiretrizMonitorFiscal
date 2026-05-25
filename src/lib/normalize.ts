// Utilitários compartilhados de normalização
export function normalizeCpf(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  const digits = String(s).replace(/\D/g, "");
  return digits.padStart(11, "0").slice(-11);
}

export function normalizeName(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function parseBR(num: string | number | null | undefined): number {
  if (num === null || num === undefined || num === "") return 0;
  if (typeof num === "number") return num;
  const cleaned = String(num).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function fmtBR(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function approxEqual(a: number, b: number, tol = 0.05): boolean {
  return Math.abs((a || 0) - (b || 0)) <= tol;
}
