import { describe, it, expect } from "vitest";

// Copy of the production function to test it in isolation
function validateCNPJ(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  const calc = (d: string, weights: number[]) =>
    weights.reduce((sum, w, i) => sum + Number(d[i]) * w, 0);
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const r1 = calc(digits, w1) % 11;
  const d1 = r1 < 2 ? 0 : 11 - r1;
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const r2 = calc(digits, w2) % 11;
  const d2 = r2 < 2 ? 0 : 11 - r2;
  return Number(digits[12]) === d1 && Number(digits[13]) === d2;
}

function formatCNPJ(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

describe("validateCNPJ", () => {
  it("accepts a valid CNPJ", () => {
    expect(validateCNPJ("11.222.333/0001-81")).toBe(true);
  });

  it("accepts a valid CNPJ without formatting", () => {
    expect(validateCNPJ("11222333000181")).toBe(true);
  });

  it("rejects all-same-digit sequences", () => {
    expect(validateCNPJ("11111111111111")).toBe(false);
    expect(validateCNPJ("00000000000000")).toBe(false);
    expect(validateCNPJ("99999999999999")).toBe(false);
  });

  it("rejects CNPJ with wrong check digits", () => {
    expect(validateCNPJ("11222333000100")).toBe(false);
    expect(validateCNPJ("11222333000199")).toBe(false);
  });

  it("rejects CNPJ shorter than 14 digits", () => {
    expect(validateCNPJ("1122233300018")).toBe(false);
    expect(validateCNPJ("")).toBe(false);
  });

  it("rejects CNPJ longer than 14 digits (extra chars ignored, check still fails)", () => {
    // After stripping non-digits we'd have 15 digits → length check fails
    expect(validateCNPJ("112223330001810")).toBe(false);
  });
});

describe("formatCNPJ", () => {
  it("formats a 14-digit string correctly", () => {
    expect(formatCNPJ("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("handles partial input gracefully", () => {
    expect(formatCNPJ("11")).toBe("11");
    expect(formatCNPJ("11222")).toBe("11.222");
    expect(formatCNPJ("11222333")).toBe("11.222.333");
    expect(formatCNPJ("112223330001")).toBe("11.222.333/0001");
  });

  it("strips non-numeric characters before formatting", () => {
    expect(formatCNPJ("11.222.333/0001-81")).toBe("11.222.333/0001-81");
  });
});
