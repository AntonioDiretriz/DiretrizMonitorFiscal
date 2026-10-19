import type { ItemConciliado, NotaNormalizada, StatusMatch } from "./types";

const TOL = 0.02;

function nearlyEqual(a: number, b: number, tol = TOL): boolean {
  return Math.abs((a || 0) - (b || 0)) <= tol;
}

/**
 * No PDF Dealernet, quando há dedução/retenção, a coluna "Valor Nota" já vem
 * líquida (descontada), enquanto "Base ISS" preserva o valor bruto do serviço
 * — que é o mesmo conceito do "Vl. do Serv." do CSV da prefeitura.
 * Por isso comparamos p.valorNota × d.baseISS.
 */
function valorComparavel(d: NotaNormalizada): number {
  return d.baseISS || d.valorNota;
}

function computeAlertas(p: NotaNormalizada, d: NotaNormalizada): string[] {
  const alertas: string[] = [];
  // O CSV da prefeitura só traz "ISSQN Apurado" quando o ISS é devido/retido
  // pelo tomador; nas demais notas vem zerado. Só alertamos quando os dois
  // lados informam um valor, evitando alerta falso em toda nota.
  if (p.valorISS > 0 && d.valorISS > 0 && Math.abs(p.valorISS - d.valorISS) > TOL) {
    alertas.push(`Valor ISS difere: prefeitura ${p.valorISS.toFixed(2)} × dealernet ${d.valorISS.toFixed(2)}`);
  }
  if (Math.abs(p.issRetido - d.issRetido) > TOL) {
    alertas.push(`ISS Retido difere: prefeitura ${p.issRetido.toFixed(2)} × dealernet ${d.issRetido.toFixed(2)}`);
  }
  if (Math.abs(p.aliquota - d.aliquota) > 0.001 && p.aliquota && d.aliquota) {
    alertas.push(`Alíquota difere: ${p.aliquota}% × ${d.aliquota}%`);
  }
  if (/cancel/i.test(p.situacao ?? "")) {
    alertas.push(`Nota CANCELADA na prefeitura, presente no Dealernet`);
  }
  const pRetido = /retid/i.test(p.tipoRetencao ?? "") || p.issRetido > 0;
  const dRetido = d.issRetido > 0;
  if (pRetido !== dRetido) {
    alertas.push(`Retenção divergente: prefeitura ${pRetido ? "Retido" : "Não retido"} × dealernet ${dRetido ? "Retido" : "Não retido"}`);
  }
  return alertas;
}

export interface ReconcileResult {
  items: ItemConciliado[];
  counts: Record<StatusMatch, number> & { alertados: number };
}

