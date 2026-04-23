import { useState, useEffect, useRef, useCallback } from "react";
import { format, differenceInDays } from "date-fns";
import {
  Upload, CheckCircle, XCircle, Clock, Link,
  RefreshCw, Tag, FileText, Building2, Trash2, History,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const GREEN = "#22c55e";
const AMBER = "#f59e0b";
const RED   = "#ED3237";
const GRAY  = "#6b7280";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ContaBancaria {
  id: string;
  empresa_id: string | null;
  banco: string;
  agencia: string | null;
  conta: string | null;
  tipo: string;
  descricao: string | null;
  saldo_inicial: number;
}

interface Transacao {
  id: string;
  conta_bancaria_id: string;
  data: string;
  descricao: string;
  valor: number;
  tipo: string;
  status: string;
  importacao_id: string | null;
  plano_contas_id: string | null;
  categorizado_por: string | null;
}

interface ContaPagar {
  id: string;
  fornecedor: string;
  valor: number;
  data_vencimento: string;
  status: string;
}

interface PlanoContas {
  id: string;
  nome: string;
  tipo: string;
  codigo: string | null;
}

interface RegrasConciliacao {
  id: string;
  padrao: string;
  plano_contas_id: string;
  tipo: string;
  automatica: boolean;
}

interface Empresa { id: string; razao_social: string; }

interface Importacao {
  id: string;
  arquivo_nome: string | null;
  formato: string;
  status: string;
  total_transacoes: number | null;
  created_at: string;
  conta_bancaria_id: string;
}

// ── SHA-256 ───────────────────────────────────────────────────────────────────
async function sha256hex(buffer: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── OFX parser ────────────────────────────────────────────────────────────────
function parseOFX(text: string) {
  const out: { data: string; descricao: string; valor: number; tipo: string; hash: string }[] = [];
  const stmttrn = text.match(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi) || [];
  stmttrn.forEach(block => {
    const trntype  = (block.match(/<TRNTYPE>([^<\r\n]+)/i)?.[1] || "DEBIT").trim();
    const dtposted = block.match(/<DTPOSTED>([^<\r\n]+)/i)?.[1]?.trim() || "";
    const amt      = parseFloat(block.match(/<TRNAMT>([^<\r\n]+)/i)?.[1]?.trim() || "0");
    const memo     = (block.match(/<MEMO>([^<\r\n]+)/i)?.[1] || block.match(/<NAME>([^<\r\n]+)/i)?.[1] || "").trim();
    const fitid    = block.match(/<FITID>([^<\r\n]+)/i)?.[1]?.trim() || "";
    if (!dtposted || isNaN(amt)) return;
    const data = `${dtposted.slice(0, 4)}-${dtposted.slice(4, 6)}-${dtposted.slice(6, 8)}`;
    out.push({ data, descricao: memo || trntype, valor: Math.abs(amt),
      tipo: amt < 0 || trntype === "DEBIT" ? "debito" : "credito",
      hash: fitid || `${data}-${amt}-${memo}`,
    });
  });
  return out;
}

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSV(text: string) {
  const out: { data: string; descricao: string; valor: number; tipo: string; hash: string }[] = [];
  for (const line of text.split(/\r?\n/).filter(l => l.trim()).slice(1)) {
    const cols = line.split(/[;,]/).map(c => c.replace(/"/g, "").trim());
    if (cols.length < 3) continue;
    const [rawDate, rawDesc, rawVal] = cols;
    const m = rawDate.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) continue;
    const data  = `${m[3]}-${m[2]}-${m[1]}`;
    const valor = parseFloat(rawVal.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
    if (isNaN(valor)) continue;
    out.push({ data, descricao: rawDesc, valor: Math.abs(valor),
      tipo: valor < 0 ? "debito" : "credito",
      hash: `${data}-${valor}-${rawDesc}`.slice(0, 120),
    });
  }
  return out;
}

// ── Apply regras ──────────────────────────────────────────────────────────────
function applyRegras(txs: { descricao: string; tipo: string }[], regras: RegrasConciliacao[]) {
  return txs.map(t => {
    const desc  = t.descricao.toLowerCase();
    const regra = regras.find(r => (r.tipo === t.tipo || r.tipo === "ambos") && desc.includes(r.padrao.toLowerCase()));
    return regra ? { plano_contas_id: regra.plano_contas_id, automatica: regra.automatica } : null;
  });
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Conciliacao() {
  const { user, podeIncluir, ownerUserId } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [empresas,      setEmpresas]      = useState<Empresa[]>([]);
  const [contas,        setContas]        = useState<ContaBancaria[]>([]);
  const [transacoes,    setTransacoes]    = useState<Transacao[]>([]);
  const [contasPagar,   setContasPagar]   = useState<ContaPagar[]>([]);
  const [planoContas,   setPlanoContas]   = useState<PlanoContas[]>([]);
  const [regras,        setRegras]        = useState<RegrasConciliacao[]>([]);

  const [selectedEmpresa, setSelectedEmpresa] = useState<string | null>(null);
  const [selectedConta,   setSelectedConta]   = useState<string | null>(null);

  const [importacoes,    setImportacoes]    = useState<Importacao[]>([]);
  const [showHistory,    setShowHistory]    = useState(false);
  const [uploading,      setUploading]      = useState(false);
  const [matchDialogId,  setMatchDialogId]  = useState<string | null>(null);
  const [selectedCpId,   setSelectedCpId]   = useState<string>("");
  const [loading,        setLoading]        = useState(true);
  const [categorizando,  setCategorizando]  = useState<string | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [cbRes, txRes, cpRes, empRes, rRes, impRes] = await Promise.all([
      supabase.from("contas_bancarias").select("id, empresa_id, banco, agencia, conta, tipo, descricao, saldo_inicial").order("banco"),
      supabase.from("transacoes_bancarias").select("*").order("data", { ascending: false }).limit(500),
      supabase.from("contas_pagar").select("id, fornecedor, valor, data_vencimento, status").in("status", ["pendente", "aprovado"]).order("data_vencimento"),
      supabase.from("empresas").select("id, razao_social").order("razao_social"),
      supabase.from("regras_conciliacao").select("id, padrao, plano_contas_id, tipo, automatica"),
      (supabase as any).from("importacoes_bancarias").select("id, arquivo_nome, formato, status, total_transacoes, created_at, conta_bancaria_id").order("created_at", { ascending: false }).limit(100),
    ]);
    setContas((cbRes.data ?? []) as ContaBancaria[]);
    setTransacoes((txRes.data ?? []) as Transacao[]);
    setContasPagar((cpRes.data ?? []) as ContaPagar[]);
    setEmpresas((empRes.data ?? []) as Empresa[]);
    setRegras((rRes.data ?? []) as RegrasConciliacao[]);
    setImportacoes((impRes.data ?? []) as Importacao[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Reload plano_contas when empresa changes
  useEffect(() => {
    setSelectedConta(null);
    if (!selectedEmpresa) { setPlanoContas([]); return; }
    supabase.from("plano_contas").select("id, nome, tipo, codigo")
      .eq("empresa_id", selectedEmpresa)
      .order("codigo").order("nome")
      .then(({ data }) => setPlanoContas((data ?? []) as PlanoContas[]));
  }, [selectedEmpresa]);

  const contasDaEmpresa = selectedEmpresa
    ? contas.filter(c => c.empresa_id === selectedEmpresa)
    : contas;

  // ── Categorizar ───────────────────────────────────────────────────────────
  const salvarRegra = async (descricao: string, tipo: string, planoContasId: string) => {
    if (!ownerUserId) return;
    await supabase.from("regras_conciliacao").upsert({
      user_id: ownerUserId, padrao: descricao.slice(0, 60).trim(), tipo,
      plano_contas_id: planoContasId, uso_count: 1,
    }, { onConflict: "user_id,padrao,tipo" });
    supabase.from("regras_conciliacao").select("id, padrao, plano_contas_id, tipo")
      .then(({ data }) => { if (data) setRegras(data as RegrasConciliacao[]); });
  };

  const handleCategorizar = async (t: Transacao, planoContasId: string) => {
    setCategorizando(t.id);
    const { error } = await supabase.from("transacoes_bancarias")
      .update({ plano_contas_id: planoContasId, categorizado_por: "manual" }).eq("id", t.id);
    if (!error) {
      setTransacoes(prev => prev.map(tx => tx.id === t.id ? { ...tx, plano_contas_id: planoContasId, categorizado_por: "manual" } : tx));
      await salvarRegra(t.descricao, t.tipo, planoContasId);
    }
    setCategorizando(null);
  };

  // ── Import OFX/CSV ────────────────────────────────────────────────────────
  const importarTextual = async (file: File, ext: string) => {
    const buffer = await file.arrayBuffer();
    const hash   = await sha256hex(buffer);
    if (selectedConta) {
      const { data: dup } = await supabase.from("importacoes_bancarias")
        .select("id, created_at").eq("user_id", ownerUserId!).eq("conta_bancaria_id", selectedConta)
        .eq("arquivo_hash", hash).limit(1);
      if (dup && dup.length > 0) {
        toast({ title: "Extrato duplicado", description: `Já importado em ${format(new Date(dup[0].created_at), "dd/MM/yyyy")}.`, variant: "destructive" });
        return;
      }
    }
    const text   = new TextDecoder().decode(buffer);
    const parsed = ext === "ofx" || ext === "ofc" ? parseOFX(text) : parseCSV(text);
    if (parsed.length === 0) { toast({ title: "Nenhuma transação encontrada", variant: "destructive" }); return; }
    const planoIds = applyRegras(parsed, regras);
    const { data: imp, error: impErr } = await supabase.from("importacoes_bancarias").insert({
      user_id: ownerUserId!, conta_bancaria_id: selectedConta!, formato: ext,
      arquivo_nome: file.name, status: "processando", total_transacoes: parsed.length, arquivo_hash: hash,
    }).select().single();
    if (impErr) { toast({ title: "Erro ao registrar importação", variant: "destructive" }); return; }
    const rows = parsed.map((t, i) => ({
      user_id: ownerUserId!, conta_bancaria_id: selectedConta!, importacao_id: imp.id,
      data: t.data, descricao: t.descricao, valor: t.valor, tipo: t.tipo,
      status: planoIds[i]?.automatica ? "conciliado" : "pendente",
      hash_dedup: t.hash,
      plano_contas_id: planoIds[i]?.plano_contas_id ?? null,
      categorizado_por: planoIds[i] ? "regra" : "manual",
    }));
    const { error: insErr } = await supabase.from("transacoes_bancarias").upsert(rows, { onConflict: "user_id,conta_bancaria_id,hash_dedup", ignoreDuplicates: true });
    await supabase.from("importacoes_bancarias").update({ status: insErr ? "erro" : "concluido", erro_mensagem: insErr?.message ?? null }).eq("id", imp.id);
    if (insErr) { toast({ title: "Erro ao importar", description: insErr.message, variant: "destructive" }); }
    else {
      const autoCat  = planoIds.filter(Boolean).length;
      const autoConc = planoIds.filter(r => r?.automatica).length;
      toast({
        title: `${parsed.length} transações importadas!`,
        description: autoCat > 0 ? `${autoCat} categorizadas${autoConc > 0 ? `, ${autoConc} conciliadas automaticamente` : ""}.` : undefined,
      });
      loadAll();
    }
  };

  // ── Import PDF ────────────────────────────────────────────────────────────
  const importarPDF = async (file: File) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const anonKey    = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    const formData   = new FormData();
    formData.append("file", file);
    formData.append("user_id", ownerUserId!);
    if (selectedConta) formData.append("conta_bancaria_id", selectedConta);
    const res  = await fetch(`${supabaseUrl}/functions/v1/processar-extrato`, { method: "POST", headers: { apikey: anonKey }, body: formData });
    const data = await res.json();
    if (res.status === 409) { toast({ title: "Extrato duplicado", description: data.message, variant: "destructive" }); return; }
    if (!res.ok || !data.ok) { toast({ title: "Erro ao processar PDF", description: data.error ?? "Erro", variant: "destructive" }); return; }
    const { hash, transacoes: txList } = data as { hash: string; transacoes: { data: string; descricao: string; valor: number; tipo: string }[] };
    if (!txList?.length) { toast({ title: "Nenhuma transação no PDF", variant: "destructive" }); return; }
    const planoIds = applyRegras(txList, regras);
    const { data: imp, error: impErr } = await supabase.from("importacoes_bancarias").insert({
      user_id: ownerUserId!, conta_bancaria_id: selectedConta!, formato: "pdf",
      arquivo_nome: file.name, status: "processando", total_transacoes: txList.length, arquivo_hash: hash,
    }).select().single();
    if (impErr) { toast({ title: "Erro ao registrar importação", variant: "destructive" }); return; }
    const rows = txList.map((t, i) => ({
      user_id: ownerUserId!, conta_bancaria_id: selectedConta!, importacao_id: imp.id,
      data: t.data, descricao: t.descricao, valor: t.valor, tipo: t.tipo,
      status: planoIds[i]?.automatica ? "conciliado" : "pendente",
      hash_dedup: `pdf-${hash}-${i}`,
      plano_contas_id: planoIds[i]?.plano_contas_id ?? null,
      categorizado_por: planoIds[i] ? "regra" : "manual",
    }));
    const { error: insErr } = await supabase.from("transacoes_bancarias").upsert(rows, { onConflict: "user_id,conta_bancaria_id,hash_dedup", ignoreDuplicates: true });
    await supabase.from("importacoes_bancarias").update({ status: insErr ? "erro" : "concluido", erro_mensagem: insErr?.message ?? null }).eq("id", imp.id);
    if (insErr) { toast({ title: "Erro ao salvar transações", description: insErr.message, variant: "destructive" }); }
    else {
      const autoCat  = planoIds.filter(Boolean).length;
      const autoConc = planoIds.filter(r => r?.automatica).length;
      toast({
        title: `${txList.length} transações importadas do PDF${data.banco ? ` — ${data.banco}` : ""}!`,
        description: autoCat > 0 ? `${autoCat} categorizadas${autoConc > 0 ? `, ${autoConc} conciliadas automaticamente` : ""}.` : undefined,
      });
      loadAll();
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConta) return;
    e.target.value = "";
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    try {
      if (ext === "pdf") await importarPDF(file);
      else if (["ofx", "ofc", "csv"].includes(ext)) await importarTextual(file, ext);
      else toast({ title: "Formato não suportado", description: "Use PDF, OFX ou CSV.", variant: "destructive" });
    } finally { setUploading(false); }
  };

  const handleIgnorar = async (id: string) => {
    await supabase.from("transacoes_bancarias").update({ status: "ignorado" }).eq("id", id);
    setTransacoes(prev => prev.map(t => t.id === id ? { ...t, status: "ignorado" } : t));
  };

  const handleDeleteImportacao = async (imp: Importacao) => {
    // Deleta transações desta importação e depois o registro
    await (supabase as any).from("transacoes_bancarias").delete().eq("importacao_id", imp.id);
    await (supabase as any).from("importacoes_bancarias").delete().eq("id", imp.id);
    toast({ title: "Importação removida", description: "Você pode reimportar o arquivo agora." });
    loadAll();
  };

  const handleConciliar = async () => {
    if (!matchDialogId || !selectedCpId) return;
    const { error } = await supabase.from("conciliacoes").insert({
      user_id: ownerUserId!, transacao_id: matchDialogId, conta_pagar_id: selectedCpId,
      tipo: "manual", confianca: 100, criado_por: user!.id,
    });
    if (error) { toast({ title: "Erro ao conciliar", variant: "destructive" }); return; }
    await supabase.from("transacoes_bancarias").update({ status: "conciliado" }).eq("id", matchDialogId);
    await supabase.from("contas_pagar").update({ status: "pago", data_pagamento: transacoes.find(t => t.id === matchDialogId)?.data }).eq("id", selectedCpId);
    toast({ title: "Transação conciliada!" });
    setMatchDialogId(null); setSelectedCpId(""); loadAll();
  };

  const contasFiltradas      = transacoes.filter(t => !selectedConta || t.conta_bancaria_id === selectedConta);
  const importacoesFiltradas = importacoes.filter(i => !selectedConta || i.conta_bancaria_id === selectedConta);
  const pendentes   = contasFiltradas.filter(t => t.status === "pendente").length;
  const conciliados = contasFiltradas.filter(t => t.status === "conciliado").length;
  const ignorados   = contasFiltradas.filter(t => t.status === "ignorado").length;
  const planoById   = Object.fromEntries(planoContas.map(p => [p.id, p]));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Conciliação Bancária</h1>
        <p className="text-muted-foreground">Selecione a empresa, a conta e importe o extrato</p>
      </div>

      {/* Seletores: Empresa → Conta → Import */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={selectedEmpresa ?? "todas"} onValueChange={v => setSelectedEmpresa(v === "todas" ? null : v)}>
          <SelectTrigger className="w-64">
            <Building2 className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
            <SelectValue placeholder="Todas as empresas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as empresas</SelectItem>
            {empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.razao_social}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select
          value={selectedConta ?? "todas"}
          onValueChange={v => setSelectedConta(v === "todas" ? null : v)}
          disabled={contasDaEmpresa.length === 0}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder={contasDaEmpresa.length === 0 ? "Nenhuma conta cadastrada" : "Todas as contas"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as contas</SelectItem>
            {contasDaEmpresa.map(c => (
              <SelectItem key={c.id} value={c.id}>
                {c.banco}{c.conta ? ` — ${c.conta}` : ""}{c.descricao ? ` (${c.descricao})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedConta && podeIncluir && (
          <>
            <input ref={fileInputRef} type="file" accept=".ofx,.ofc,.csv,.pdf" className="hidden" onChange={handleFileImport} />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading
                ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Importando...</>
                : <><Upload className="mr-2 h-4 w-4" /> Importar PDF / OFX / CSV</>
              }
            </Button>
          </>
        )}

        {contasFiltradas.length > 0 && (
          <div className="flex gap-3 ml-auto text-sm">
            <span className="flex items-center gap-1" style={{ color: AMBER }}><Clock className="h-3.5 w-3.5" />{pendentes} pendentes</span>
            <span className="flex items-center gap-1" style={{ color: GREEN }}><CheckCircle className="h-3.5 w-3.5" />{conciliados} conciliados</span>
            <span className="flex items-center gap-1" style={{ color: GRAY }}><XCircle className="h-3.5 w-3.5" />{ignorados} ignorados</span>
          </div>
        )}
      </div>

      {/* Aviso: empresa sem contas cadastradas */}
      {selectedEmpresa && contasDaEmpresa.length === 0 && !loading && (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800">
          <Building2 className="h-5 w-5 shrink-0" />
          <span>Esta empresa não possui contas bancárias cadastradas. Acesse <strong>Empresas → editar → aba Bancos</strong> para cadastrar.</span>
        </div>
      )}

      {/* Regras ativas */}
      {regras.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Tag className="h-3.5 w-3.5" />
          {regras.length} regra{regras.length !== 1 ? "s" : ""} de categorização automática ativas
        </div>
      )}

      {/* Histórico de importações */}
      {importacoesFiltradas.length > 0 && (
        <div>
          <button
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground mb-2"
            onClick={() => setShowHistory(h => !h)}
          >
            <History className="h-3.5 w-3.5" />
            {showHistory ? "Ocultar" : "Ver"} histórico de importações ({importacoesFiltradas.length})
          </button>
          {showHistory && (
            <Card className="mb-4">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Arquivo</TableHead>
                      <TableHead>Formato</TableHead>
                      <TableHead>Transações</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importacoesFiltradas.map(imp => (
                      <TableRow key={imp.id}>
                        <TableCell className="text-sm max-w-[200px] truncate">{imp.arquivo_nome ?? "—"}</TableCell>
                        <TableCell><Badge variant="outline" className="uppercase text-xs">{imp.formato}</Badge></TableCell>
                        <TableCell className="text-sm">{imp.total_transacoes ?? 0}</TableCell>
                        <TableCell>
                          <Badge style={{ backgroundColor: imp.status === "concluido" ? GREEN + "20" : imp.status === "erro" ? RED + "20" : AMBER + "20", color: imp.status === "concluido" ? GREEN : imp.status === "erro" ? RED : AMBER }}>
                            {imp.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{format(new Date(imp.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" title="Excluir importação" onClick={() => handleDeleteImportacao(imp)}>
                            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Tabela de transações */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : contasFiltradas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="h-8 w-8 opacity-30" />
                      <p>{selectedConta ? "Nenhuma transação importada. Clique em Importar PDF / OFX / CSV." : "Selecione uma conta para ver as transações."}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : contasFiltradas.map(t => (
                <TableRow key={t.id} className={t.status === "conciliado" ? "bg-green-50/30" : t.status === "ignorado" ? "opacity-50" : ""}>
                  <TableCell className="text-sm">{format(new Date(t.data + "T12:00:00"), "dd/MM/yyyy")}</TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate" title={t.descricao}>{t.descricao}</TableCell>
                  <TableCell>
                    <Badge style={{ backgroundColor: t.tipo === "credito" ? GREEN + "20" : RED + "20", color: t.tipo === "credito" ? GREEN : RED }}>
                      {t.tipo === "credito" ? "Crédito" : "Débito"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium" style={{ color: t.tipo === "credito" ? GREEN : RED }}>
                    {t.tipo === "credito" ? "+" : "-"} R$ {Number(t.valor).toFixed(2).replace(".", ",")}
                  </TableCell>
                  <TableCell className="min-w-[160px]">
                    {t.status !== "ignorado" ? (
                      <Select
                        value={t.plano_contas_id ?? "none"}
                        onValueChange={v => v !== "none" && handleCategorizar(t, v)}
                        disabled={categorizando === t.id}
                      >
                        <SelectTrigger className="h-7 text-xs w-full">
                          <SelectValue placeholder="Sem categoria">
                            {t.plano_contas_id && planoById[t.plano_contas_id]
                              ? <span className="flex items-center gap-1">
                                  {t.categorizado_por === "regra" && <Tag className="h-3 w-3 text-blue-500 shrink-0" />}
                                  {planoById[t.plano_contas_id].nome}
                                </span>
                              : <span className="text-muted-foreground">Sem categoria</span>
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem categoria</SelectItem>
                          {planoContas.map(p => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.codigo ? `${p.codigo} — ` : ""}{p.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    {t.status === "pendente"   && <Badge style={{ backgroundColor: AMBER + "20", color: AMBER }}>Pendente</Badge>}
                    {t.status === "conciliado" && <Badge style={{ backgroundColor: GREEN + "20", color: GREEN }}>Conciliado</Badge>}
                    {t.status === "ignorado"   && <Badge variant="secondary">Ignorado</Badge>}
                  </TableCell>
                  <TableCell>
                    {t.status === "pendente" && (
                      <div className="flex gap-1 justify-end">
                        {t.tipo === "debito" && (
                          <Button variant="ghost" size="icon" title="Conciliar com conta a pagar"
                            onClick={() => { setMatchDialogId(t.id); setSelectedCpId(""); }}>
                            <Link className="h-4 w-4 text-blue-500" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" title="Ignorar" onClick={() => handleIgnorar(t.id)}>
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog: conciliar com conta a pagar */}
      <Dialog open={!!matchDialogId} onOpenChange={o => { if (!o) setMatchDialogId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Conciliar Transação</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">Selecione a conta a pagar correspondente:</p>
          <Select value={selectedCpId} onValueChange={setSelectedCpId}>
            <SelectTrigger><SelectValue placeholder="Selecione uma conta a pagar..." /></SelectTrigger>
            <SelectContent>
              {contasPagar.map(cp => {
                const dias = differenceInDays(new Date(cp.data_vencimento + "T12:00:00"), new Date());
                return (
                  <SelectItem key={cp.id} value={cp.id}>
                    {cp.fornecedor} — R$ {Number(cp.valor).toFixed(2).replace(".", ",")}
                    {" "}({dias < 0 ? `${Math.abs(dias)}d atrasada` : dias === 0 ? "hoje" : `${dias}d`})
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setMatchDialogId(null)}>Cancelar</Button>
            <Button className="flex-1" onClick={handleConciliar} disabled={!selectedCpId}>
              <Link className="mr-2 h-4 w-4" /> Conciliar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
