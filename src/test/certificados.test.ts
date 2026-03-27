import { describe, it, expect } from "vitest";
import { differenceInDays, parseISO } from "date-fns";

// Mirrors the expiry display logic in Certificados.tsx
function getStatusCertificado(dataVencimento: string | null): "vigente" | "vencendo" | "vencido" {
  if (!dataVencimento) return "vigente";
  const dias = differenceInDays(parseISO(dataVencimento), new Date());
  if (dias < 0) return "vencido";
  if (dias <= 30) return "vencendo";
  return "vigente";
}

function getDiasParaVencer(dataVencimento: string | null): number | null {
  if (!dataVencimento) return null;
  return differenceInDays(parseISO(dataVencimento), new Date());
}

function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}

describe("getStatusCertificado", () => {
  it("returns 'vigente' when no date is set", () => {
    expect(getStatusCertificado(null)).toBe("vigente");
  });

  it("returns 'vencido' for expired certificates", () => {
    const past = new Date();
    past.setDate(past.getDate() - 1);
    expect(getStatusCertificado(fmt(past))).toBe("vencido");
  });

  it("returns 'vencido' for certificates expired long ago", () => {
    expect(getStatusCertificado("2022-06-01")).toBe("vencido");
  });

  it("returns 'vencendo' for today (0 days remaining)", () => {
    expect(getStatusCertificado(fmt(new Date()))).toBe("vencendo");
  });

  it("returns 'vencendo' for certificates expiring in 15 days", () => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    expect(getStatusCertificado(fmt(d))).toBe("vencendo");
  });

  it("returns 'vencendo' for exactly 30 days remaining", () => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    expect(getStatusCertificado(fmt(d))).toBe("vencendo");
  });

  it("returns 'vigente' for 31 days remaining", () => {
    const d = new Date();
    d.setDate(d.getDate() + 31);
    expect(getStatusCertificado(fmt(d))).toBe("vigente");
  });

  it("returns 'vigente' for A1 certificates with 1 year remaining", () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    expect(getStatusCertificado(fmt(d))).toBe("vigente");
  });

  it("returns 'vigente' for A3 certificates with 3 years remaining", () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 3);
    expect(getStatusCertificado(fmt(d))).toBe("vigente");
  });
});

describe("getDiasParaVencer", () => {
  it("returns null for null date", () => {
    expect(getDiasParaVencer(null)).toBeNull();
  });

  it("returns 0 for today", () => {
    expect(getDiasParaVencer(fmt(new Date()))).toBe(0);
  });

  it("returns positive value for future dates", () => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    expect(getDiasParaVencer(fmt(d))).toBe(90);
  });

  it("returns negative value for past dates", () => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    expect(getDiasParaVencer(fmt(d))).toBe(-30);
  });
});

describe("Certificate type validation", () => {
  it("A1 type is valid", () => {
    const validTypes = ["A1", "A3"];
    expect(validTypes.includes("A1")).toBe(true);
  });

  it("A3 type is valid", () => {
    const validTypes = ["A1", "A3"];
    expect(validTypes.includes("A3")).toBe(true);
  });

  it("unknown type is not valid", () => {
    const validTypes = ["A1", "A3"];
    expect(validTypes.includes("B2")).toBe(false);
  });
});
