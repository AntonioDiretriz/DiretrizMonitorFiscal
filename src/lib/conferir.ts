import { normalizeName } from "./normalize";
import type { PdfFuncionario, PdfParseResult } from "./parsePdf";
import type { PlanilhaParseResult, EsocialContrato } from "./parseXls";

export type Status = "ok" | "divergente" | "so_pdf" | "so_planilha";

export interface ConferenciaItem {
  cpf: string;
  matricula: string;
  nome: string;
  setor: string;
  arquivoPlan: string;
  // PDF
  comissaoPdf: number;
  gratificacaoPdf: number;
  gratificacaoNpsPdf: number;
  premioPdf: number;
  adiantPremioPdf: number;
  baseInss: number;
  valorFgts: number;
  emprestimosPdf: number;
  emprestimosLista: { descricao: string; banco?: string; numeroContrato?: string; parcela: number }[];
  // Benefícios PDF
  salarioBase: number;
  valeTransporte: number;
  valeRefeicao: number;
  planoSaude: number;
  // Planilhas
  comissaoPlan: number;
  gratificacaoPlan: number;
  gratificacaoNpsPlan: number;
  premioPlan: number;
  adiantPremioPlan: number;
  // eSocial
  emprestimosEsocialQtd: number;
  bancosEsocial: string[];
  // Apuração
  status: Status;
  divergencias: string[];
}

export interface AvisoPlanilha {
  arquivo: string;
  setor: string;
  tipo: "competencia_diferente" | "cnpj_diferente";
  detalhe: string;
}

export interface ConferenciaResult {
  empresa?: string;
  cnpj?: string;
  competencia?: string;
  itens: ConferenciaItem[];
  avisos: AvisoPlanilha[];
  totais: {
    funcionarios: number;
    divergentes: number;
    aLancar: number;
    comissaoPdf: number;
    comissaoPlan: number;
    gratificacaoPdf: number;
    gratificacaoPlan: number;
    gratificacaoNpsPdf: number;
    gratificacaoNpsPlan: number;
  };
}

const TOL = 0.05;

function nomesCompativeis(a: string, b: string) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (!na.startsWith(nb) && !nb.startsWith(na)) return false;
  const ta = na.split(" ");
  const tb = nb.split(" ");
  return Math.min(ta.length, tb.length) >= 3 && ta.slice(0, 3).join(" ") === tb.slice(0, 3).join(" ");
}

