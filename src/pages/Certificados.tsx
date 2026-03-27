import { useEffect, useState, useRef, useCallback } from "react";
import * as forge from "node-forge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, KeyRound, AlertTriangle, XCircle, CheckCircle2, Trash2, Pencil, FileKey2, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, differenceInDays } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";

type Certificado = Tables<"certificados">;

export default function Certificados() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [certificados, setCertificados] = useState<Certificado[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({ empresa: "", tipo: "A1", data_vencimento: "", senha_certificado: "", email_cliente: "" });
  const [isReading, setIsReading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadCertificados = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("certificados")
      .select("*")
      .eq("user_id", user.id)
      .order("data_vencimento", { ascending: true });
    setCertificados(data || []);
  }, [user]);

  useEffect(() => { loadCertificados(); }, [loadCertificados]);

  const simulateCertificateReading = (e?: React.ChangeEvent<HTMLInputElement> | React.MouseEvent) => {
    const fileEvent = (e && 'target' in e) ? (e as React.ChangeEvent<HTMLInputElement>) : null;
    const file = fileEvent?.target.files?.[0];

    if (fileEvent && !file) return;

    if (!form.senha_certificado) {
      toast({ title: "Senha Necessária", description: "Digite a senha do certificado para conseguirmos descriptografar e extrair os dados.", variant: "destructive" });
      return;
    }

    if (form.tipo === "A1") {
      if (!file) return;
      setIsReading(true);

      const reader = new FileReader();
      reader.onload = function(event) {
        try {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          const binaryString = Array.from(new Uint8Array(arrayBuffer)).map(b => String.fromCharCode(b)).join('');
          const p12Der = forge.util.createBuffer(binaryString, 'raw');
          const p12Asn1 = forge.asn1.fromDer(p12Der);
          const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, form.senha_certificado);

          let foundCert: any = null;
          for (const safeContent of p12.safeContents) {
            for (const safeBag of safeContent.safeBags) {
              if (safeBag.type === forge.pki.oids.certBag) {
                foundCert = safeBag.cert;
                break;
              }
            }
            if (foundCert) break;
          }

          if (!foundCert) throw new Error("Sem certificado no arquivo.");

          const subjectParams = foundCert.subject.attributes.find((attr: any) => attr.shortName === 'CN');
          const nomeCert = subjectParams ? subjectParams.value : "EMPRESA NÃO IDENTIFICADA";
          const nomeLimpo = nomeCert.split(':')[0];
          const validadeStr = format(foundCert.validity.notAfter, 'yyyy-MM-dd');

          setForm((prev) => ({ ...prev, empresa: nomeLimpo, data_vencimento: validadeStr }));
          setIsReading(false);
          toast({ title: "Sucesso!", description: "Certificado validado com a senha correta! Revise os dados e Salve." });
        } catch {
          setIsReading(false);
          toast({ title: "Falha na Criptografia", description: "Senha Incorreta ou Arquivo Corrompido. Tente novamente.", variant: "destructive" });
        }
      };
      reader.onerror = () => {
        setIsReading(false);
        toast({ title: "Erro de Leitura", description: "Ocorreu um erro ao carregar o arquivo do seu computador.", variant: "destructive" });
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const toDate = (s: string) => new Date(s + "T12:00:00");

  const getDiasRestantes = (dataValidade: string) => {
    return differenceInDays(toDate(dataValidade), toDate(format(new Date(), "yyyy-MM-dd")));
  };

  const getStatus = (dataValidade: string) => {
    const dias = getDiasRestantes(dataValidade);
    if (dias < 0) {
      return { label: "Vencido", color: "text-destructive", bg: "bg-destructive/10", icon: XCircle, id: "vencido" };
    }
    if (dias <= 30) {
      return { label: "A expirar", color: "text-amber-600", bg: "bg-amber-100", icon: AlertTriangle, id: "a_expirar" };
    }
    return { label: "Ativo", color: "text-green-600", bg: "bg-green-100", icon: CheckCircle2, id: "ativo" };
  };

  const ativos = certificados.filter(c => getStatus(c.data_vencimento).id === "ativo").length;
  const aExpirar = certificados.filter(c => getStatus(c.data_vencimento).id === "a_expirar").length;
  const vencidos = certificados.filter(c => getStatus(c.data_vencimento).id === "vencido").length;

  const handleEdit = (cert: Certificado) => {
    setEditingId(cert.id);
    setForm({ empresa: cert.empresa, tipo: cert.tipo, data_vencimento: cert.data_vencimento, senha_certificado: "", email_cliente: cert.email_cliente || "" });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("certificados").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Removido", description: "O certificado foi removido com sucesso." });
    loadCertificados();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const currentEmpresa = form.empresa.toLowerCase();
    const isDuplicate = certificados.some(c => c.empresa.toLowerCase() === currentEmpresa && c.id !== editingId);
    if (isDuplicate) {
      toast({ title: "Certificado Bloqueado: Empresa Duplicada", description: `Já existe um certificado em nome de "${form.empresa}". Caso necessite, apenas atualize-o.`, variant: "destructive" });
      return;
    }

    const payload = {
      user_id: user!.id,
      empresa: form.empresa.trim(),
      tipo: form.tipo as "A1" | "A3",
      data_vencimento: form.data_vencimento,
      email_cliente: form.email_cliente.trim() || null,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from("certificados").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("certificados").insert(payload));
    }

    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingId ? "Certificado atualizado!" : "Certificado registrado!" });
    setDialogOpen(false);
    loadCertificados();
  };

  const certificadosFiltrados = certificados
    .filter(c => !statusFilter || statusFilter === 'todos' || getStatus(c.data_vencimento).id === statusFilter)
    .filter(c => c.empresa.toLowerCase().includes(search.toLowerCase()));

  const handleExportPDF = () => {
    const filtroLabel = statusFilter === 'ativo' ? 'Ativos' : statusFilter === 'a_expirar' ? 'A Expirar' : statusFilter === 'vencido' ? 'Vencidos' : 'Todos';

    const rows = certificadosFiltrados.map(cert => {
      const status = getStatus(cert.data_vencimento);
      const dias = getDiasRestantes(cert.data_vencimento);
      const diasStr = dias < 0 ? 'Vencido' : `${dias} dias`;
      const diasColor = dias < 0 ? '#dc2626' : dias <= 10 ? '#d97706' : dias <= 30 ? '#d97706' : '#16a34a';
      const statusColor = status.id === 'ativo' ? '#16a34a' : status.id === 'a_expirar' ? '#d97706' : '#dc2626';
      return `<tr>
        <td>${cert.empresa}</td>
        <td style="text-align:center">${cert.tipo}</td>
        <td style="text-align:center">${format(toDate(cert.data_vencimento), 'dd/MM/yyyy')}</td>
        <td style="text-align:center;color:${diasColor};font-weight:600">${diasStr}</td>
        <td style="text-align:center;color:${statusColor};font-weight:600">${status.label}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Certificados Digitais — Diretriz</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600;700&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Kanit',Arial,sans-serif; font-size:12px; color:#1a1a1a; padding:28px; }
    .header { display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #ED3237; padding-bottom:14px; margin-bottom:18px; }
    .brand { display:flex; align-items:center; gap:12px; }
    .brand-name { font-size:24px; font-weight:700; color:#10143D; line-height:1; }
    .brand-sub { font-size:8px; letter-spacing:2.5px; color:#888; margin-top:3px; }
    .report-info { text-align:right; }
    .report-title { font-size:15px; font-weight:600; color:#10143D; margin-bottom:3px; }
    .report-date { font-size:11px; color:#666; }
    .filter-tag { display:inline-block; background:#f3f4f6; border:1px solid #d1d5db; border-radius:4px; padding:3px 10px; font-size:10px; font-weight:600; color:#374151; margin-bottom:14px; }
    .summary { display:flex; gap:14px; margin-bottom:18px; }
    .summary-box { padding:10px 20px; border-radius:8px; text-align:center; min-width:80px; }
    .summary-box .num { font-size:22px; font-weight:700; }
    .summary-box .lbl { font-size:9px; text-transform:uppercase; letter-spacing:1px; margin-top:2px; }
    .box-green { background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0; }
    .box-amber { background:#fffbeb; color:#d97706; border:1px solid #fde68a; }
    .box-red   { background:#fef2f2; color:#dc2626; border:1px solid #fecaca; }
    table { width:100%; border-collapse:collapse; }
    th { background:#10143D; color:#fff; padding:9px 12px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; }
    td { padding:8px 12px; border-bottom:1px solid #e5e7eb; font-size:11px; }
    tr:nth-child(even) td { background:#f9fafb; }
    .footer { margin-top:28px; padding-top:10px; border-top:1px solid #e5e7eb; font-size:9px; color:#9ca3af; text-align:center; }
    @media print { @page { margin:15mm; } body { padding:0; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <svg width="44" height="44" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 52 L10 18 C10 8 18 0 28 0 L46 0 C56 0 64 8 64 18 L64 44 C64 54 56 62 46 62 L28 62 C18 62 10 54 10 52 Z" fill="#ED3237"/>
        <rect x="4" y="18" width="52" height="7" rx="2" fill="white"/>
        <rect x="4" y="37" width="52" height="7" rx="2" fill="white"/>
      </svg>
      <div>
        <div class="brand-name">Diretriz</div>
        <div class="brand-sub">CONTABILIDADE E CONSULTORIA</div>
      </div>
    </div>
    <div class="report-info">
      <div class="report-title">Relatório de Certificados Digitais</div>
      <div class="report-date">Emitido em ${format(new Date(), 'dd/MM/yyyy')} às ${format(new Date(), 'HH:mm')}</div>
    </div>
  </div>
  <span class="filter-tag">Filtro: ${filtroLabel} — ${certificadosFiltrados.length} registro(s)</span>
  <div class="summary">
    <div class="summary-box box-green"><div class="num">${ativos}</div><div class="lbl">Ativos</div></div>
    <div class="summary-box box-amber"><div class="num">${aExpirar}</div><div class="lbl">A Expirar</div></div>
    <div class="summary-box box-red"><div class="num">${vencidos}</div><div class="lbl">Vencidos</div></div>
  </div>
  <table>
    <thead><tr><th>Empresa</th><th style="text-align:center">Tipo</th><th style="text-align:center">Vencimento</th><th style="text-align:center">Dias Restantes</th><th style="text-align:center">Status</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" style="text-align:center;padding:24px;color:#9ca3af">Nenhum certificado encontrado para o filtro selecionado.</td></tr>'}</tbody>
  </table>
  <div class="footer">© ${new Date().getFullYear()} Diretriz Contabilidade — Todos os direitos reservados</div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 400); };<\/script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=960,height=720');
    if (!win) {
      toast({ title: "Bloqueado pelo navegador", description: "Permita pop-ups para este site e tente novamente.", variant: "destructive" });
      return;
    }
    win.document.write(html);
    win.document.close();
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Certificados Digitais</h1>
          <p className="text-muted-foreground">Controle rigoroso dos vencimentos de A1 e A3.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportPDF} disabled={certificadosFiltrados.length === 0}>
            <Printer className="mr-2 h-4 w-4" /> Imprimir / PDF
          </Button>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          if (!open) {
            setEditingId(null);
            setForm({ empresa: "", tipo: "A1", data_vencimento: "", senha_certificado: "", email_cliente: "" });
          }
          setDialogOpen(open);
        }}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              setEditingId(null);
              setForm({ empresa: "", tipo: "A1", data_vencimento: "", senha_certificado: "", email_cliente: "" });
            }}>
              <Plus className="mr-2 h-4 w-4" /> Registrar Certificado
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingId ? "Atualizar Certificado" : "Lançar Novo Certificado"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Tipo de Certificado</Label>
                <Select value={form.tipo} onValueChange={(v) => { setForm({ empresa: "", data_vencimento: "", senha_certificado: "", email_cliente: form.email_cliente, tipo: v }); }}>
                  <SelectTrigger><SelectValue placeholder="Modelo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A1">A1 (Arquivo Digital .pfx/.p12)</SelectItem>
                    <SelectItem value="A3">A3 (Cartão/Token USB)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {!editingId && form.tipo === "A1" && (
                <>
                  <div className="space-y-2">
                    <Label>Senha do Certificado</Label>
                    <Input type="password" value={form.senha_certificado} onChange={e => setForm({...form, senha_certificado: e.target.value})} placeholder="Digite a senha para extrair os dados..." required />
                  </div>

                  <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center gap-2 bg-muted/20">
                    <FileKey2 className="h-8 w-8 text-primary opacity-80" />
                    <p className="text-sm font-medium">Faça o upload do arquivo .PFX / .P12</p>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".pfx,.p12" onChange={simulateCertificateReading} />
                    <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isReading} className="w-full mt-2">
                      {isReading ? "Processando..." : "Selecionar Arquivo"}
                    </Button>
                  </div>
                </>
              )}

              {!editingId && form.tipo === "A3" && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 border text-sm text-muted-foreground">
                  <KeyRound className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Certificado A3 (Token/Cartão): preencha o nome da empresa e a data de vencimento manualmente abaixo.</span>
                </div>
              )}

              <div className="space-y-2">
                <Label>E-mail do Cliente (Lembretes Automáticos)</Label>
                <Input type="email" value={form.email_cliente} onChange={e => setForm({...form, email_cliente: e.target.value})} placeholder="contato@empresa.com.br" />
                <p className="text-xs text-muted-foreground mt-1">
                  Enviaremos alertas quando faltarem 30 dias para o vencimento.
                </p>
              </div>

              <div className="space-y-2">
                <Label>{form.tipo === "A1" ? "Empresa Extraída (Automático)" : "Nome da Empresa"}</Label>
                <Input
                  value={form.empresa}
                  readOnly={form.tipo === "A1" && !editingId}
                  placeholder={form.tipo === "A1" ? "Aguardando upload do certificado..." : "Digite o nome da empresa"}
                  className={form.tipo === "A1" && !editingId ? "bg-muted/50 font-medium" : ""}
                  onChange={(e) => form.tipo === "A3" || editingId ? setForm({ ...form, empresa: e.target.value }) : undefined}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Vencimento do Certificado</Label>
                <Input
                  type="date"
                  value={form.data_vencimento}
                  readOnly={form.tipo === "A1" && !editingId}
                  className={form.tipo === "A1" && !editingId ? "bg-muted/50 text-muted-foreground" : ""}
                  onChange={(e) => form.tipo === "A3" || editingId ? setForm({ ...form, data_vencimento: e.target.value }) : undefined}
                  required
                />
              </div>

              <Button type="submit" className="w-full mt-4" disabled={!form.empresa || isReading}>
                {editingId ? "Salvar Atualização Manual" : "2. Confirmar e Salvar Certificado"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm text-muted-foreground mr-2 font-medium">Filtro Rápido (Clique para filtrar):</span>
        {statusFilter && (
          <Button variant="outline" size="sm" onClick={() => setStatusFilter(null)} className="h-7 text-xs">
            Exibir Todos
          </Button>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card onClick={() => setStatusFilter(statusFilter === 'ativo' ? null : 'ativo')} className={`cursor-pointer transition-all hover:scale-[1.02] ${statusFilter === 'ativo' ? 'ring-2 ring-green-500 bg-green-50' : 'bg-green-50/40 hover:bg-green-50/70'} border-green-200`}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-green-700">Certificados Ativos</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{ativos}</div>
          </CardContent>
        </Card>
        <Card onClick={() => setStatusFilter(statusFilter === 'a_expirar' ? null : 'a_expirar')} className={`cursor-pointer transition-all hover:scale-[1.02] ${statusFilter === 'a_expirar' ? 'ring-2 ring-amber-500 bg-amber-50' : 'bg-amber-50/40 hover:bg-amber-50/70'} border-amber-200`}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-amber-800">A Expirar</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700">{aExpirar}</div>
          </CardContent>
        </Card>
        <Card onClick={() => setStatusFilter(statusFilter === 'vencido' ? null : 'vencido')} className={`cursor-pointer transition-all hover:scale-[1.02] ${statusFilter === 'vencido' ? 'ring-2 ring-red-500 bg-red-50' : 'bg-red-50/40 hover:bg-red-50/70'} border-red-200`}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-destructive">Certificados Vencidos</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{vencidos}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between mt-8 mb-4">
        <div className="relative w-full sm:w-96">
          <Input
            placeholder="Buscar por nome da empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Mostrar Status:</span>
          <Select value={statusFilter || 'todos'} onValueChange={(val) => setStatusFilter(val === 'todos' ? null : val)}>
            <SelectTrigger className="w-[180px] bg-white">
              <SelectValue placeholder="Situação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Status</SelectItem>
              <SelectItem value="ativo">Somente Ativos (Verdes)</SelectItem>
              <SelectItem value="a_expirar">A Expirar (Amarelos)</SelectItem>
              <SelectItem value="vencido">Vencidos (Vermelhos)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Dias Restantes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {certificadosFiltrados.length > 0 ? certificadosFiltrados.map(cert => {
                const status = getStatus(cert.data_vencimento);
                const dias = getDiasRestantes(cert.data_vencimento);
                const Icon = status.icon;
                return (
                  <TableRow key={cert.id}>
                    <TableCell className="font-medium text-foreground">{cert.empresa}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md border text-xs font-semibold uppercase text-muted-foreground mr-2 bg-muted/30">
                        {cert.tipo}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-foreground tabular-nums">
                      {format(toDate(cert.data_vencimento), 'dd/MM/yyyy')}
                    </TableCell>
                    <TableCell>
                      <span className={`font-semibold tabular-nums ${dias < 0 ? "text-destructive" : dias <= 10 ? "text-amber-600" : dias <= 30 ? "text-amber-500" : "text-green-600"}`}>
                        {dias < 0 ? "Vencido" : `${dias} dias`}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color}`}>
                        <Icon className="mr-1.5 h-3.5 w-3.5" />
                        {status.label}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(cert)}>
                          <Pencil className="h-4 w-4 text-muted-foreground hover:text-primary" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir certificado?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação não pode ser desfeita. O certificado de <strong>{cert.empresa}</strong> será removido permanentemente.
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
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <KeyRound className="mx-auto h-8 w-8 mb-2 opacity-40" />
                    Nenhum certificado registrado no sistema.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