export function reconcile(
  prefeitura: NotaNormalizada[],
  dealernet: NotaNormalizada[],
): ReconcileResult {
  const pPool = new Set<number>(prefeitura.map((_, i) => i));
  const dPool = new Set<number>(dealernet.map((_, i) => i));
  const items: ItemConciliado[] = [];

  // Pass 1: cnpj + valor(±0.02) + competencia
  for (const i of Array.from(pPool)) {
    const p = prefeitura[i];
    let match = -1;
    for (const j of dPool) {
      const d = dealernet[j];
      if (
        p.cnpjPrestador &&
        p.cnpjPrestador === d.cnpjPrestador &&
        nearlyEqual(p.valorNota, valorComparavel(d)) &&
        p.competencia === d.competencia
      ) {
        match = j;
        break;
      }
    }
    if (match >= 0) {
      const d = dealernet[match];
      const alertas = computeAlertas(p, d);
      items.push({
        key: `ok-${i}-${match}`,
        status: "MATCH_OK",
        alertas,
        prefeitura: p,
        dealernet: d,
      });
      pPool.delete(i);
      dPool.delete(match);
    }
  }

  // Pass 2: cnpj + valor(±0.02) mesmo com competência diferente
  for (const i of Array.from(pPool)) {
    const p = prefeitura[i];
    let match = -1;
    for (const j of dPool) {
      const d = dealernet[j];
      if (
        p.cnpjPrestador &&
        p.cnpjPrestador === d.cnpjPrestador &&
        nearlyEqual(p.valorNota, valorComparavel(d))
      ) {
        match = j;
        break;
      }
    }
    if (match >= 0) {
      const d = dealernet[match];
      const alertas = computeAlertas(p, d);
      alertas.unshift(`Competência divergente: prefeitura ${p.competencia} × dealernet ${d.competencia}`);
      items.push({
        key: `comp-${i}-${match}`,
        status: "MATCH_COMPETENCIA_DIVERGE",
        alertas,
        prefeitura: p,
        dealernet: d,
      });
      pPool.delete(i);
      dPool.delete(match);
    }
  }

  // Pass 3: cnpj iguais com diferença > 0.02
  for (const i of Array.from(pPool)) {
    const p = prefeitura[i];
    if (!p.cnpjPrestador) continue;
    const candIdxs: number[] = [];
    for (const j of dPool) {
      const d = dealernet[j];
      if (p.cnpjPrestador === d.cnpjPrestador) candIdxs.push(j);
    }
    if (candIdxs.length === 0) continue;
    if (candIdxs.length === 1) {
      const j = candIdxs[0];
      const d = dealernet[j];
      items.push({
        key: `valdiv-${i}-${j}`,
        status: "MATCH_VALOR_DIVERGE",
        alertas: [
          `Valor (Base ISS) difere: prefeitura ${p.valorNota.toFixed(2)} × dealernet ${valorComparavel(d).toFixed(2)}`,
          ...computeAlertas(p, d),
        ],
        prefeitura: p,
        dealernet: d,
      });
      pPool.delete(i);
      dPool.delete(j);
    } else {
      const candidatos = candIdxs.map((j) => dealernet[j]);
      // Escolhe o candidato de valor mais próximo para casar 1-para-1; os demais
      // continuam no pool e aparecem como "Só no Dealernet". Isso evita contar a
      // mesma nota duas vezes nos totais.
      let best = candIdxs[0];
      let bestDiff = Infinity;
      for (const j of candIdxs) {
        const diff = Math.abs(p.valorNota - valorComparavel(dealernet[j]));
        if (diff < bestDiff) {
          bestDiff = diff;
          best = j;
        }
      }
      const d = dealernet[best];
      items.push({
        key: `amb-${i}-${best}`,
        status: "AMBIGUO",
        alertas: [
          `Prestador tem ${candidatos.length} candidatos no Dealernet com valores divergentes`,
          `Valor (Base ISS) difere: prefeitura ${p.valorNota.toFixed(2)} × dealernet ${valorComparavel(d).toFixed(2)}`,
          ...computeAlertas(p, d),
        ],
        prefeitura: p,
        dealernet: d,
        candidatos,
      });
      pPool.delete(i);
      dPool.delete(best);
    }
  }

  // Sobras prefeitura
  for (const i of pPool) {
    const p = prefeitura[i];
    items.push({
      key: `pref-${i}`,
      status: "SO_NA_PREFEITURA",
      alertas: ["Lançamento ausente no Dealernet"],
      prefeitura: p,
    });
  }
  // Sobras dealernet
  for (const j of dPool) {
    const d = dealernet[j];
    items.push({
      key: `deal-${j}`,
      status: "SO_NO_DEALERNET",
      alertas: ["Nota não encontrada na prefeitura (verificar cancelamento/fora do município)"],
      dealernet: d,
    });
  }

  const counts = {
    MATCH_OK: 0,
    MATCH_COMPETENCIA_DIVERGE: 0,
    MATCH_VALOR_DIVERGE: 0,
    AMBIGUO: 0,
    SO_NA_PREFEITURA: 0,
    SO_NO_DEALERNET: 0,
    alertados: 0,
  };
  for (const it of items) {
    counts[it.status]++;
    if (it.status === "MATCH_OK" && it.alertas.length > 0) counts.alertados++;
  }
  return { items, counts };
}
