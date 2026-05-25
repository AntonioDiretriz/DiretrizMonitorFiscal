import * as XLSX from "xlsx";
import { normalizeCpf, normalizeName, parseBR } from "./normalize";

export interface PlanilhaFuncionario {
  setor: string;
  matricula: string;
  nome: string;
  comissao: number;        // verba 37
  gratificacao: number;    // verba 20
  gratificacaoNps: number; // verba 286 (apenas em alguns setores)
  premio: number;          // verba 219
  adiantPremio: number;    // verba 241
}

export interface PlanilhaParseResult {
  setor: string;
  arquivo: string;          // nome do arquivo de origem
  empresa?: string;
  cnpj?: string;            // CNPJ desta planilha (pode diferir entre filiais)
  unidade?: string;         // ex: "FILIAL NATAL/RN"
  competencia?: string;     // MM/AAAA
  funcionarios: PlanilhaFuncionario[];
}

type FieldKey = "comissao" | "gratificacao" | "gratificacaoNps" | "premio" | "adiantPremio";

// Mapeia rótulo de coluna → campo. ORDEM IMPORTA: NPS antes de "GRATIFICA" comum.
const COL_MAP: Array<{ rx: RegExp; key: FieldKey }> = [
  { rx: /COMISS/i, key: "comissao" },
  { rx: /GRATIFICA[CÇ][AÃ]O\s*NPS/i, key: "gratificacaoNps" },
  { rx: /^GRATIFICA/i, key: "gratificacao" },
  { rx: /ADIANTAMENTO\s*PR[EÊ]MIO/i, key: "adiantPremio" },
  { rx: /^PR[EÊ]MIO/i, key: "premio" },
];

// Códigos de verba na linha logo abaixo do cabeçalho (ex: 37, 20, 286, 219, 241)
const VERBA_MAP: Record<string, FieldKey> = {
  "37": "comissao",
  "20": "gratificacao",
  "286": "gratificacaoNps",
  "219": "premio",
  "241": "adiantPremio",
};

function detectColumns(headerRow: any[], verbaRow: any[]): Record<number, FieldKey> {
  const out: Record<number, FieldKey> = {};
  // 1) Por rótulo
  for (let i = 0; i < headerRow.length; i++) {
    const v = String(headerRow[i] ?? "").trim();
    if (!v) continue;
    for (const m of COL_MAP) {
      if (m.rx.test(v)) {
        out[i] = m.key;
        break;
      }
    }
  }
  // 2) Reforço pela linha de códigos de verba (mais confiável)
  for (let i = 0; i < verbaRow.length; i++) {
    const raw = verbaRow[i];
    if (raw === "" || raw === null || raw === undefined) continue;
    const code = String(Math.trunc(Number(raw) || 0));
    if (VERBA_MAP[code]) out[i] = VERBA_MAP[code];
  }
  return out;
}

function excelSerialToMMYYYY(serial: number): string | undefined {
  const d = XLSX.SSF.parse_date_code(serial);
  if (!d) return undefined;
  return `${String(d.m).padStart(2, "0")}/${d.y}`;
}

