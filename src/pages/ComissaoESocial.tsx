import { useNavigate } from "react-router-dom";
import { useState, useMemo, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { parseDominioPdf } from "@/lib/parsePdf";
import { parseEsocialXlsx } from "@/lib/parseXls";
import { conferir, type ConferenciaResult } from "@/lib/conferir";
import { exportarPdf, exportarExcelDivergencias } from "@/lib/exporters";
import { fmtBR } from "@/lib/normalize";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { FileText, FileSpreadsheet, Database, Play, Download, FileDown, AlertTriangle, CheckCircle2, X, Info, Loader2, Check, Circle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { parseFolhaXls as parseFolhaXlsLib, type PlanilhaParseResult } from "@/lib/parseXls";

export default function NovaConferencia() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [planFiles, setPlanFiles] = useState<File[]>([]);
  const [esocialFile, setEsocialFile] = useState<File | null>(null);
  const [empresa, setEmpresa] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ConferenciaResult | null>(null);
  const [filtro, setFiltro] = useState<"todos" | "divergente" | "ok">("todos");
  const [busca, setBusca] = useState("");

  const [filiaisPendentes, setFiliaisPendentes] = useState<PlanilhaParseResult[]>([]);
  const [filialContext, setFilialContext] = useState<{
    pdfData: Awaited<ReturnType<typeof parseDominioPdf>>;
    todasPlan: PlanilhaParseResult[];
    cnpjPdf: string;
  } | null>(null);

  type EtapaId = "pdf" | "planilhas" | "esocial" | "conferindo" | "salvando" | "redirecionando";
  type EtapaStatus = "pending" | "running" | "done" | "error";
  const ETAPAS: { id: EtapaId; label: string }[] = [
    { id: "pdf", label: "Lendo PDF do Domínio" },
    { id: "planilhas", label: "Lendo planilhas de comissão" },
    { id: "esocial", label: "Lendo eSocial" },
    { id: "conferindo", label: "Conferindo dados" },
    { id: "salvando", label: "Salvando no banco" },
    { id: "redirecionando", label: "Abrindo dashboard" },
  ];
  const [etapas, setEtapas] = useState<Record<EtapaId, { status: EtapaStatus; detalhe?: string }>>({
    pdf: { status: "pending" },
    planilhas: { status: "pending" },
    esocial: { status: "pending" },
    conferindo: { status: "pending" },
    salvando: { status: "pending" },
    redirecionando: { status: "pending" },
  });
  const setEtapa = (id: EtapaId, status: EtapaStatus, detalhe?: string) =>
    setEtapas((prev) => ({ ...prev, [id]: { status, detalhe } }));
  const resetEtapas = () =>
    setEtapas({
      pdf: { status: "pending" },
      planilhas: { status: "pending" },
      esocial: { status: "pending" },
      conferindo: { status: "pending" },
      salvando: { status: "pending" },
      redirecionando: { status: "pending" },
    });

  const pode = pdfFile && planFiles.length > 0;

  const yieldUI = () => new Promise<void>((r) => setTimeout(r, 0));

  const finalizarConferencia = async (
    pdfData: Awaited<ReturnType<typeof parseDominioPdf>>,
    planResults: PlanilhaParseResult[],
  ) => {
    let esocial: Awaited<ReturnType<typeof parseEsocialXlsx>> = [];
    if (esocialFile) {
      setEtapa("esocial", "running", `${(esocialFile.size / 1024).toFixed(0)} KB`);
      console.log("[conferir] iniciando parse eSocial", esocialFile.name, esocialFile.size);
      await yieldUI();
      try {
        esocial = await parseEsocialXlsx(esocialFile);
        setEtapa("esocial", "done", `${esocial.length} contratos`);
        console.log("[conferir] eSocial parseado:", esocial.length);
      } catch (e) {
        setEtapa("esocial", "error", e instanceof Error ? e.message : "falhou");
        throw e;
      }
      await yieldUI();
    } else {
      setEtapa("esocial", "done", "não enviado");
    }
    setEtapa("conferindo", "running");
    await yieldUI();
    console.log("[conferir] iniciando merge");
    const r = conferir(pdfData, planResults, esocial);
    console.log("[conferir] merge concluído:", r.itens.length, "itens");
    setEtapa("conferindo", "done", `${r.itens.length} funcionários · ${r.totais.divergentes} divergências · ${r.totais.aLancar} a lançar`);
    if (!empresa && r.empresa) setEmpresa(r.empresa);
    if (!cnpj && r.cnpj) setCnpj(r.cnpj);
    if (!competencia && r.competencia) setCompetencia(r.competencia);
    setResult(r);
    return r;
  };

  const handleConferir = async () => {
    if (!pdfFile || planFiles.length === 0) {
      toast.error("Envie o PDF do Domínio e ao menos uma planilha de comissão.");
      return;
    }
    resetEtapas();
    setBusy(true);
    try {
      setEtapa("pdf", "running", `${(pdfFile.size / 1024).toFixed(0)} KB`);
      await yieldUI();
      const pdfBuf = await pdfFile.arrayBuffer();
      const pdfData = await parseDominioPdf(pdfBuf);
      setEtapa("pdf", "done", `${pdfData.funcionarios.length} funcionários`);
      await yieldUI();

      setEtapa("planilhas", "running", `0/${planFiles.length}`);
      const planResults: PlanilhaParseResult[] = [];
      for (let i = 0; i < planFiles.length; i++) {
        setEtapa("planilhas", "running", `${i + 1}/${planFiles.length} · ${planFiles[i].name}`);
        await yieldUI();
        const r = await parseFolhaXlsLib(planFiles[i]);
        planResults.push(...r);
      }
      const totalLinhas = planResults.reduce((a, p) => a + p.funcionarios.length, 0);
      setEtapa("planilhas", "done", `${totalLinhas} linhas em ${planResults.length} setores`);
      await yieldUI();

      // Detecta filiais (CNPJ diferente do PDF)
      const cnpjPdf = pdfData.cnpj?.replace(/\D/g, "") ?? "";
      const filiais = cnpjPdf
        ? planResults.filter((p) => p.cnpj && p.cnpj !== cnpjPdf)
        : [];

      if (filiais.length > 0) {
        // Pergunta ao usuário antes de incluir filiais
        setFilialContext({ pdfData, todasPlan: planResults, cnpjPdf });
        setFiliaisPendentes(filiais);
        setBusy(false);
        return;
      }

      const r = await finalizarConferencia(pdfData, planResults);
      if (r) await salvarConferencia(r);
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Erro ao processar arquivos");
    } finally {
      setBusy(false);
    }
  };

  const respondendoRef = useRef(false);
  const responderFiliais = async (incluir: boolean) => {
    if (respondendoRef.current) return;
    if (!filialContext) return;
    respondendoRef.current = true;
    const ctx = filialContext;
    setFilialContext(null);
    setFiliaisPendentes([]);
    setBusy(true);
    try {
      const { pdfData, todasPlan, cnpjPdf } = ctx;
      const planFinais = incluir
        ? todasPlan
        : todasPlan.filter((p) => !p.cnpj || p.cnpj === cnpjPdf);
      const r = await finalizarConferencia(pdfData, planFinais);
      if (r) await salvarConferencia(r);
    } catch (err: unknown) {
      console.error("[responderFiliais]", err);
      toast.error(err instanceof Error ? err.message : "Erro ao processar");
    } finally {
      setBusy(false);
      respondendoRef.current = false;
    }
  };

  const salvarConferencia = async (resultToSave: ConferenciaResult) => {
    if (!user) {
      toast.error("Faça login para salvar.");
      return;
    }
    const result = resultToSave;
    try {
      setEtapa("salvando", "running", "criando conferência…");
      await yieldUI();
      const { data: conf, error } = await (supabase as any)
        .from("conferencias")
        .insert({
          user_id: user.id,
          competencia: competencia || result.competencia || "—",
          empresa: empresa || result.empresa || null,
          cnpj: cnpj || result.cnpj || null,
          pdf_nome: pdfFile?.name ?? null,
          planilhas_nomes: planFiles.map((f) => f.name),
          esocial_nome: esocialFile?.name ?? null,
          total_funcionarios: result.totais.funcionarios,
          total_divergencias: result.totais.divergentes,
          total_comissao_pdf: result.totais.comissaoPdf,
          total_comissao_planilha: result.totais.comissaoPlan,
          total_gratificacao_pdf: result.totais.gratificacaoPdf,
          total_gratificacao_planilha: result.totais.gratificacaoPlan,
        })
        .select()
        .single();
      if (error) throw error;

      const itens = result.itens.map((i) => ({
        conferencia_id: conf.id,
        cpf: i.cpf || null,
        matricula: i.matricula || null,
        nome: i.nome,
        setor: i.setor || null,
        comissao_pdf: i.comissaoPdf,
        comissao_planilha: i.comissaoPlan,
        gratificacao_pdf: i.gratificacaoPdf,
        gratificacao_planilha: i.gratificacaoPlan,
        gratificacao_nps_pdf: i.gratificacaoNpsPdf,
        gratificacao_nps_planilha: i.gratificacaoNpsPlan,
        premio_pdf: i.premioPdf,
        premio_planilha: i.premioPlan,
        adiant_premio_pdf: i.adiantPremioPdf,
        adiant_premio_planilha: i.adiantPremioPlan,
        salario_base: i.salarioBase,
        vale_transporte: i.valeTransporte,
        vale_refeicao: i.valeRefeicao,
        plano_saude: i.planoSaude,
        base_inss: i.baseInss,
        valor_fgts: i.valorFgts,
        emprestimos_pdf: i.emprestimosPdf,
        emprestimos_esocial_qtd: i.emprestimosEsocialQtd,
        bancos_esocial: i.bancosEsocial,
        status: i.status,
        divergencias: i.divergencias,
      }));
      // Insert em batches e captura os IDs para vincular empréstimos
      const insertedItens: { id: string; cpf: string | null; matricula: string | null; nome: string }[] = [];
      for (let idx = 0; idx < itens.length; idx += 500) {
        setEtapa("salvando", "running", `itens ${Math.min(idx + 500, itens.length)}/${itens.length}`);
        await yieldUI();
        const slice = itens.slice(idx, idx + 500);
        const { data: ins, error: e2 } = await (supabase as any)
          .from("conferencia_itens")
          .insert(slice)
          .select("id, cpf, matricula, nome");
        if (e2) throw e2;
        if (ins) insertedItens.push(...ins);
      }

      // Empréstimos detalhados
      const empRows: Array<{ item_id: string; conferencia_id: string; banco: string | null; numero_contrato: string | null; parcela: number; origem: string }> = [];
      for (const item of result.itens) {
        if (!item.emprestimosLista || item.emprestimosLista.length === 0) continue;
        const matched = insertedItens.find(
          (x) => (item.cpf && x.cpf === item.cpf) ||
                 (item.matricula && x.matricula === item.matricula) ||
                 x.nome === item.nome,
        );
        if (!matched) continue;
        for (const e of item.emprestimosLista) {
          empRows.push({
            item_id: matched.id,
            conferencia_id: conf.id,
            banco: e.banco ?? null,
            numero_contrato: e.numeroContrato ?? null,
            parcela: e.parcela,
            origem: "pdf",
          });
        }
      }
      if (empRows.length > 0) {
        for (let idx = 0; idx < empRows.length; idx += 500) {
          setEtapa("salvando", "running", `empréstimos ${Math.min(idx + 500, empRows.length)}/${empRows.length}`);
          await yieldUI();
          const slice = empRows.slice(idx, idx + 500);
          const { error: e3 } = await (supabase as any).from("conferencia_emprestimos").insert(slice);
          if (e3) throw e3;
        }
      }

      setEtapa("salvando", "done", `${itens.length} itens · ${empRows.length} empréstimos`);
      setEtapa("redirecionando", "running");
      await yieldUI();
      navigate(`/comissao-esocial/dashboard/${conf.id}`);
    } catch (err: unknown) {
      setEtapa("salvando", "error", err instanceof Error ? err.message : "erro");
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  };

  const itensFiltrados = useMemo(() => {
    if (!result) return [];
    return result.itens.filter((i) => {
      if (filtro === "divergente" && i.status !== "divergente") return false;
      if (filtro === "ok" && i.status !== "ok") return false;
      if (busca) {
        const q = busca.toLowerCase();
        return i.nome.toLowerCase().includes(q) || i.matricula.includes(q) || i.cpf.includes(q);
      }
      return true;
    });
  }, [result, filtro, busca]);

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      <header>
        <h1 className="text-3xl font-bold">Nova conferência</h1>
        <p className="text-muted-foreground mt-1">PDF do Domínio × planilhas de comissão × eSocial</p>
      </header>

      <Card className="p-6 space-y-5">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Empresa</Label>
            <Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Auto-preenche pelo PDF" />
          </div>
          <div className="space-y-2">
            <Label>CNPJ</Label>
            <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="Auto-preenche pelo PDF" />
          </div>
          <div className="space-y-2">
            <Label>Competência</Label>
            <Input value={competencia} onChange={(e) => setCompetencia(e.target.value)} placeholder="MM/AAAA" />
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <UploadBox
            icon={<FileText className="h-5 w-5" />}
            title="PDF Domínio"
            hint="Folha mensal validada (.pdf)"
            accept=".pdf"
            files={pdfFile ? [pdfFile] : []}
            onFiles={(fs) => setPdfFile(fs[0] ?? null)}
            onRemove={() => setPdfFile(null)}
          />
          <UploadBox
            icon={<FileSpreadsheet className="h-5 w-5" />}
            title="Planilhas de comissão"
            hint="Uma ou mais .xls/.xlsx por setor"
            accept=".xls,.xlsx"
            multiple
            files={planFiles}
            onFiles={(fs) => setPlanFiles((cur) => [...cur, ...fs])}
            onRemove={(idx) => setPlanFiles((cur) => cur.filter((_, i) => i !== idx))}
          />
          <UploadBox
            icon={<Database className="h-5 w-5" />}
            title="Excel eSocial (opcional)"
            hint="Empréstimos consignados"
            accept=".xlsx"
            files={esocialFile ? [esocialFile] : []}
            onFiles={(fs) => setEsocialFile(fs[0] ?? null)}
            onRemove={() => setEsocialFile(null)}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleConferir} disabled={!pode || busy} size="lg">
            <Play className="h-4 w-4 mr-2" />
            {busy ? "Processando…" : "Conferir"}
          </Button>
        </div>
      </Card>

      {(busy || Object.values(etapas).some((e) => e.status !== "pending")) && (
        <ProgressoEtapas etapas={ETAPAS} estado={etapas} />
      )}

      {result && (
        <Card className="p-6 space-y-5">
          {result.avisos.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
                <Info className="h-4 w-4" /> Avisos da conferência
              </div>
              <ul className="text-xs text-amber-900 dark:text-amber-100 list-disc list-inside space-y-0.5">
                {result.avisos.map((a, i) => <li key={i}>{a.detalhe}</li>)}
              </ul>
            </div>
          )}
          <div className="grid md:grid-cols-4 gap-4">
            <Stat label="Funcionários" value={String(result.totais.funcionarios)} />
            <Stat label="Divergências" value={String(result.totais.divergentes)} variant={result.totais.divergentes > 0 ? "warn" : "ok"} />
            <Stat label="A lançar (só planilha)" value={String(result.totais.aLancar)} />
            <Stat label="Total Comissão Planilha" value={`R$ ${fmtBR(result.totais.comissaoPlan)}`} />
          </div>

          <div className="flex flex-wrap gap-3 items-end justify-between">
            <Tabs value={filtro} onValueChange={(v) => setFiltro(v as typeof filtro)}>
              <TabsList>
                <TabsTrigger value="todos">Todos ({result.itens.length})</TabsTrigger>
                <TabsTrigger value="divergente">Divergentes ({result.totais.divergentes})</TabsTrigger>
                <TabsTrigger value="ok">OK ({result.itens.filter(i => i.status === "ok").length})</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex gap-2 flex-1 max-w-md">
              <Input placeholder="Buscar nome, matrícula ou CPF…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => exportarExcelDivergencias(result)}><FileDown className="h-4 w-4 mr-2" />Excel</Button>
              <Button variant="outline" onClick={() => exportarPdf(result)}><Download className="h-4 w-4 mr-2" />PDF</Button>
              <Button onClick={() => result && salvarConferencia(result)}>Salvar no histórico</Button>
            </div>
          </div>

          <div className="overflow-auto border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr className="text-left">
                  <th className="p-2">Status</th>
                  <th className="p-2">Mat.</th>
                  <th className="p-2">Nome</th>
                  <th className="p-2">Setor</th>
                  <th className="p-2 text-right">Comissão PDF</th>
                  <th className="p-2 text-right">Comissão Plan.</th>
                  <th className="p-2 text-right">Δ</th>
                  <th className="p-2 text-right">Gratif. 20 PDF</th>
                  <th className="p-2 text-right">Gratif. 20 Plan.</th>
                  <th className="p-2 text-right">Δ</th>
                  <th className="p-2 text-right">NPS 286 PDF</th>
                  <th className="p-2 text-right">NPS 286 Plan.</th>
                  <th className="p-2 text-right">Δ</th>
                  <th className="p-2 text-right">Base INSS</th>
                  <th className="p-2 text-right">FGTS</th>
                  <th className="p-2 text-center">Emp. eSocial</th>
                </tr>
              </thead>
              <tbody>
                {itensFiltrados.map((i, idx) => {
                  const dC = i.comissaoPdf - i.comissaoPlan;
                  const dG = i.gratificacaoPdf - i.gratificacaoPlan;
                  const dN = i.gratificacaoNpsPdf - i.gratificacaoNpsPlan;
                  return (
                    <tr key={idx} className="border-t hover:bg-muted/40">
                      <td className="p-2">
                        {i.status === "ok"
                          ? <Badge variant="outline" className="border-success/40 text-success bg-success/5"><CheckCircle2 className="h-3 w-3 mr-1" />OK</Badge>
                          : i.status === "so_planilha"
                            ? <Badge variant="outline" className="border-blue-500/40 text-blue-600 bg-blue-500/5">A lançar</Badge>
                            : <Badge variant="outline" className="border-destructive/40 text-destructive bg-destructive/5"><AlertTriangle className="h-3 w-3 mr-1" />{i.status === "divergente" ? "Divergente" : "Só no PDF"}</Badge>}
                      </td>
                      <td className="p-2">{i.matricula || "—"}</td>
                      <td className="p-2 font-medium">{i.nome}</td>
                      <td className="p-2 text-muted-foreground text-xs">{i.setor || "—"}</td>
                      <td className="p-2 text-right tabular-nums">{fmtBR(i.comissaoPdf)}</td>
                      <td className="p-2 text-right tabular-nums">{fmtBR(i.comissaoPlan)}</td>
                      <td className={`p-2 text-right tabular-nums font-semibold ${Math.abs(dC) > 0.05 ? "text-destructive" : "text-muted-foreground"}`}>{fmtBR(dC)}</td>
                      <td className="p-2 text-right tabular-nums">{fmtBR(i.gratificacaoPdf)}</td>
                      <td className="p-2 text-right tabular-nums">{fmtBR(i.gratificacaoPlan)}</td>
                      <td className={`p-2 text-right tabular-nums font-semibold ${Math.abs(dG) > 0.05 ? "text-destructive" : "text-muted-foreground"}`}>{fmtBR(dG)}</td>
                      <td className="p-2 text-right tabular-nums">{fmtBR(i.gratificacaoNpsPdf)}</td>
                      <td className="p-2 text-right tabular-nums">{fmtBR(i.gratificacaoNpsPlan)}</td>
                      <td className={`p-2 text-right tabular-nums font-semibold ${Math.abs(dN) > 0.05 ? "text-destructive" : "text-muted-foreground"}`}>{fmtBR(dN)}</td>
                      <td className="p-2 text-right tabular-nums">{fmtBR(i.baseInss)}</td>
                      <td className="p-2 text-right tabular-nums">{fmtBR(i.valorFgts)}</td>
                      <td className="p-2 text-center">{i.emprestimosEsocialQtd > 0 ? <Badge variant="secondary">{i.emprestimosEsocialQtd}</Badge> : "—"}</td>
                    </tr>
                  );
                })}
                {itensFiltrados.length === 0 && (
                  <tr><td colSpan={16} className="text-center text-muted-foreground p-6">Nenhum item para o filtro atual.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <AlertDialog open={filiaisPendentes.length > 0}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Planilhas de filial detectadas</AlertDialogTitle>
            <AlertDialogDescription>
              As planilhas abaixo têm CNPJ diferente do PDF do Domínio. Deseja incluí-las na conferência mesmo assim?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="text-sm space-y-1 max-h-60 overflow-auto bg-muted/40 rounded p-3">
            {filiaisPendentes.map((p, i) => (
              <li key={i} className="font-mono text-xs">
                <strong>{p.arquivo}</strong> — {p.setor}{p.unidade ? ` (${p.unidade})` : ""} · CNPJ {p.cnpj}
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => responderFiliais(false)}>Ignorar filiais</AlertDialogCancel>
            <AlertDialogAction onClick={() => responderFiliais(true)}>Incluir todas</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value, variant }: { label: string; value: string; variant?: "ok" | "warn" }) {
  const color = variant === "warn" ? "text-destructive" : variant === "ok" ? "text-success" : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function UploadBox({
  icon, title, hint, accept, multiple, files, onFiles, onRemove,
}: {
  icon: React.ReactNode; title: string; hint: string; accept: string; multiple?: boolean;
  files: File[]; onFiles: (fs: File[]) => void; onRemove: (idx: number) => void;
}) {
  const id = `up-${title.replace(/\s/g, "")}`;
  return (
    <div className="border-2 border-dashed border-border rounded-lg p-4 space-y-3 hover:border-primary/50 transition-colors">
      <div className="flex items-center gap-2 text-sm font-semibold">
        {icon}{title}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <input id={id} type="file" accept={accept} multiple={multiple} className="hidden"
        onChange={(e) => {
          const fs = Array.from(e.target.files ?? []);
          if (fs.length > 0) onFiles(fs);
          e.target.value = "";
        }} />
      <label htmlFor={id}>
        <Button asChild variant="outline" size="sm" className="w-full cursor-pointer">
          <span>Selecionar arquivo{multiple ? "s" : ""}</span>
        </Button>
      </label>
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, idx) => (
            <li key={idx} className="flex items-center justify-between text-xs bg-muted rounded px-2 py-1.5">
              <span className="truncate" title={f.name}>{f.name}</span>
              <button type="button" onClick={() => onRemove(idx)} className="text-muted-foreground hover:text-destructive ml-2"><X className="h-3 w-3" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type EtapaIdLocal = "pdf" | "planilhas" | "esocial" | "conferindo" | "salvando" | "redirecionando";
type EtapaStatusLocal = "pending" | "running" | "done" | "error";

function ProgressoEtapas({
  etapas,
  estado,
}: {
  etapas: { id: EtapaIdLocal; label: string }[];
  estado: Record<EtapaIdLocal, { status: EtapaStatusLocal; detalhe?: string }>;
}) {
  const concluidas = etapas.filter((e) => estado[e.id].status === "done").length;
  const total = etapas.length;
  const pct = Math.round((concluidas / total) * 100);
  const temErro = etapas.some((e) => estado[e.id].status === "error");

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Progresso da conferência</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {temErro
              ? "Erro durante o processamento — veja a etapa em vermelho"
              : concluidas === total
              ? "Concluído"
              : `${concluidas} de ${total} etapas concluídas`}
          </p>
        </div>
        <span className="text-2xl font-bold tabular-nums">{pct}%</span>
      </div>
      <Progress value={pct} className={temErro ? "[&>div]:bg-destructive" : ""} />
      <ol className="space-y-2">
        {etapas.map((e) => {
          const st = estado[e.id];
          const icon =
            st.status === "done" ? (
              <Check className="h-4 w-4 text-success" />
            ) : st.status === "running" ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : st.status === "error" ? (
              <X className="h-4 w-4 text-destructive" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground/40" />
            );
          const textColor =
            st.status === "done"
              ? "text-foreground"
              : st.status === "running"
              ? "text-foreground font-medium"
              : st.status === "error"
              ? "text-destructive font-medium"
              : "text-muted-foreground";
          return (
            <li key={e.id} className="flex items-center gap-3 text-sm">
              <span className="flex-shrink-0">{icon}</span>
              <span className={textColor}>{e.label}</span>
              {st.detalhe && (
                <span className="text-xs text-muted-foreground ml-auto truncate max-w-[50%]" title={st.detalhe}>
                  {st.detalhe}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
