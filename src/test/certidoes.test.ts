import { describe, it, expect } from "vitest";
import { differenceInDays, parseISO } from "date-fns";

// Mirrors the production logic in Certidoes.tsx
function getDiasRestantes(dataValidade: string | null): number | null {
  if (!dataValidade) return null;
  return differenceInDays(parseISO(dataValidade), new Date());
}

// Mirrors the trigger logic in the SQL migration and auto_update_certidao_status()
function computeStatus(dataValidade: string | null): "regular" | "vencendo" | "irregular" {
  if (!dataValidade) return "regular";
  const dias = differenceInDays(parseISO(dataValidade), new Date());
  if (dias < 0) return "irregular";
  if (dias <= 30) return "vencendo";
  return "regular";
}

function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}

describe("getDiasRestantes", () => {
  it("returns null for null input", () => {
    expect(getDiasRestantes(null)).toBeNull();
  });

  it("returns 0 for today's date", () => {
    expect(getDiasRestantes(fmt(new Date()))).toBe(0);
  });

  it("returns positive number for future dates", () => {
    const future = new Date();
    future.setDate(future.getDate() + 10);
    expect(getDiasRestantes(fmt(future))).toBe(10);
  });

  it("returns negative number for past dates", () => {
    const past = new Date();
    past.setDate(past.getDate() - 5);
    expect(getDiasRestantes(fmt(past))).toBe(-5);
  });

  it("returns exactly 30 for 30 days ahead", () => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    expect(getDiasRestantes(fmt(d))).toBe(30);
  });
});

describe("computeStatus (auto_update_certidao_status logic)", () => {
  it("returns 'regular' when no date is set", () => {
    expect(computeStatus(null)).toBe("regular");
  });

  it("returns 'irregular' for expired certidões (past date)", () => {
    const past = new Date();
    past.setDate(past.getDate() - 1);
    expect(computeStatus(fmt(past))).toBe("irregular");
  });

  it("returns 'irregular' for dates far in the past", () => {
    expect(computeStatus("2020-01-01")).toBe("irregular");
  });

  it("returns 'vencendo' for today (0 days remaining)", () => {
    expect(computeStatus(fmt(new Date()))).toBe("vencendo");
  });

  it("returns 'vencendo' for 1 day remaining", () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    expect(computeStatus(fmt(d))).toBe("vencendo");
  });

  it("returns 'vencendo' for exactly 30 days remaining", () => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    expect(computeStatus(fmt(d))).toBe("vencendo");
  });

  it("returns 'regular' for 31 days remaining", () => {
    const d = new Date();
    d.setDate(d.getDate() + 31);
    expect(computeStatus(fmt(d))).toBe("regular");
  });

  it("returns 'regular' for dates far in the future", () => {
    expect(computeStatus("2099-12-31")).toBe("regular");
  });
});

describe("getDiasRestantes display logic", () => {
  it("shows 'Vencida' label condition when dias <= 0", () => {
    const past = new Date();
    past.setDate(past.getDate() - 3);
    const dias = getDiasRestantes(fmt(past));
    expect(dias).not.toBeNull();
    expect(dias! <= 0).toBe(true);
  });

  it("shows warning color condition when dias <= 10", () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 7);
    const dias = getDiasRestantes(fmt(soon));
    expect(dias).not.toBeNull();
    expect(dias! <= 10).toBe(true);
    expect(dias! > 0).toBe(true);
  });

  it("shows normal color condition when dias > 10", () => {
    const far = new Date();
    far.setDate(far.getDate() + 60);
    const dias = getDiasRestantes(fmt(far));
    expect(dias).not.toBeNull();
    expect(dias! > 10).toBe(true);
  });
});