function parseSheet(
  wb: XLSX.WorkBook,
  sheetName: string,
  arquivo: string,
): PlanilhaParseResult | null {
  const ws = wb.Sheets[sheetName];
  if (!ws) return null;
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
  if (rows.length < 5) return null;

  const firstCells = rows.slice(0, 3).map((r) => String(r[0] ?? "")).join(" ").toUpperCase();
  if (!firstCells.includes("RELAÇÃO DE VALORES") && !firstCells.includes("RELACAO DE VALORES")) {
    return null;
  }

  let empresa: string | undefined;
  let cnpj: string | undefined;
  let unidade: string | undefined;
  let competencia: string | undefined;
  let headerRowIdx = -1;

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i].map((c) => String(c ?? "").trim());
    const joined = row.join("|").toUpperCase();
    if (joined.includes("RAZÃO SOCIAL") || joined.includes("RAZAO SOCIAL")) {
      empresa = row[2] || row[1] || empresa;
    }
    if (joined.includes("CNPJ")) {
      const v = row[2] || row[1];
      if (v) cnpj = String(v).replace(/\D/g, "").slice(0, 14);
    }
    if (joined.includes("UNIDADE")) {
      unidade = row[2] || row[1] || unidade;
    }
    if (joined.includes("COMPETENCIA") || joined.includes("COMPETÊNCIA")) {
      const raw = rows[i][2] ?? rows[i][1];
      if (typeof raw === "number") {
        competencia = excelSerialToMMYYYY(raw);
      } else if (raw) {
        competencia = String(raw);
      }
    }
    // Header tem "COMISS" ou "GRATIFICA"
    if (joined.includes("COMISS") || joined.includes("GRATIFICA")) {
      headerRowIdx = i;
    }
  }

  if (headerRowIdx === -1) return null;

  // Linha imediatamente abaixo do cabeçalho costuma trazer os códigos de verba
  const verbaRow = rows[headerRowIdx + 1] ?? [];
  const colMap = detectColumns(rows[headerRowIdx], verbaRow);
  if (Object.keys(colMap).length === 0) return null;

  // Detecta colunas de código (matrícula) e nome
  let colCodigo = 1;
  let colNome = 2;
  const headerStr = rows[headerRowIdx].map((c) => String(c ?? "").toUpperCase());
  headerStr.forEach((h, idx) => {
    if (/COD|FOLHA/.test(h) && idx <= 2) colCodigo = idx;
    if (/NOME|COLABORADOR/.test(h) && idx <= 3) colNome = idx;
  });

  // Setor "real" = nome da sheet (ex: "VEIC NOVOS_", "ASSIST TEC_CDN", "ADM")
  const setor = sheetName.replace(/_+$/, "").trim();

  const funcionarios: PlanilhaFuncionario[] = [];
  // Dados começam 2 linhas após o header (header + linha de códigos de verba)
  for (let i = headerRowIdx + 2; i < rows.length; i++) {
    const r = rows[i];
    const codigoRaw = r[colCodigo];
    const nomeRaw = r[colNome];
    const tipoCalc = String(r[0] ?? "").trim().toUpperCase();

    // Ignora linhas de TOTAL / SUBTOTAL
    if (tipoCalc === "TOTAL" || tipoCalc === "SUBTOTAL") continue;
    if (!nomeRaw || String(nomeRaw).trim() === "") continue;
    const nomeStr = String(nomeRaw).trim();
    if (/^COLABORADOR(ES)?$/i.test(nomeStr)) continue;

    const matricula =
      codigoRaw !== "" && codigoRaw !== null && codigoRaw !== undefined
        ? String(Math.trunc(Number(codigoRaw) || 0) || codigoRaw).trim()
        : "";

    const f: PlanilhaFuncionario = {
      setor,
      matricula,
      nome: normalizeName(nomeStr),
      comissao: 0,
      gratificacao: 0,
      gratificacaoNps: 0,
      premio: 0,
      adiantPremio: 0,
    };
    for (const [colIdxStr, key] of Object.entries(colMap)) {
      const colIdx = Number(colIdxStr);
      const v = r[colIdx];
      const n = parseBR(v as any);
      f[key] = (f[key] as number) + n;
    }
    if (!f.nome) continue;
    funcionarios.push(f);
  }
  return { setor, arquivo, empresa, cnpj, unidade, competencia, funcionarios };
}

export async function parseFolhaXls(file: File): Promise<PlanilhaParseResult[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false });

  const results: PlanilhaParseResult[] = [];
  for (const sn of wb.SheetNames) {
    const r = parseSheet(wb, sn, file.name);
    if (r && r.funcionarios.length > 0) results.push(r);
  }
  return results;
}

// === Excel do gov (eSocial) — empréstimos consignados ===
export interface EsocialContrato {
  cpf: string;
  matricula: string;
  nome: string;
  banco: string;
  contrato: string;
  cnpjEmpregador: string;
}

export async function parseEsocialXlsx(file: File): Promise<EsocialContrato[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (rows.length < 2) return [];
  const header = rows[0].map((c) => String(c ?? "").toLowerCase());
  const idx = (key: string) => header.findIndex((h) => h.includes(key));
  const iCpf = idx("cpf");
  const iMat = idx("matricula");
  const iNome = idx("nometrabalhador");
  const iBanco = idx("ifconcessora.descricao");
  const iContrato = idx("contrato");
  const iCnpjEmp = idx("numeroinscricaoempregador");

  const out: EsocialContrato[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => c === "" || c === null || c === undefined)) continue;
    out.push({
      cpf: normalizeCpf(r[iCpf]),
      matricula: r[iMat] !== undefined ? String(r[iMat]).trim() : "",
      nome: normalizeName(String(r[iNome] ?? "")),
      banco: String(r[iBanco] ?? "").trim(),
      contrato: String(r[iContrato] ?? "").trim(),
      cnpjEmpregador: String(r[iCnpjEmp] ?? "").trim(),
    });
  }
  return out;
}
