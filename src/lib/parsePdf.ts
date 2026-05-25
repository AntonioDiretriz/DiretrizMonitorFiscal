import { normalizeCpf, normalizeName, parseBR } from "./normalize";

// Worker do pdf.js (carrega do CDN — evita configurar bundling do worker)
import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc as string;

export interface EmprestimoPdf {
  descricao: string;
  banco?: string;
  numeroContrato?: string;
  parcela: number;
}

export interface PdfFuncionario {
  matricula: string;
  nome: string;
  cpf: string;
  situacao?: string;
  comissao: number;        // verba 37
  gratificacao: number;    // verba 20
  gratificacaoNps: number; // verba 286 (NPS)
  premio: number;          // verba 219
  adiantPremio: number;    // verba 241
  salarioBase: number;     // verba 1 (SALARIO)
  valeTransporte: number;  // VT
  valeRefeicao: number;    // VR/VA
  planoSaude: number;      // plano de saúde
  outrosBeneficios: { descricao: string; valor: number }[];
  baseInss: number;
  valorFgts: number;
  emprestimos: number;    // soma de "DESC. EMP. CRED. TRAB" descontos
  emprestimosCount: number;
  emprestimosLista: EmprestimoPdf[];
  proventos: number;
  descontos: number;
  liquido: number;
}

export interface PdfParseResult {
  empresa?: string;
  cnpj?: string;
  competencia?: string;
  funcionarios: PdfFuncionario[];
}

interface RawLine { text: string; }

async function extractLines(file: ArrayBuffer): Promise<string[]> {
  const pdf = await pdfjsLib.getDocument({ data: file }).promise;
  const allLines: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    // Agrupa items por Y (linha visual)
    const items = tc.items as Array<{ str: string; transform: number[] }>;
    const map = new Map<number, Array<{ x: number; str: string }>>();
    for (const it of items) {
      if (!it.str) continue;
      const y = Math.round(it.transform[5]);
      const x = it.transform[4];
      if (!map.has(y)) map.set(y, []);
      map.get(y)!.push({ x, str: it.str });
    }
    const ys = [...map.keys()].sort((a, b) => b - a); // top→bottom
    for (const y of ys) {
      const parts = map.get(y)!.sort((a, b) => a.x - b.x);
      const line = parts.map((p) => p.str).join(" ").replace(/\s+/g, " ").trim();
      if (line) allLines.push(line);
    }
  }
  return allLines;
}

// Padrão de valor BR: 1.234.567,89 ou 89,00
const VALUE = /(\d{1,3}(?:\.\d{3})*,\d{2})/g;

// Verbas relevantes (código no início da linha)
const COD_COMISSAO = ["37"];
const COD_GRATIF = ["20"];
const COD_GRATIF_NPS = ["286"]; // GRATIFICACAO NPS (separada)
const COD_PREMIO = ["219"];
const COD_ADIANT_PREMIO = ["241"];

