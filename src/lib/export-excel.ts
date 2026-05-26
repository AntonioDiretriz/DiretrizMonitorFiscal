import * as XLSX from 'xlsx';
import type { ConfrontoResult } from './xml-confront-types';

const STATUS_LABELS: Record<string, string> = {
  ok: '✅ OK',
  divergente: '⚠️ Divergente',
  ausente_xml: '❌ Ausente no XML',
  nao_escriturado: '🔵 Não escriturado',
};

function formatCurrency(v: number | null): string {
  if (v === null) return '';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function exportResults(results: ConfrontoResult[]): void {
  const data = results.map((r) => ({
    Status: STATUS_LABELS[r.status] ?? r.status,
    'Nº NF': r.nNF,
    Série: r.serie,
    Data: r.data,
    'CNPJ Emitente': r.cnpjEmitente,
    'Nome Emitente': r.nomeEmitente,
    'Valor Planilha': formatCurrency(r.valorPlanilha),
    'Valor XML': formatCurrency(r.valorXml),
    Diferença: r.diferenca !== null ? formatCurrency(r.diferenca) : '',
    'Chave NF-e': r.chNFe,
    Aba: r.sheetName ?? '',
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Resultado Confronto');

  // Set column widths
  ws['!cols'] = [
    { wch: 22 }, { wch: 10 }, { wch: 8 }, { wch: 12 },
    { wch: 18 }, { wch: 35 }, { wch: 16 }, { wch: 16 },
    { wch: 14 }, { wch: 48 }, { wch: 20 },
  ];

  XLSX.writeFile(wb, 'confronto-nfe-resultado.xlsx');
}
