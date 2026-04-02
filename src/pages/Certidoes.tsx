import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, FileCheck, Trash2, ExternalLink, Download, Pencil, History, Eye, Printer, RefreshCw, Zap } from "lucide-react";
import { ExportButton } from "@/components/ExportButton";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge, tipoLabels, tipoGrupos, tipoParaGrupo, certidoesComConsultaOnline } from "@/components/StatusBadge";
import { differenceInDays, format } from "date-fns";
import { jsPDF } from "jspdf";

// Converte "YYYY-MM-DD" do banco sem deslocamento de fuso horário
const toDate = (s: string) => new Date(s + "T12:00:00");
import type { Tables } from "@/integrations/supabase/types";

export default function Certidoes() {
  const { user, podeIncluir: PODE_INCLUIR, podeExcluir: PODE_EXCLUIR, ownerUserId } = useAuth();
  const { toast } = useToast();
  const [certidoes, setCertidoes] = useState<any[]>([]);
  const [empresas, setEmpresas] = useState<{ id: string; razao_social: string }[]>([]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 20;
  const [form, setForm] = useState({ empresa_id: "", tipo: "", status: "regular", data_emissao: "", data_validade: "", observacao: "", auto_consultar: false });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCert, setEditingCert] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ status: "regular", data_emissao: "", data_validade: "", observacao: "", auto_consultar: false });
  const [atualizandoFgts, setAtualizandoFgts] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingCert, setViewingCert] = useState<any | null>(null);
  const [consultaDialogOpen, setConsultaDialogOpen] = useState(false);
  const [consultaCert, setConsultaCert] = useState<any | null>(null);
  const [consultaStatus, setConsultaStatus] = useState("regular");
  const [consultaDataEmissao, setConsultaDataEmissao] = useState("");
  const [consultaDataValidade, setConsultaDataValidade] = useState("");
  const [fgtsLoading, setFgtsLoading] = useState(false);
  const [fgtsMensagem, setFgtsMensagem] = useState<string | null>(null);
  const [fgtsPdfUrl, setFgtsPdfUrl] = useState<string | null>(null);

  const loadCertidoes = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, count } = await supabase
      .from("certidoes")
      .select("*, empresas(razao_social, cnpj)", { count: "exact" })
      .order("data_validade", { ascending: true })
      .range(from, to);
    setCertidoes(data || []);
    setTotalCount(count ?? 0);
    setIsLoading(false);
  }, [user, page]);

  const loadEmpresas = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("empresas").select("id, razao_social").order("razao_social");
    setEmpresas(data || []);
  }, [user]);

  useEffect(() => { loadCertidoes(); loadEmpresas(); }, [loadCertidoes, loadEmpresas]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("certidoes").insert({
      user_id: ownerUserId!,
      empresa_id: form.empresa_id,
      tipo: form.tipo as any,
      status: form.status as any,
      data_emissao: form.data_emissao || null,
      data_validade: form.data_validade || null,
      observacao: form.observacao.trim() || null,
      auto_consultar: form.auto_consultar,
    });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Certidão registrada!" });
    setForm({ empresa_id: "", tipo: "", status: "regular", data_emissao: "", data_validade: "", observacao: "", auto_consultar: false });
    setDialogOpen(false);
    loadCertidoes();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("certidoes").delete().eq("id", id);
    loadCertidoes();
  };

  const handleOpenEdit = (cert: any) => {
    setEditingCert(cert);
    setEditForm({
      status: cert.status,
      data_emissao: cert.data_emissao || "",
      data_validade: cert.data_validade || "",
      observacao: cert.observacao || "",
      auto_consultar: cert.auto_consultar ?? false,
    });
    setEditDialogOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCert) return;
    const statusChanged = editForm.status !== editingCert.status;
    const { error } = await supabase.from("certidoes").update({
      status: editForm.status as any,
      data_emissao: editForm.data_emissao || null,
      data_validade: editForm.data_validade || null,
      observacao: editForm.observacao.trim() || null,
      auto_consultar: editForm.auto_consultar,
    }).eq("id", editingCert.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    if (statusChanged) {
      await supabase.from("certidoes_historico").insert({
        certidao_id: editingCert.id,
        user_id: ownerUserId!,
        status_anterior: editingCert.status as any,
        status_novo: editForm.status as any,
        observacao: editForm.observacao.trim() || null,
      });
    }
    toast({ title: "Certidão atualizada!" });
    setEditDialogOpen(false);
    setEditingCert(null);
    loadCertidoes();
  };

  const handleOpenView = (cert: any) => {
    setViewingCert(cert);
    setViewDialogOpen(true);
  };

  const handleExportPDF = (cert: any) => {
    const doc = new jsPDF();
    const dias = getDiasRestantes(cert.data_validade);
    const statusText = cert.status.charAt(0).toUpperCase() + cert.status.slice(1);

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("CERTIDÃO NEGATIVA — FICHA TÉCNICA", 105, 20, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}`, 105, 28, { align: "center" });

    doc.setDrawColor(200);
    doc.line(14, 32, 196, 32);

    doc.setTextColor(0);
    doc.setFontSize(11);

    const rows: [string, string][] = [
      ["Empresa", cert.empresas?.razao_social || "—"],
      ["CNPJ", cert.empresas?.cnpj ? cert.empresas.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : "—"],
      ["Tipo de Certidão", tipoLabels[cert.tipo] || cert.tipo],
      ["Status", statusText],
      ["Data de Emissão", cert.data_emissao ? format(toDate(cert.data_emissao), "dd/MM/yyyy") : "—"],
      ["Data de Validade", cert.data_validade ? format(toDate(cert.data_validade), "dd/MM/yyyy") : "—"],
      ["Dias Restantes", dias !== null ? (dias <= 0 ? "VENCIDA" : `${dias} dias`) : "—"],
      ["Observação", cert.observacao || "—"],
    ];

    let y = 44;
    rows.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold");
      doc.text(`${label}:`, 14, y);
      doc.setFont("helvetica", "normal");
      doc.text(value, 70, y);
      y += 10;
    });

    doc.setDrawColor(200);
    doc.line(14, y + 4, 196, y + 4);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text("Monitor Fiscal — Diretriz Contabilidade", 105, y + 10, { align: "center" });

    doc.save(`certidao_${cert.tipo}_${cert.empresas?.razao_social || "empresa"}_${format(new Date(), "yyyyMMdd")}.pdf`);
  };

  const handlePrint = (cert: any) => {
    const dias = getDiasRestantes(cert.data_validade);
    const statusText = cert.status.charAt(0).toUpperCase() + cert.status.slice(1);
    const cnpjFormatado = cert.empresas?.cnpj
      ? cert.empresas.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
      : "—";

    const html = `
      <html><head><title>Certidão — ${cert.empresas?.razao_social}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #111; }
        h1 { font-size: 18px; text-align: center; border-bottom: 2px solid #ccc; padding-bottom: 10px; }
        .subtitle { text-align: center; font-size: 11px; color: #888; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        td { padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px; }
        td:first-child { font-weight: bold; width: 40%; color: #444; }
        .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #aaa; }
      </style></head>
      <body>
        <h1>CERTIDÃO NEGATIVA — FICHA TÉCNICA</h1>
        <div class="subtitle">Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")} — Monitor Fiscal</div>
        <table>
          <tr><td>Empresa</td><td>${cert.empresas?.razao_social || "—"}</td></tr>
          <tr><td>CNPJ</td><td>${cnpjFormatado}</td></tr>
          <tr><td>Tipo de Certidão</td><td>${tipoLabels[cert.tipo] || cert.tipo}</td></tr>
          <tr><td>Status</td><td>${statusText}</td></tr>
          <tr><td>Data de Emissão</td><td>${cert.data_emissao ? format(toDate(cert.data_emissao), "dd/MM/yyyy") : "—"}</td></tr>
          <tr><td>Data de Validade</td><td>${cert.data_validade ? format(toDate(cert.data_validade), "dd/MM/yyyy") : "—"}</td></tr>
          <tr><td>Dias Restantes</td><td>${dias !== null ? (dias <= 0 ? "VENCIDA" : `${dias} dias`) : "—"}</td></tr>
          <tr><td>Observação</td><td>${cert.observacao || "—"}</td></tr>
        </table>
        <div class="footer">Monitor Fiscal — Diretriz Contabilidade</div>
      </body></html>`;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  const handleOpenHistory = async (cert: any) => {
    setHistoryItems([]);
    setHistoryDialogOpen(true);
    setHistoryLoading(true);
    const { data } = await supabase
      .from("certidoes_historico")
      .select("*")
      .eq("certidao_id", cert.id)
      .order("alterado_em", { ascending: false });
    setHistoryItems(data || []);
    setHistoryLoading(false);
  };

  const handleConsultarOnline = async (cert: any) => {
    const config = certidoesComConsultaOnline[cert.tipo];
    if (!config) {
      toast({ title: "Consulta não disponível", description: "Este tipo de certidão não possui consulta online.", variant: "destructive" });
      return;
    }

    // FGTS: abre o portal com o CNPJ em destaque para consulta
    if (cert.tipo === "cnd_fgts") {
      const cnpj = cert.empresas?.cnpj?.replace(/\D/g, "") || "";
      if (!cnpj) {
        toast({ title: "CNPJ ausente", description: "A empresa não possui CNPJ cadastrado.", variant: "destructive" });
        return;
      }
      const cnpjFormatado = cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
      setConsultaCert(cert);
      setConsultaStatus(cert.status);
      setConsultaDataEmissao(cert.data_emissao || "");
      setConsultaDataValidade(cert.data_validade || "");
      setFgtsLoading(false);
      setFgtsMensagem(cnpjFormatado);
      setFgtsPdfUrl(null);
      setConsultaDialogOpen(true);
      // Abre o portal e copia o CNPJ para a área de transferência
      window.open(config.url, "_blank");
      try { await navigator.clipboard.writeText(cnpj); } catch { /* ignorar se bloqueado */ }
      return;
    }

    // Demais certidões: abre portal + dialog para registrar resultado
    const cnpj = cert.empresas?.cnpj?.replace(/\D/g, "") || "";
    const url = config.param === "cnpj" && cnpj
      ? `${config.url}${config.url.includes("?") ? "&" : "?"}cnpj=${cnpj}`
      : config.url;
    window.open(url, "_blank");
    setConsultaCert(cert);
    setConsultaStatus(cert.status);
    setConsultaDataEmissao(cert.data_emissao || "");
    setConsultaDataValidade(cert.data_validade || "");
    setFgtsLoading(false);
    setFgtsMensagem(null);
    setFgtsPdfUrl(null);
    setConsultaDialogOpen(true);
  };

  const handleSalvarConsulta = async () => {
    if (!consultaCert) return;
    const statusChanged = consultaStatus !== consultaCert.status;
    const { error } = await supabase.from("certidoes").update({
      status: consultaStatus as any,
      data_emissao: consultaDataEmissao || null,
      data_validade: consultaDataValidade || null,
    }).eq("id", consultaCert.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    if (statusChanged) {
      await supabase.from("certidoes_historico").insert({
        certidao_id: consultaCert.id,
        user_id: ownerUserId!,
        status_anterior: consultaCert.status as any,
        status_novo: consultaStatus as any,
        observacao: consultaCert.tipo === "cnd_fgts"
          ? `Atualizado automaticamente via portal Caixa/FGTS${consultaDataValidade ? ` · Validade: ${consultaDataValidade}` : ""}`
          : "Atualizado via consulta online",
      });
    }
    toast({ title: "Status atualizado!" });
    setConsultaDialogOpen(false);
    loadCertidoes();
  };

  const handleAtualizarFgtsAutomatico = async () => {
    const fgtsCerts = certidoes.filter(c => c.tipo === "cnd_fgts" && c.auto_consultar);
    if (fgtsCerts.length === 0) {
      toast({ title: "Nenhuma certidão FGTS marcada para consulta automática." });
      return;
    }
    setAtualizandoFgts(true);
    let atualizadas = 0;
    let erros = 0;
    for (const cert of fgtsCerts) {
      const cnpj = cert.empresas?.cnpj?.replace(/\D/g, "") || "";
      if (!cnpj) { erros++; continue; }
      try {
        const { data: fnData, error: fnError } = await supabase.functions.invoke("fetch-cnd-fgts", { body: { cnpj } });
        if (fnError || !fnData?.ok) { erros++; continue; }
        const novoStatus = fnData.tipo === "irregular" ? "irregular" : "regular";
        const statusChanged = novoStatus !== cert.status;
        await supabase.from("certidoes").update({
          status: novoStatus as any,
          ...(fnData.data_emissao ? { data_emissao: fnData.data_emissao } : {}),
          ...(fnData.data_validade ? { data_validade: fnData.data_validade } : {}),
        }).eq("id", cert.id);
        if (statusChanged) {
          await supabase.from("certidoes_historico").insert({
            certidao_id: cert.id,
            user_id: ownerUserId!,
            status_anterior: cert.status as any,
            status_novo: novoStatus as any,
            observacao: "Atualizado automaticamente via consulta FGTS",
          });
        }
        atualizadas++;
      } catch { erros++; }
    }
    setAtualizandoFgts(false);
    toast({
      title: `Consulta FGTS concluída`,
      description: `${atualizadas} atualizada(s)${erros > 0 ? ` · ${erros} com erro` : ""}`,
    });
    loadCertidoes();
  };

  const getDiasRestantes = (dataValidade: string | null) => {
    if (!dataValidade) return null;
    return differenceInDays(toDate(dataValidade), toDate(format(new Date(), "yyyy-MM-dd")));
  };

  const filtered = certidoes.filter(c => {
    const matchSearch = c.empresas?.razao_social?.toLowerCase().includes(search.toLowerCase()) || false;
    const matchStatus = filterStatus === "all" || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const handleExportCSV = () => {
    const headers = ["Empresa", "Tipo", "Status", "Emissão", "Validade", "Dias Restantes"];
    const rows = filtered.map(c => {
      const dias = getDiasRestantes(c.data_validade);
      return [
        c.empresas?.razao_social || "",
        tipoLabels[c.tipo] || c.tipo,
        c.status,
        c.data_emissao ? format(toDate(c.data_emissao), "dd/MM/yyyy") : "",
        c.data_validade ? format(toDate(c.data_validade), "dd/MM/yyyy") : "",
        dias !== null ? (dias <= 0 ? "Vencida" : `${dias} dias`) : "",
      ].join(";");
    });
    const csv = [headers.join(";"), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `certidoes_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Certidões</h1>
          <p className="text-muted-foreground">Monitoramento de todas as certidões negativas</p>
        </div>
        <div className="flex items-center gap-2">
          {certidoes.some(c => c.tipo === "cnd_fgts" && c.auto_consultar) && (
            <Button variant="outline" onClick={handleAtualizarFgtsAutomatico} disabled={atualizandoFgts}>
              <RefreshCw className={`mr-2 h-4 w-4 ${atualizandoFgts ? "animate-spin" : ""}`} />
              {atualizandoFgts ? "Consultando FGTS..." : "Atualizar FGTS"}
            </Button>
          )}
          <ExportButton
            data={filtered}
            filename="certidoes"
            title="Certidões"
            columns={[
              { header: "Empresa",   value: r => r.empresas?.razao_social, width: 2 },
              { header: "CNPJ",      value: r => r.empresas?.cnpj },
              { header: "Tipo",      value: r => tipoLabels[r.tipo] || r.tipo, width: 1.5 },
              { header: "Status",    value: r => r.status },
              { header: "Emissão",   value: r => r.data_emissao  ? format(toDate(r.data_emissao),  "dd/MM/yyyy") : "—" },
              { header: "Validade",  value: r => r.data_validade ? format(toDate(r.data_validade), "dd/MM/yyyy") : "—" },
              { header: "Observação",value: r => r.observacao, width: 2 },
            ]}
          />
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            {PODE_INCLUIR && (
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> Nova Certidão</Button>
              </DialogTrigger>
            )}
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Registrar Certidão</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Empresa *</Label>
                <Select value={form.empresa_id} onValueChange={(v) => setForm({ ...form, empresa_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                  <SelectContent>
                    {empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.razao_social}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo *</Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                    <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                  <SelectContent>
                    {tipoGrupos.map(({ grupo, tipos }) => (
                      <SelectGroup key={grupo}>
                        <SelectLabel className="text-xs font-bold uppercase text-muted-foreground px-2 py-1">{grupo}</SelectLabel>
                        {tipos.map(k => (
                          <SelectItem key={k} value={k}>
                            {certidoesComConsultaOnline[k] ? `🌐 ${tipoLabels[k]}` : tipoLabels[k]}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status *</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="regular">🟢 Regular</SelectItem>
                      <SelectItem value="vencendo">🟡 Vencendo</SelectItem>
                      <SelectItem value="irregular">🔴 Irregular</SelectItem>
                      <SelectItem value="indisponivel">⚫ Indisponível</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data de Emissão</Label>
                  <Input type="date" value={form.data_emissao} onChange={(e) => setForm({ ...form, data_emissao: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Data de Validade</Label>
                  <Input type="date" value={form.data_validade} onChange={(e) => setForm({ ...form, data_validade: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Observação</Label>
                <Input placeholder="Observações sobre a certidão" value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
              </div>
              {form.tipo === "cnd_fgts" && (
                <div className="flex items-start gap-3 p-3 rounded-md bg-blue-50 border border-blue-200">
                  <input
                    type="checkbox"
                    id="auto_consultar_new"
                    checked={form.auto_consultar}
                    onChange={e => setForm({ ...form, auto_consultar: e.target.checked })}
                    className="h-4 w-4 mt-0.5 rounded border-gray-300 cursor-pointer"
                  />
                  <div>
                    <Label htmlFor="auto_consultar_new" className="cursor-pointer font-medium flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-blue-600" /> Consulta automática habilitada
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Ao clicar em "Atualizar FGTS", o sistema consultará esta certidão automaticamente no portal da Caixa.
                    </p>
                  </div>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={!form.empresa_id || !form.tipo}>Registrar</Button>
            </form>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por empresa..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="regular">Regular</SelectItem>
            <SelectItem value="vencendo">Vencendo</SelectItem>
            <SelectItem value="irregular">Irregular</SelectItem>
            <SelectItem value="indisponivel">Indisponível</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Emissão</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead>Dias Restantes</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length > 0 ? (() => {
                // Agrupar certidões por grupo, na ordem definida em tipoGrupos
                const grupoOrdem = tipoGrupos.map(g => g.grupo);
                const porGrupo: Record<string, any[]> = {};
                filtered.forEach(cert => {
                  const grupo = tipoParaGrupo[cert.tipo] || "Outros";
                  if (!porGrupo[grupo]) porGrupo[grupo] = [];
                  porGrupo[grupo].push(cert);
                });

                return grupoOrdem.flatMap(grupo => {
                  const certs = porGrupo[grupo];
                  if (!certs || certs.length === 0) return [];
                  const grupoCfg = tipoGrupos.find(g => g.grupo === grupo)!;
                  return [
                    // Cabeçalho do grupo
                    <TableRow key={`grupo-${grupo}`} className="hover:bg-transparent">
                      <TableCell colSpan={7} className="py-2 px-4">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${grupoCfg.cor}`}>
                          {grupo} — {certs.length} certidão{certs.length > 1 ? "ões" : ""}
                        </span>
                      </TableCell>
                    </TableRow>,
                    // Rows do grupo
                    ...certs.map(cert => {
                      const dias = getDiasRestantes(cert.data_validade);
                      return (
                        <TableRow key={cert.id}>
                          <TableCell className="font-medium">{cert.empresas?.razao_social || "—"}</TableCell>
                          <TableCell className="text-sm">
                            <span className="flex items-center gap-1">
                              {tipoLabels[cert.tipo] || cert.tipo}
                              {cert.auto_consultar && (
                                <span title="Consulta automática ativa">
                                  <Zap className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                                </span>
                              )}
                            </span>
                          </TableCell>
                          <TableCell><StatusBadge status={cert.status} /></TableCell>
                          <TableCell className="text-sm">{cert.data_emissao ? format(toDate(cert.data_emissao), "dd/MM/yyyy") : "—"}</TableCell>
                          <TableCell className="text-sm">{cert.data_validade ? format(toDate(cert.data_validade), "dd/MM/yyyy") : "—"}</TableCell>
                          <TableCell>
                            {dias !== null ? (
                              <span className={`font-medium ${dias <= 0 ? "text-destructive" : dias <= 10 ? "text-[hsl(38,92%,50%)]" : "text-foreground"}`}>
                                {dias <= 0 ? "Vencida" : `${dias} dias`}
                              </span>
                            ) : "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {certidoesComConsultaOnline[cert.tipo] && (
                                <Button variant="ghost" size="icon" onClick={() => handleConsultarOnline(cert)} title="Consultar Online">
                                  <ExternalLink className="h-4 w-4 text-blue-600" />
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" onClick={() => handleOpenView(cert)} title="Visualizar">
                                <Eye className="h-4 w-4 text-muted-foreground" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleOpenHistory(cert)} title="Histórico">
                                <History className="h-4 w-4 text-muted-foreground" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(cert)} title="Editar">
                                <Pencil className="h-4 w-4 text-muted-foreground" />
                              </Button>
                              {PODE_EXCLUIR && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Excluir certidão?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Esta ação não pode ser desfeita. A certidão de <strong>{cert.empresas?.razao_social}</strong> será removida permanentemente.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleDelete(cert.id)} className="bg-destructive hover:bg-destructive/90">
                                        Excluir
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    }),
                  ];
                });
              })() : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <FileCheck className="mx-auto h-8 w-8 mb-2 opacity-40" />
                    Nenhuma certidão registrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Exibindo {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} de {totalCount} certidões
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= totalCount} onClick={() => setPage(p => p + 1)}>
              Próxima
            </Button>
          </div>
        </div>
      )}

      {/* Consulta Online — Registrar Resultado */}
      <Dialog open={consultaDialogOpen} onOpenChange={setConsultaDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {consultaCert?.tipo === "cnd_fgts" ? "Consulta FGTS — Caixa Econômica" : "Registrar Resultado da Consulta"}
            </DialogTitle>
          </DialogHeader>
          {consultaCert && (
            <p className="text-sm font-medium text-foreground">{tipoLabels[consultaCert.tipo]} — {consultaCert.empresas?.razao_social}</p>
          )}

          {/* FGTS: instruções + CNPJ em destaque */}
          {consultaCert?.tipo === "cnd_fgts" && (
            <div className="space-y-3">
              {fgtsMensagem && (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 space-y-2 text-sm">
                  <p className="font-semibold text-blue-800">Portal da Caixa aberto em nova aba</p>
                  <ol className="text-blue-700 space-y-1 list-decimal list-inside">
                    <li>Cole o CNPJ abaixo no campo <strong>"Inscrição"</strong></li>
                    <li>Clique em <strong>"Consultar"</strong></li>
                    <li>Se regular, clique em <strong>"Certificado de Regularidade do FGTS - CRF"</strong></li>
                    <li>Anote a <strong>data de validade</strong> e registre abaixo</li>
                  </ol>
                  <div className="flex items-center gap-2 mt-2 bg-white border border-blue-300 rounded px-3 py-2">
                    <span className="font-mono font-bold text-blue-900 text-base tracking-wider flex-1">{fgtsMensagem}</span>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { try { navigator.clipboard.writeText(consultaCert?.empresas?.cnpj?.replace(/\D/g, "") || ""); toast({ title: "CNPJ copiado!" }); } catch { /* */ } }}>
                      Copiar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Campos manuais (sempre exibidos para confirmar/corrigir) */}
          {!fgtsLoading && (
            <div className="space-y-4">
              {consultaCert?.tipo !== "cnd_fgts" && (
                <p className="text-sm text-muted-foreground">O portal foi aberto em uma nova aba. Após verificar a situação, registre o resultado abaixo:</p>
              )}
              <div className="space-y-2">
                <Label>Status *</Label>
                <Select value={consultaStatus} onValueChange={setConsultaStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="regular">🟢 Regular — Certidão Negativa emitida</SelectItem>
                    <SelectItem value="irregular">🔴 Irregular — Débitos encontrados</SelectItem>
                    <SelectItem value="vencendo">🟡 Vencendo — Prazo próximo</SelectItem>
                    <SelectItem value="indisponivel">⚫ Indisponível — Portal fora do ar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data de Emissão</Label>
                  <Input type="date" value={consultaDataEmissao} onChange={e => setConsultaDataEmissao(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Data de Validade</Label>
                  <Input type="date" value={consultaDataValidade} onChange={e => setConsultaDataValidade(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setConsultaDialogOpen(false)}>
                  Fechar sem salvar
                </Button>
                <Button className="flex-1" onClick={handleSalvarConsulta}>
                  Salvar resultado
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ficha da Certidão</DialogTitle>
          </DialogHeader>
          {viewingCert && (() => {
            const dias = getDiasRestantes(viewingCert.data_validade);
            const cnpjFormatado = viewingCert.empresas?.cnpj
              ? viewingCert.empresas.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
              : "—";
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Empresa</p>
                    <p className="font-semibold">{viewingCert.empresas?.razao_social || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">CNPJ</p>
                    <p className="font-mono">{cnpjFormatado}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Tipo</p>
                    <p>{tipoLabels[viewingCert.tipo] || viewingCert.tipo}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Status</p>
                    <StatusBadge status={viewingCert.status} />
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Data de Emissão</p>
                    <p>{viewingCert.data_emissao ? format(toDate(viewingCert.data_emissao), "dd/MM/yyyy") : "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Data de Validade</p>
                    <p>{viewingCert.data_validade ? format(toDate(viewingCert.data_validade), "dd/MM/yyyy") : "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Dias Restantes</p>
                    <p className={`font-medium ${dias !== null && dias <= 0 ? "text-destructive" : dias !== null && dias <= 10 ? "text-[hsl(38,92%,50%)]" : ""}`}>
                      {dias !== null ? (dias <= 0 ? "VENCIDA" : `${dias} dias`) : "—"}
                    </p>
                  </div>
                  {viewingCert.observacao && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground text-xs uppercase tracking-wide">Observação</p>
                      <p>{viewingCert.observacao}</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-2 border-t">
                  <Button variant="outline" className="flex-1" onClick={() => handlePrint(viewingCert)}>
                    <Printer className="mr-2 h-4 w-4" /> Imprimir
                  </Button>
                  <Button className="flex-1" onClick={() => handleExportPDF(viewingCert)}>
                    <Download className="mr-2 h-4 w-4" /> Exportar PDF
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar Certidão</DialogTitle></DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label>Status *</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">🟢 Regular</SelectItem>
                  <SelectItem value="vencendo">🟡 Vencendo</SelectItem>
                  <SelectItem value="irregular">🔴 Irregular</SelectItem>
                  <SelectItem value="indisponivel">⚫ Indisponível</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data de Emissão</Label>
                <Input type="date" value={editForm.data_emissao} onChange={(e) => setEditForm({ ...editForm, data_emissao: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Data de Validade</Label>
                <Input type="date" value={editForm.data_validade} onChange={(e) => setEditForm({ ...editForm, data_validade: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Observação</Label>
              <Input placeholder="Motivo da alteração ou observação" value={editForm.observacao} onChange={(e) => setEditForm({ ...editForm, observacao: e.target.value })} />
            </div>
            {editingCert?.tipo === "cnd_fgts" && (
              <div className="flex items-start gap-3 p-3 rounded-md bg-blue-50 border border-blue-200">
                <input
                  type="checkbox"
                  id="auto_consultar_edit"
                  checked={editForm.auto_consultar}
                  onChange={e => setEditForm({ ...editForm, auto_consultar: e.target.checked })}
                  className="h-4 w-4 mt-0.5 rounded border-gray-300 cursor-pointer"
                />
                <div>
                  <Label htmlFor="auto_consultar_edit" className="cursor-pointer font-medium flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-blue-600" /> Consulta automática habilitada
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ao clicar em "Atualizar FGTS", o sistema consultará esta certidão automaticamente.
                  </p>
                </div>
              </div>
            )}
            <Button type="submit" className="w-full">Salvar Alterações</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Histórico de Alterações</DialogTitle></DialogHeader>
          {historyLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : historyItems.length > 0 ? (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {historyItems.map((h) => (
                <div key={h.id} className="p-3 rounded-lg border text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">
                      <span className="text-muted-foreground">{h.status_anterior}</span>
                      {" → "}
                      <span className="font-semibold">{h.status_novo}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(toDate(h.alterado_em), "dd/MM/yyyy HH:mm")}
                    </span>
                  </div>
                  {h.observacao && <p className="text-muted-foreground">{h.observacao}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma alteração de status registrada.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