function parseEmpregadoHeader(line: string): { matricula: string; nome: string; cpf: string; situacao: string } | null {
  // "Empr.: 483ABNER LUCAS ... Situação: Trabalhando CPF:139.781.084-02 Adm: ..."
  const m = line.match(/Empr\.?:\s*(\d+)([A-ZÀ-Úa-zà-ú0-9 .'’\-]+?)\s*Situação:\s*([A-Za-zÀ-ú]+)\s*CPF\s*:?\s*([\d.\-]+)/);
  if (!m) return null;
  return {
    matricula: m[1].trim(),
    nome: normalizeName(m[2]),
    situacao: m[3].trim(),
    cpf: normalizeCpf(m[4]),
  };
}

// Extrai eventos da linha (proventos à esquerda + descontos à direita)
// Estratégia: localizar a verba pelo código + descrição alfabética, capturar o
// "segmento" da verba (até o próximo código de verba ou o fim do bloco) e dentro
// dele pegar o ÚLTIMO valor seguido de "P" — que corresponde ao valor lançado
// (ignorando colunas de Referência / Vl. Unitário que aparecem antes).
function tryExtractValueByCode(block: string, codes: string[]): number {
  let total = 0;
  for (const c of codes) {
    // Apenas a PRIMEIRA ocorrência do código no bloco do funcionário —
    // PDFs da Domínio repetem os códigos em seções de acumulados, o que
    // duplicaria os valores se somássemos todas as ocorrências.
    const startRe = new RegExp(`(?:^|\\s)${c}\\s*(?=[A-ZÀ-Úa-zà-ú])`);
    const m = startRe.exec(block);
    if (!m) continue;
    const startIdx = m.index + m[0].length;
    const rest = block.slice(startIdx);
    const nextCodeMatch = rest.match(/\s\d{1,4}\s*(?=[A-ZÀ-Úa-zà-ú])/);
    const segment = nextCodeMatch ? rest.slice(0, nextCodeMatch.index) : rest;
    const valMatches = [...segment.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*P\b/g)];
    if (valMatches.length > 0) {
      total += parseBR(valMatches[valMatches.length - 1][1]);
    }
  }
  return total;
}

function parseTotaisLine(line: string): { proventos: number; descontos: number; informativa: number; liquido: number } | null {
  // "ND: 1 Proventos: 2.239,72 Descontos: 1.558,73 Informativa: 156,00 Informativa Dedutora: 0 Líquido: 680,99"
  const prov = line.match(/Proventos:\s*(\d{1,3}(?:\.\d{3})*,\d{2})/);
  const desc = line.match(/Descontos:\s*(\d{1,3}(?:\.\d{3})*,\d{2})/);
  const info = line.match(/Informativa:\s*(\d{1,3}(?:\.\d{3})*,\d{2})/);
  const liq = line.match(/Líquido:\s*(\d{1,3}(?:\.\d{3})*,\d{2})/);
  if (!prov || !desc) return null;
  return {
    proventos: parseBR(prov[1]),
    descontos: parseBR(desc[1]),
    informativa: info ? parseBR(info[1]) : 0,
    liquido: liq ? parseBR(liq[1]) : 0,
  };
}

function parseBasesLine(line: string): { baseInss: number; valorFgts: number } | null {
  // "NF: 1 Base INSS: 1.950,00Excedente INSS: 0,00 Base FGTS: 1.950,00 Valor FGTS: 156,00 Base IRRF: 1.342,80"
  const bi = line.match(/Base\s+INSS:\s*(\d{1,3}(?:\.\d{3})*,\d{2})/);
  const vf = line.match(/Valor\s+FGTS:\s*(\d{1,3}(?:\.\d{3})*,\d{2})/);
  if (!bi && !vf) return null;
  return {
    baseInss: bi ? parseBR(bi[1]) : 0,
    valorFgts: vf ? parseBR(vf[1]) : 0,
  };
}

export async function parseDominioPdf(buf: ArrayBuffer): Promise<PdfParseResult> {
  const lines = await extractLines(buf);

  let empresa: string | undefined;
  let cnpj: string | undefined;
  let competencia: string | undefined;

  // Cabeçalho
  for (const l of lines.slice(0, 30)) {
    const e = l.match(/Empresa:\s*\d+\s*-\s*(.+?)\s*Página/);
    if (e) empresa = e[1].trim();
    const c = l.match(/CNPJ:\s*([\d.\/-]+)/);
    if (c) cnpj = c[1].trim();
    const cp = l.match(/Compet[êe]ncia:\s*([0-9\/]+)/);
    if (cp) competencia = cp[1].trim();
  }

  const funcionarios: PdfFuncionario[] = [];
  let current: PdfFuncionario | null = null;
  let aggregateLines: string[] = [];

  const flushCurrent = () => {
    if (!current) return;
    const block = aggregateLines.join(" \n ");
    current.comissao = tryExtractValueByCode(block, COD_COMISSAO);
    current.gratificacao = tryExtractValueByCode(block, COD_GRATIF);
    current.gratificacaoNps = tryExtractValueByCode(block, COD_GRATIF_NPS);
    current.premio = tryExtractValueByCode(block, COD_PREMIO);
    current.adiantPremio = tryExtractValueByCode(block, COD_ADIANT_PREMIO);
    // Salário-base (verba 1)
    current.salarioBase = tryExtractValueByCode(block, ["1"]);
    // Benefícios — busca por palavras-chave em descontos (D) e proventos (P)
    const findByKeywords = (kws: RegExp): number => {
      let total = 0;
      for (const ln of aggregateLines) {
        if (kws.test(ln)) {
          const nums = [...ln.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})/g)];
          if (nums.length > 0) total += parseBR(nums[nums.length - 1][1]);
        }
      }
      return total;
    };
    current.valeTransporte = findByKeywords(/VALE\s*TRANSP|\bVT\b/i);
    current.valeRefeicao = findByKeywords(/VALE\s*(REFEI|ALIMENT)|\bVR\b|\bVA\b/i);
    current.planoSaude = findByKeywords(/PLANO\s*SA[ÚU]DE|ASSIST[ÊE]NCIA\s*M[ÉE]DICA|UNIMED|AMIL/i);

    // Empréstimos descontados — deduplica por linha (Domínio repete bloco em outra página)
    const seenEmp = new Set<string>();
    const empLinhas = aggregateLines.filter((ln) => /DESC\.?\s*EMP\.?\s*CRED\.?\s*TRAB/i.test(ln))
      .filter((ln) => {
        const k = ln.replace(/\s+/g, " ").trim();
        if (seenEmp.has(k)) return false;
        seenEmp.add(k);
        return true;
      });
    current.emprestimosLista = empLinhas.map((ln) => {
      const nums = [...ln.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})/g)];
      const parcela = nums.length > 0 ? parseBR(nums[nums.length - 1][1]) : 0;
      const bancoMatch = ln.match(/(BANCO\s+[A-Z\s]+|BMG|ITAU|ITA[ÚU]|BRADESCO|SANTANDER|CAIXA|BB|BANRISUL|PAN|SAFRA|DAYCOVAL|FACTA|OLE|MERCANTIL)/i);
      const contratoMatch = ln.match(/(\d{6,})/);
      return {
        descricao: ln.replace(/\s+/g, " ").slice(0, 120),
        banco: bancoMatch?.[1]?.trim(),
        numeroContrato: contratoMatch?.[1],
        parcela,
      };
    });
    current.emprestimos = current.emprestimosLista.reduce((a, e) => a + e.parcela, 0);
    current.emprestimosCount = current.emprestimosLista.length;
    funcionarios.push(current);
    current = null;
    aggregateLines = [];
  };

  for (const line of lines) {
    const head = parseEmpregadoHeader(line);
    if (head) {
      flushCurrent();
      current = {
        matricula: head.matricula,
        nome: head.nome,
        cpf: head.cpf,
        situacao: head.situacao,
        comissao: 0, gratificacao: 0, gratificacaoNps: 0, premio: 0, adiantPremio: 0,
        salarioBase: 0, valeTransporte: 0, valeRefeicao: 0, planoSaude: 0, outrosBeneficios: [],
        baseInss: 0, valorFgts: 0, emprestimos: 0, emprestimosCount: 0, emprestimosLista: [],
        proventos: 0, descontos: 0, liquido: 0,
      };
      aggregateLines.push(line);
      continue;
    }
    // Encerra o bloco corrente quando começa a seção de totais/resumo do PDF —
    // evita que linhas como "Resumo por Rubrica" sejam atribuídas ao último funcionário.
    if (/Total Geral Proventos|Resumo por Rubrica|L[íi]quido Geral:/i.test(line)) {
      flushCurrent();
      current = null;
      continue;
    }
    if (!current) continue;
    aggregateLines.push(line);

    const tot = parseTotaisLine(line);
    if (tot) {
      current.proventos = tot.proventos;
      current.descontos = tot.descontos;
      current.liquido = tot.liquido;
    }
    const bases = parseBasesLine(line);
    if (bases) {
      current.baseInss = bases.baseInss;
      current.valorFgts = bases.valorFgts;
    }
  }
  flushCurrent();

  return { empresa, cnpj, competencia, funcionarios };
}
