import { useState } from "react";
import { format } from "date-fns";
import { Download, FileText, Sheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import jsPDF from "jspdf";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ExportColumn<T = any> {
  header: string;
  value: (row: T) => string | number | null | undefined;
  width?: number; // relative weight for PDF column width
}

interface ExportButtonProps<T = any> {
  data: T[];
  columns: ExportColumn<T>[];
  filename: string;    // sem extensão
  title?: string;      // título no cabeçalho do PDF
  disabled?: boolean;
}

// ── Palette ───────────────────────────────────────────────────────────────────
const NAVY_R = 16, NAVY_G = 20, NAVY_B = 61;

// ── CSV ───────────────────────────────────────────────────────────────────────
function exportCSV<T>(data: T[], columns: ExportColumn<T>[], filename: string) {
  const header = columns.map(c => `"${c.header}"`).join(";");
  const rows = data.map(row =>
    columns.map(c => {
      const v = c.value(row) ?? "";
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(";")
  );
  const csv = [header, ...rows].join("\r\n");
  const bom = "\uFEFF"; // BOM para Excel PT-BR
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${filename}_${format(new Date(), "yyyyMMdd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── PDF ───────────────────────────────────────────────────────────────────────
function exportPDF<T>(data: T[], columns: ExportColumn<T>[], filename: string, title: string) {
  const isLandscape = columns.length > 5;
  const doc = new jsPDF({ orientation: isLandscape ? "landscape" : "portrait", unit: "mm", format: "a4" });

  const pageW  = doc.internal.pageSize.getWidth();
  const pageH  = doc.internal.pageSize.getHeight();
  const margin = 12;
  const tableW = pageW - margin * 2;

  // Calcular larguras proporcionais
  const totalWeight = columns.reduce((s, c) => s + (c.width ?? 1), 0);
  const colWidths   = columns.map(c => ((c.width ?? 1) / totalWeight) * tableW);

  // ── Cabeçalho da página ──
  doc.setFillColor(NAVY_R, NAVY_G, NAVY_B);
  doc.rect(0, 0, pageW, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(title, margin, 12);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")} — ${data.length} registro(s)`,
    pageW - margin,
    12,
    { align: "right" }
  );

  // ── Cabeçalho da tabela ──
  let y = 26;
  const rowH = 7;

  function drawHeader() {
    doc.setFillColor(NAVY_R, NAVY_G, NAVY_B);
    doc.rect(margin, y, tableW, rowH, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    let x = margin;
    columns.forEach((col, i) => {
      doc.text(col.header, x + 1.5, y + 5);
      x += colWidths[i];
    });
  }

  drawHeader();
  y += rowH;

  // ── Linhas ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);

  data.forEach((row, ri) => {
    // Nova página se necessário
    if (y + rowH > pageH - 14) {
      doc.addPage();
      y = 10;
      drawHeader();
      y += rowH;
    }

    // Fundo alternado
    if (ri % 2 === 0) {
      doc.setFillColor(245, 247, 252);
      doc.rect(margin, y, tableW, rowH, "F");
    }

    // Borda inferior
    doc.setDrawColor(220, 220, 230);
    doc.line(margin, y + rowH, margin + tableW, y + rowH);

    doc.setTextColor(40, 40, 60);
    let x = margin;
    columns.forEach((col, i) => {
      const raw  = col.value(row) ?? "";
      const text = String(raw);
      // Truncar para caber na coluna (aprox 1.8px por char a 7pt)
      const maxChars = Math.floor(colWidths[i] / 1.85);
      const display  = text.length > maxChars ? text.slice(0, maxChars - 1) + "…" : text;
      doc.text(display, x + 1.5, y + 5);
      x += colWidths[i];
    });

    y += rowH;
  });

  // ── Rodapé ──
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 170);
    doc.text(`Diretriz Monitor Fiscal`, margin, pageH - 5);
    doc.text(`Página ${i} / ${pageCount}`, pageW - margin, pageH - 5, { align: "right" });
  }

  doc.save(`${filename}_${format(new Date(), "yyyyMMdd")}.pdf`);
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ExportButton<T = any>({
  data,
  columns,
  filename,
  title,
  disabled,
}: ExportButtonProps<T>) {
  const [loading, setLoading] = useState(false);
  const resolvedTitle = title ?? filename.replace(/_/g, " ");

  async function handle(type: "csv" | "pdf") {
    if (!data.length) return;
    setLoading(true);
    try {
      if (type === "csv") exportCSV(data, columns, filename);
      else                exportPDF(data, columns, filename, resolvedTitle);
    } finally {
      setLoading(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || loading || data.length === 0}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handle("csv")} className="gap-2 cursor-pointer">
          <Sheet className="h-4 w-4 text-green-600" />
          Exportar CSV (Excel)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handle("pdf")} className="gap-2 cursor-pointer">
          <FileText className="h-4 w-4 text-red-500" />
          Exportar PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
