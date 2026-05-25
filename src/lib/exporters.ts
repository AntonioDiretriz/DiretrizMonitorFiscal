import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import type { ConferenciaResult } from "./conferir";
import { fmtBR } from "./normalize";
const logoUrl = "/logo-nova.png";

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch(logoUrl);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function exportarPdf(r: ConferenciaResult, fileName = "conferencia-folha.pdf") {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  const logo = await loadLogoDataUrl();
  if (logo) {
    try { doc.addImage(logo, "PNG", 30, 22, 80, 30); } catch { /* ignore */ }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(40, 30, 80);
  doc.text("Conferência de Folha — Comissão & Gratificação", W / 2, 38, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80);
  const meta = [
    `Empresa: ${r.empresa ?? "-"}`,
    `CNPJ: ${r.cnpj ?? "-"}`,
    `Competência: ${r.competencia ?? "-"}`,
    `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
  ].join("    |    ");
  doc.text(meta, W / 2, 58, { align: "center" });

  // Resumo
  autoTable(doc, {
    startY: 75,
    theme: "grid",
    headStyles: { fillColor: [56, 30, 100], textColor: 255, fontStyle: "bold" },
    head: [["Funcionários", "Divergentes", "Comissão PDF", "Comissão Planilha", "Gratificação PDF", "Gratificação Planilha"]],
    body: [[
      r.totais.funcionarios,
      r.totais.divergentes,
      `R$ ${fmtBR(r.totais.comissaoPdf)}`,
      `R$ ${fmtBR(r.totais.comissaoPlan)}`,
      `R$ ${fmtBR(r.totais.gratificacaoPdf)}`,
      `R$ ${fmtBR(r.totais.gratificacaoPlan)}`,
    ]],
    styles: { fontSize: 9 },
  });

  // Lista detalhada
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 16,
    theme: "striped",
    headStyles: { fillColor: [196, 36, 36], textColor: 255, fontStyle: "bold", fontSize: 8 },
    head: [[
      "Mat.", "Nome", "Setor",
      "Comissão PDF", "Comissão Planilha", "Δ",
      "Gratif. PDF", "Gratif. Planilha", "Δ",
      "Base INSS", "FGTS", "Status"
    ]],
    body: r.itens.map((i) => [
      i.matricula || "-",
      i.nome,
      i.setor || "-",
      fmtBR(i.comissaoPdf),
      fmtBR(i.comissaoPlan),
      fmtBR(i.comissaoPdf - i.comissaoPlan),
      fmtBR(i.gratificacaoPdf),
      fmtBR(i.gratificacaoPlan),
      fmtBR(i.gratificacaoPdf - i.gratificacaoPlan),
      fmtBR(i.baseInss),
      fmtBR(i.valorFgts),
      i.status === "ok" ? "OK"
        : i.status === "divergente" ? "DIVERGENTE"
        : i.status === "so_pdf" ? "SÓ NO PDF" : "SÓ NA PLANILHA",
    ]),
    styles: { fontSize: 7, cellPadding: 3 },
    columnStyles: {
      1: { cellWidth: 130 },
      2: { cellWidth: 80 },
      11: { cellWidth: 60, fontStyle: "bold" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 11) {
        const v = String(data.cell.raw);
        if (v === "OK") data.cell.styles.textColor = [30, 130, 60];
        else data.cell.styles.textColor = [196, 36, 36];
      }
    },
  });

  // Rodapé com nº de páginas
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`Página ${p}/${pages} — Diretriz Contabilidade`, W - 30, doc.internal.pageSize.getHeight() - 12, { align: "right" });
  }
  doc.save(fileName);
}

export function exportarExcelDivergencias(r: ConferenciaResult, fileName = "divergencias.xlsx") {
  const rows = r.itens
    .filter((i) => i.status !== "ok")
    .map((i) => ({
      Matricula: i.matricula,
      CPF: i.cpf,
      Nome: i.nome,
      Setor: i.setor,
      "Arquivo Planilha": i.arquivoPlan,
      "Comissão PDF": i.comissaoPdf,
      "Comissão Planilha": i.comissaoPlan,
      "Δ Comissão": +(i.comissaoPdf - i.comissaoPlan).toFixed(2),
      "Gratificação 20 PDF": i.gratificacaoPdf,
      "Gratificação 20 Planilha": i.gratificacaoPlan,
      "Δ Gratificação 20": +(i.gratificacaoPdf - i.gratificacaoPlan).toFixed(2),
      "Gratif. NPS 286 PDF": i.gratificacaoNpsPdf,
      "Gratif. NPS 286 Planilha": i.gratificacaoNpsPlan,
      "Δ Gratif. NPS": +(i.gratificacaoNpsPdf - i.gratificacaoNpsPlan).toFixed(2),
      "Prêmio PDF": i.premioPdf,
      "Prêmio Planilha": i.premioPlan,
      "Adiant. Prêmio PDF": i.adiantPremioPdf,
      "Adiant. Prêmio Planilha": i.adiantPremioPlan,
      "Base INSS": i.baseInss,
      "Valor FGTS": i.valorFgts,
      "Empréstimos PDF (R$)": i.emprestimosPdf,
      "Empréstimos eSocial (qtd)": i.emprestimosEsocialQtd,
      Status: i.status.toUpperCase().replace("_", " "),
      Observações: i.divergencias.join(" | "),
    }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Divergências");

  // Aba completa
  const all = r.itens.map((i) => ({
    Matricula: i.matricula,
    CPF: i.cpf,
    Nome: i.nome,
    Setor: i.setor,
    "Comissão PDF": i.comissaoPdf,
    "Comissão Planilha": i.comissaoPlan,
    "Gratificação PDF": i.gratificacaoPdf,
    "Gratificação Planilha": i.gratificacaoPlan,
    Status: i.status,
  }));
  const wsAll = XLSX.utils.json_to_sheet(all);
  XLSX.utils.book_append_sheet(wb, wsAll, "Todos");

  XLSX.writeFile(wb, fileName);
}