export function conferir(
  pdf: PdfParseResult,
  planilhas: PlanilhaParseResult[],
  esocial: EsocialContrato[],
): ConferenciaResult {
  const planByMat = new Map<string, { entry: PlanilhaParseResult["funcionarios"][number]; setor: string; arquivo: string }>();
  const planByName = new Map<string, { entry: PlanilhaParseResult["funcionarios"][number]; setor: string; arquivo: string }>();
  for (const p of planilhas) {
    for (const f of p.funcionarios) {
      if (f.matricula) planByMat.set(`mat:${f.matricula}`, { entry: f, setor: p.setor, arquivo: p.arquivo });
      planByName.set(`nome:${f.nome}`, { entry: f, setor: p.setor, arquivo: p.arquivo });
    }
  }

  const esocialByCpf = new Map<string, EsocialContrato[]>();
  for (const e of esocial) {
    const k = e.cpf;
    if (!k) continue;
    if (!esocialByCpf.has(k)) esocialByCpf.set(k, []);
    esocialByCpf.get(k)!.push(e);
  }

  const usedPlan = new Set<string>();
  const itens: ConferenciaItem[] = [];

  for (const f of pdf.funcionarios) {
    const matchPlan =
      (f.matricula && planByMat.get(`mat:${f.matricula}`)) ||
      planByName.get(`nome:${f.nome}`) ||
      [...planByName.values()].find(({ entry }) => nomesCompativeis(entry.nome, f.nome));
    const planEntry = matchPlan?.entry;
    if (matchPlan) {
      usedPlan.add(`mat:${matchPlan.entry.matricula}|${matchPlan.entry.nome}`);
    }
    const esContratos = esocialByCpf.get(f.cpf) ?? [];

    // PDF: gratificacao 20 = "f.gratificacao"; NPS 286 separa? Atualmente parsePdf coloca os dois juntos.
    // Para manter compatível, assumimos que f.gratificacao = 20+286 do PDF; comparamos em conjunto.
    // Ajuste real: se o parsePdf futuramente separar, basta preencher abaixo.
    const item: ConferenciaItem = {
      cpf: f.cpf,
      matricula: f.matricula,
      nome: f.nome,
      setor: matchPlan?.setor ?? "",
      arquivoPlan: matchPlan?.arquivo ?? "",
      comissaoPdf: f.comissao,
      gratificacaoPdf: f.gratificacao,
      gratificacaoNpsPdf: (f as any).gratificacaoNps ?? 0,
      premioPdf: f.premio,
      adiantPremioPdf: f.adiantPremio,
      baseInss: f.baseInss,
      valorFgts: f.valorFgts,
      emprestimosPdf: f.emprestimos,
      emprestimosLista: (f as any).emprestimosLista ?? [],
      salarioBase: (f as any).salarioBase ?? 0,
      valeTransporte: (f as any).valeTransporte ?? 0,
      valeRefeicao: (f as any).valeRefeicao ?? 0,
      planoSaude: (f as any).planoSaude ?? 0,
      comissaoPlan: planEntry?.comissao ?? 0,
      gratificacaoPlan: planEntry?.gratificacao ?? 0,
      gratificacaoNpsPlan: planEntry?.gratificacaoNps ?? 0,
      premioPlan: planEntry?.premio ?? 0,
      adiantPremioPlan: planEntry?.adiantPremio ?? 0,
      emprestimosEsocialQtd: esContratos.length,
      bancosEsocial: esContratos.map((c) => c.banco),
      status: "ok",
      divergencias: [],
    };

    // A folha do PDF já vem validada — comparamos as verbas variáveis com as planilhas
    // para detectar divergências de lançamento. Empréstimos do eSocial seguem como
    // dado a ADICIONAR (sem alarme), tratado fora deste bloco.
    const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const cmp = (label: string, pdf: number, plan: number) => {
      const dif = pdf - plan;
      if (Math.abs(dif) <= TOL) return;
      if (pdf === 0 && plan > 0) {
        item.divergencias.push(`${label}: falta lançar no PDF (planilha ${fmt(plan)})`);
      } else if (plan === 0 && pdf > 0) {
        item.divergencias.push(`${label}: não consta na planilha (PDF ${fmt(pdf)})`);
      } else {
        item.divergencias.push(`${label}: PDF ${fmt(pdf)} × Planilha ${fmt(plan)} (dif ${fmt(dif)})`);
      }
    };

    if (planEntry) {
      cmp("Comissão (37)", item.comissaoPdf, item.comissaoPlan);
      cmp("Gratificação (20)", item.gratificacaoPdf, item.gratificacaoPlan);
      cmp("Gratificação NPS (286)", item.gratificacaoNpsPdf, item.gratificacaoNpsPlan);
      cmp("Prêmio (219)", item.premioPdf, item.premioPlan);
      cmp("Adiant. Prêmio (241)", item.adiantPremioPdf, item.adiantPremioPlan);
    }

    if (item.divergencias.length > 0 && item.status === "ok") item.status = "divergente";
    itens.push(item);
  }

  // Funcionários SÓ na planilha
  for (const p of planilhas) {
    for (const f of p.funcionarios) {
      const k = `mat:${f.matricula}|${f.nome}`;
      if (usedPlan.has(k)) continue;
      itens.push({
        cpf: "",
        matricula: f.matricula,
        nome: f.nome,
        setor: p.setor,
        arquivoPlan: p.arquivo,
        comissaoPdf: 0, gratificacaoPdf: 0, gratificacaoNpsPdf: 0, premioPdf: 0, adiantPremioPdf: 0,
        baseInss: 0, valorFgts: 0, emprestimosPdf: 0, emprestimosLista: [],
        salarioBase: 0, valeTransporte: 0, valeRefeicao: 0, planoSaude: 0,
        comissaoPlan: f.comissao,
        gratificacaoPlan: f.gratificacao,
        gratificacaoNpsPlan: f.gratificacaoNps,
        premioPlan: f.premio,
        adiantPremioPlan: f.adiantPremio,
        emprestimosEsocialQtd: 0,
        bancosEsocial: [],
        status: "so_planilha",
        divergencias: [],
      });
    }
  }

  // Avisos: planilhas com competência diferente do PDF (ainda assim incluídas)
  const avisos: AvisoPlanilha[] = [];
  if (pdf.competencia) {
    for (const p of planilhas) {
      if (p.competencia && p.competencia !== pdf.competencia) {
        avisos.push({
          arquivo: p.arquivo,
          setor: p.setor,
          tipo: "competencia_diferente",
          detalhe: `Planilha ${p.arquivo} (${p.setor}) está em ${p.competencia}, mas o PDF é ${pdf.competencia}.`,
        });
      }
    }
  }
  if (pdf.cnpj) {
    for (const p of planilhas) {
      if (p.cnpj && p.cnpj !== pdf.cnpj) {
        avisos.push({
          arquivo: p.arquivo,
          setor: p.setor,
          tipo: "cnpj_diferente",
          detalhe: `Planilha ${p.arquivo} (${p.setor}${p.unidade ? ` — ${p.unidade}` : ""}) tem CNPJ ${p.cnpj}, diferente do PDF (${pdf.cnpj}).`,
        });
      }
    }
  }

  const totais = itens.reduce(
    (acc, i) => {
      acc.funcionarios += 1;
      if (i.status === "divergente") acc.divergentes += 1;
      if (i.status === "so_planilha") acc.aLancar += 1;
      acc.comissaoPdf += i.comissaoPdf;
      acc.comissaoPlan += i.comissaoPlan;
      acc.gratificacaoPdf += i.gratificacaoPdf;
      acc.gratificacaoPlan += i.gratificacaoPlan;
      acc.gratificacaoNpsPdf += i.gratificacaoNpsPdf;
      acc.gratificacaoNpsPlan += i.gratificacaoNpsPlan;
      return acc;
    },
    {
      funcionarios: 0, divergentes: 0, aLancar: 0,
      comissaoPdf: 0, comissaoPlan: 0,
      gratificacaoPdf: 0, gratificacaoPlan: 0,
      gratificacaoNpsPdf: 0, gratificacaoNpsPlan: 0,
    }
  );

  return {
    empresa: pdf.empresa,
    cnpj: pdf.cnpj,
    competencia: pdf.competencia,
    itens,
    avisos,
    totais,
  };
}
