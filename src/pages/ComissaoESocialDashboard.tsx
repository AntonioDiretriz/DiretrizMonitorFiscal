import { Link, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fmtBR, normalizeName } from "@/lib/normalize";
import { ArrowDown, ArrowUp, Minus, Users, Banknote, TrendingUp, Gift, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export interface ItemRow {
  id: string;
  cpf: string | null;
  matricula: string | null;
  nome: string;
  setor: string | null;
  comissao_pdf: number;
  gratificacao_pdf: number;
  gratificacao_nps_pdf: number;
  premio_pdf: number;
  adiant_premio_pdf: number;
  comissao_planilha: number;
  gratificacao_planilha: number;
  gratificacao_nps_planilha: number;
  premio_planilha: number;
  adiant_premio_planilha: number;
  salario_base: number;
  vale_transporte: number;
  vale_refeicao: number;
  plano_saude: number;
  base_inss: number;
  valor_fgts: number;
  emprestimos_pdf: number;
  emprestimos_esocial_qtd: number;
  bancos_esocial: unknown;
  status: string;
  divergencias: unknown;
}

export interface EmprestimoRow {
  id: string;
  item_id: string;
  banco: string | null;
  numero_contrato: string | null;
  parcela: number;
}

export interface ConferenciaRow {
  id: string;
  competencia: string;
  empresa: string | null;
  cnpj: string | null;
  total_funcionarios: number;
  total_divergencias: number;
}

export interface DashState {
  atual: ConferenciaRow;
  anterior: ConferenciaRow | null;
  itensAtual: ItemRow[];
  itensAnterior: ItemRow[];
  emprestimosAtual: EmprestimoRow[];
}

function valorConferido(pdf: number | null | undefined, planilha: number | null | undefined) {
  return Math.max(Number(pdf ?? 0), Number(planilha ?? 0));
}

function totalPdf(row: ItemRow) {
  return [
    row.comissao_pdf,
    row.gratificacao_pdf,
    row.gratificacao_nps_pdf,
    row.premio_pdf,
    row.adiant_premio_pdf,
    row.salario_base,
    row.vale_transporte,
    row.vale_refeicao,
    row.plano_saude,
    row.base_inss,
    row.valor_fgts,
    row.emprestimos_pdf,
  ].reduce((acc, value) => acc + Number(value ?? 0), 0);
}

function totalPlanilha(row: ItemRow) {
  return [
    row.comissao_planilha,
    row.gratificacao_planilha,
    row.gratificacao_nps_planilha,
    row.premio_planilha,
    row.adiant_premio_planilha,
  ].reduce((acc, value) => acc + Number(value ?? 0), 0);
}

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

function deveMesclarItens(atual: ItemRow, candidato: ItemRow) {
  if (atual.cpf && candidato.cpf && atual.cpf === candidato.cpf) return true;
  if (atual.matricula && candidato.matricula && atual.matricula === candidato.matricula) return true;
  if (!nomesCompativeis(atual.nome, candidato.nome)) return false;

  const atualSoPdf = totalPdf(atual) > 0 && totalPlanilha(atual) === 0;
  const atualSoPlanilha = totalPlanilha(atual) > 0 && totalPdf(atual) === 0;
  const candSoPdf = totalPdf(candidato) > 0 && totalPlanilha(candidato) === 0;
  const candSoPlanilha = totalPlanilha(candidato) > 0 && totalPdf(candidato) === 0;
  const complementar = (atualSoPdf && candSoPlanilha) || (atualSoPlanilha && candSoPdf);
  const identidadeIncompleta = !atual.cpf || !candidato.cpf || !atual.matricula || !candidato.matricula;

  return complementar && identidadeIncompleta;
}

function mesclarItens(base: ItemRow, extra: ItemRow): ItemRow {
  const divergencias = [...new Set([...(Array.isArray(base.divergencias) ? base.divergencias as string[] : []), ...(Array.isArray(extra.divergencias) ? extra.divergencias as string[] : [])])];
  const bancos = [...new Set([...(Array.isArray(base.bancos_esocial) ? base.bancos_esocial as string[] : []), ...(Array.isArray(extra.bancos_esocial) ? extra.bancos_esocial as string[] : [])])];
  const nome = normalizeName(extra.nome).length > normalizeName(base.nome).length ? extra.nome : base.nome;

  return {
    ...base,
    cpf: base.cpf ?? extra.cpf,
    matricula: base.matricula ?? extra.matricula,
    nome,
    setor: base.setor ?? extra.setor,
    comissao_pdf: valorConferido(base.comissao_pdf, extra.comissao_pdf),
    gratificacao_pdf: valorConferido(base.gratificacao_pdf, extra.gratificacao_pdf),
    gratificacao_nps_pdf: valorConferido(base.gratificacao_nps_pdf, extra.gratificacao_nps_pdf),
    premio_pdf: valorConferido(base.premio_pdf, extra.premio_pdf),
    adiant_premio_pdf: valorConferido(base.adiant_premio_pdf, extra.adiant_premio_pdf),
    comissao_planilha: valorConferido(base.comissao_planilha, extra.comissao_planilha),
    gratificacao_planilha: valorConferido(base.gratificacao_planilha, extra.gratificacao_planilha),
    gratificacao_nps_planilha: valorConferido(base.gratificacao_nps_planilha, extra.gratificacao_nps_planilha),
    premio_planilha: valorConferido(base.premio_planilha, extra.premio_planilha),
    adiant_premio_planilha: valorConferido(base.adiant_premio_planilha, extra.adiant_premio_planilha),
    salario_base: valorConferido(base.salario_base, extra.salario_base),
    vale_transporte: valorConferido(base.vale_transporte, extra.vale_transporte),
    vale_refeicao: valorConferido(base.vale_refeicao, extra.vale_refeicao),
    plano_saude: valorConferido(base.plano_saude, extra.plano_saude),
    base_inss: valorConferido(base.base_inss, extra.base_inss),
    valor_fgts: valorConferido(base.valor_fgts, extra.valor_fgts),
    emprestimos_pdf: valorConferido(base.emprestimos_pdf, extra.emprestimos_pdf),
    emprestimos_esocial_qtd: valorConferido(base.emprestimos_esocial_qtd, extra.emprestimos_esocial_qtd),
    bancos_esocial: bancos,
    status: base.status === "divergente" || extra.status === "divergente"
      ? "divergente"
      : base.status === "ok" || extra.status === "ok"
        ? "ok"
        : "so_planilha",
    divergencias,
  };
}

function consolidarItens(rows: ItemRow[]) {
  const itens: ItemRow[] = [];
  const idMap = new Map<string, string>();

  for (const row of rows) {
    const idx = itens.findIndex((existente) => deveMesclarItens(existente, row));
    if (idx === -1) {
      itens.push({ ...row });
      idMap.set(row.id, row.id);
      continue;
    }

    itens[idx] = mesclarItens(itens[idx], row);
    idMap.set(row.id, itens[idx].id);
  }

  return { itens, idMap };
}

export default function DashboardPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<DashState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState("geral");
  const [colSel, setColSel] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    (async () => {
      setLoading(true);
      try {
        const { data: conf, error: e1 } = await (supabase as any)
          .from("conferencias").select("*").eq("id", id).single();
        if (e1 || !conf) throw e1 ?? new Error("Conferência não encontrada");

        const { data: itens, error: e2 } = await (supabase as any)
          .from("conferencia_itens").select("*").eq("conferencia_id", id);
        if (e2) throw e2;

        const { data: emps, error: e3 } = await (supabase as any)
          .from("conferencia_emprestimos").select("*").eq("conferencia_id", id);
        if (e3) throw e3;

        // Buscar competência anterior do mesmo CNPJ
        let anterior: ConferenciaRow | null = null;
        let itensAnt: ItemRow[] = [];
        if (conf.cnpj && conf.competencia) {
          const compAnt = competenciaAnterior(conf.competencia);
          if (compAnt) {
            const { data: prev } = await (supabase as any)
              .from("conferencias")
              .select("*")
              .eq("cnpj", conf.cnpj)
              .eq("competencia", compAnt)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (prev) {
              anterior = prev as ConferenciaRow;
              const { data: itAnt } = await (supabase as any)
                .from("conferencia_itens").select("*").eq("conferencia_id", prev.id);
              itensAnt = (itAnt as ItemRow[]) ?? [];
            }
          }
        }

        const itensAtualConsolidados = consolidarItens((itens as ItemRow[]) ?? []);
        const itensAnteriorConsolidados = consolidarItens(itensAnt);

        setData({
          atual: conf as ConferenciaRow,
          anterior,
          itensAtual: itensAtualConsolidados.itens,
          itensAnterior: itensAnteriorConsolidados.itens,
          emprestimosAtual: ((emps as EmprestimoRow[]) ?? []).map((emp) => ({
            ...emp,
            item_id: itensAtualConsolidados.idMap.get(emp.item_id) ?? emp.item_id,
          })),
        });
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Erro ao carregar dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, user, authLoading]);

  const merged = useMemo(() => {
    if (!data) return [];
    const ant = new Map<string, ItemRow>();
    for (const it of data.itensAnterior) {
      const k = it.cpf || it.matricula || it.nome;
      if (k) ant.set(k, it);
    }
    return data.itensAtual.map((cur) => {
      const k = cur.cpf || cur.matricula || cur.nome;
      const prev = k ? ant.get(k) ?? null : null;
      return { cur, prev };
    });
  }, [data]);

  const empPorItem = useMemo(() => {
    const m = new Map<string, EmprestimoRow[]>();
    if (!data) return m;
    for (const e of data.emprestimosAtual) {
      if (!m.has(e.item_id)) m.set(e.item_id, []);
      m.get(e.item_id)!.push(e);
    }
    return m;
  }, [data]);

  const totais = useMemo(() => {
    if (!data) return null;
      const sumItem = (rows: ItemRow[]) => ({
      func: rows.length,
      empQtd: rows.reduce((a, r) => a + (r.emprestimos_esocial_qtd ?? 0), 0),
      empVal: rows.reduce((a, r) => a + Number(r.emprestimos_pdf ?? 0), 0),
        comissao: rows.reduce((a, r) => a + valorConferido(r.comissao_pdf, r.comissao_planilha), 0),
        gratif: rows.reduce((a, r) => a + valorConferido(r.gratificacao_pdf, r.gratificacao_planilha) + valorConferido(r.gratificacao_nps_pdf, r.gratificacao_nps_planilha), 0),
        premio: rows.reduce((a, r) => a + valorConferido(r.premio_pdf, r.premio_planilha) + valorConferido(r.adiant_premio_pdf, r.adiant_premio_planilha), 0),
      benef: rows.reduce((a, r) => a + Number(r.vale_transporte ?? 0) + Number(r.vale_refeicao ?? 0) + Number(r.plano_saude ?? 0), 0),
      inss: rows.reduce((a, r) => a + Number(r.base_inss ?? 0), 0),
      fgts: rows.reduce((a, r) => a + Number(r.valor_fgts ?? 0), 0),
      aLancar: rows.reduce((a, r) => a + Number(r.comissao_planilha ?? 0) + Number(r.gratificacao_planilha ?? 0) + Number(r.gratificacao_nps_planilha ?? 0) + Number(r.premio_planilha ?? 0) + Number(r.adiant_premio_planilha ?? 0), 0),
    });
    return { atual: sumItem(data.itensAtual), anterior: data.itensAnterior.length ? sumItem(data.itensAnterior) : null };
  }, [data]);

  const filtrados = useMemo(() => {
    if (!busca) return merged;
    const q = busca.toLowerCase();
    return merged.filter(({ cur }) =>
      cur.nome.toLowerCase().includes(q) ||
      (cur.matricula ?? "").includes(q) ||
      (cur.cpf ?? "").includes(q),
    );
  }, [merged, busca]);

  if (loading || !data || !totais) {
    return <div className="p-8 text-muted-foreground">Carregando dashboard…</div>;
  }

  const colaboradorSelecionado = colSel ? merged.find((m) => m.cur.id === colSel) ?? null : null;

  return (
    <div className="p-8 space-y-6 max-w-[1500px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{data.atual.empresa ?? "Empresa"}</h1>
          <p className="text-muted-foreground text-sm">
            CNPJ {data.atual.cnpj ?? "—"} · Competência <strong>{data.atual.competencia}</strong>
            {data.anterior
              ? <> · Comparando com <strong>{data.anterior.competencia}</strong></>
              : <span className="text-amber-600"> · Sem mês anterior salvo para comparar</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/comissao-esocial/historico" className="text-sm underline text-muted-foreground">Histórico</Link>
          <Link to="/comissao-esocial" className="text-sm underline text-muted-foreground">Nova conferência</Link>
        </div>
      </header>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="grid grid-cols-6 w-full max-w-4xl">
          <TabsTrigger value="geral">Visão Geral</TabsTrigger>
          <TabsTrigger value="alancar">A Lançar</TabsTrigger>
          <TabsTrigger value="emprestimos">Empréstimos</TabsTrigger>
          <TabsTrigger value="comissoes">Comissões</TabsTrigger>
          <TabsTrigger value="beneficios">Benefícios</TabsTrigger>
          <TabsTrigger value="conferencia">Conferência</TabsTrigger>
        </TabsList>

        {/* ================== VISÃO GERAL ================== */}
        <TabsContent value="geral" className="space-y-4 mt-4">
          <div className="grid md:grid-cols-4 gap-4">
            <Kpi label="Funcionários" value={totais.atual.func} prev={totais.anterior?.func} icon={<Users className="h-4 w-4" />} />
            <Kpi label="Empréstimos (qtd)" value={totais.atual.empQtd} prev={totais.anterior?.empQtd} icon={<Banknote className="h-4 w-4" />} />
            <Kpi label="Empréstimos (R$)" value={totais.atual.empVal} prev={totais.anterior?.empVal} money icon={<Banknote className="h-4 w-4" />} />
            <Kpi label="Comissão (R$)" value={totais.atual.comissao} prev={totais.anterior?.comissao} money icon={<TrendingUp className="h-4 w-4" />} />
            <Kpi label="Gratificação (R$)" value={totais.atual.gratif} prev={totais.anterior?.gratif} money icon={<Gift className="h-4 w-4" />} />
            <Kpi label="Prêmio (R$)" value={totais.atual.premio} prev={totais.anterior?.premio} money />
            <Kpi label="Benefícios (VT+VR+Saúde)" value={totais.atual.benef} prev={totais.anterior?.benef} money />
            <Kpi label="Base INSS" value={totais.atual.inss} prev={totais.anterior?.inss} money />
            <Kpi label="Valor FGTS" value={totais.atual.fgts} prev={totais.anterior?.fgts} money />
          </div>

          <Card className="p-4">
            <Input placeholder="Buscar nome, matrícula ou CPF…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-md mb-3" />
            <div className="overflow-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr className="text-left">
                    <th className="p-2">Nome</th>
                    <th className="p-2">Mat.</th>
                    <th className="p-2">Setor</th>
                    <th className="p-2 text-center">Empréstimos (qtd)</th>
                    <th className="p-2 text-right">Empréstimos (R$)</th>
                    <th className="p-2 text-right">Comissão</th>
                    <th className="p-2 text-right">Δ Comissão vs ant.</th>
                    <th className="p-2 text-right">Gratificação</th>
                    <th className="p-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(({ cur, prev }) => {
                    const comAtual = valorConferido(cur.comissao_pdf, cur.comissao_planilha);
                    const comPrev = valorConferido(prev?.comissao_pdf, prev?.comissao_planilha);
                    const dC = comAtual - comPrev;
                    const grat = valorConferido(cur.gratificacao_pdf, cur.gratificacao_planilha) + valorConferido(cur.gratificacao_nps_pdf, cur.gratificacao_nps_planilha);
                    return (
                      <tr key={cur.id} onClick={() => setColSel(cur.id)} className="border-t hover:bg-muted/40 cursor-pointer">
                        <td className="p-2 font-medium">{cur.nome}</td>
                        <td className="p-2">{cur.matricula ?? "—"}</td>
                        <td className="p-2 text-xs text-muted-foreground">{cur.setor ?? "—"}</td>
                        <td className="p-2 text-center">{cur.emprestimos_esocial_qtd > 0 ? <Badge variant="secondary">{cur.emprestimos_esocial_qtd}</Badge> : "—"}</td>
                        <td className="p-2 text-right tabular-nums">{Number(cur.emprestimos_pdf) > 0 ? fmtBR(Number(cur.emprestimos_pdf)) : "—"}</td>
                        <td className="p-2 text-right tabular-nums">{fmtBR(comAtual)}</td>
                        <td className="p-2 text-right"><Delta value={dC} money /></td>
                        <td className="p-2 text-right tabular-nums">{fmtBR(grat)}</td>
                        <td className="p-2 text-center">
                          {cur.status === "ok"
                            ? <CheckCircle2 className="h-4 w-4 text-success inline" />
                            : cur.status === "so_planilha"
                              ? <Badge variant="outline" className="border-blue-500/40 text-blue-600 bg-blue-500/5 text-xs">A lançar</Badge>
                              : <AlertTriangle className="h-4 w-4 text-destructive inline" />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ================== A LANÇAR ================== */}
        <TabsContent value="alancar" className="space-y-4 mt-4">
          <ALancarTab itens={data.itensAtual} competencia={data.atual.competencia} empresa={data.atual.empresa ?? ""} />
        </TabsContent>

        {/* ================== EMPRÉSTIMOS ================== */}
        <TabsContent value="emprestimos" className="space-y-4 mt-4">
          <div className="grid md:grid-cols-3 gap-4">
            <Kpi label="Total contratos (eSocial)" value={totais.atual.empQtd} prev={totais.anterior?.empQtd} />
            <Kpi label="Soma parcelas (PDF)" value={totais.atual.empVal} prev={totais.anterior?.empVal} money />
            <Kpi label="Funcionários com empréstimo" value={data.itensAtual.filter(i => i.emprestimos_esocial_qtd > 0).length} />
          </div>
          <Card className="p-4">
            <Input placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-md mb-3" />
            <div className="overflow-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr className="text-left">
                    <th className="p-2">Nome</th>
                    <th className="p-2 text-center">Qtd atual</th>
                    <th className="p-2 text-center">Qtd ant.</th>
                    <th className="p-2 text-center">Δ</th>
                    <th className="p-2">Bancos</th>
                    <th className="p-2 text-right">Soma parcelas</th>
                    <th className="p-2 text-right">Δ R$</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados
                    .filter(({ cur }) => cur.emprestimos_esocial_qtd > 0 || Number(cur.emprestimos_pdf) > 0)
                    .map(({ cur, prev }) => {
                      const bancos = Array.isArray(cur.bancos_esocial) ? (cur.bancos_esocial as string[]) : [];
                      const dQ = Number(cur.emprestimos_esocial_qtd) - Number(prev?.emprestimos_esocial_qtd ?? 0);
                      const dV = Number(cur.emprestimos_pdf) - Number(prev?.emprestimos_pdf ?? 0);
                      return (
                        <tr key={cur.id} onClick={() => setColSel(cur.id)} className="border-t hover:bg-muted/40 cursor-pointer">
                          <td className="p-2 font-medium">{cur.nome}</td>
                          <td className="p-2 text-center">{cur.emprestimos_esocial_qtd}</td>
                          <td className="p-2 text-center text-muted-foreground">{prev?.emprestimos_esocial_qtd ?? "—"}</td>
                          <td className="p-2 text-center"><Delta value={dQ} /></td>
                          <td className="p-2 text-xs">{bancos.length ? bancos.slice(0, 3).join(", ") + (bancos.length > 3 ? "…" : "") : "—"}</td>
                          <td className="p-2 text-right tabular-nums">{fmtBR(Number(cur.emprestimos_pdf))}</td>
                          <td className="p-2 text-right"><Delta value={dV} money /></td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ================== COMISSÕES ================== */}
        <TabsContent value="comissoes" className="space-y-4 mt-4">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-2">Valores vindos das planilhas dos setores — devem ser lançados na próxima folha.</p>
            <Input placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-md mb-3" />
            <div className="overflow-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr className="text-left">
                    <th className="p-2">Nome</th>
                    <th className="p-2">Setor</th>
                    <th className="p-2 text-right">Comissão 37</th>
                    <th className="p-2 text-right">Gratif. 20</th>
                    <th className="p-2 text-right">NPS 286</th>
                    <th className="p-2 text-right">Prêmio 219</th>
                    <th className="p-2 text-right">Adiant. 241</th>
                    <th className="p-2 text-right font-bold">Total a lançar</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(({ cur }) => {
                    const com = valorConferido(cur.comissao_planilha, cur.comissao_pdf);
                    const g20 = valorConferido(cur.gratificacao_planilha, cur.gratificacao_pdf);
                    const nps = valorConferido(cur.gratificacao_nps_planilha, cur.gratificacao_nps_pdf);
                    const prm = valorConferido(cur.premio_planilha, cur.premio_pdf);
                    const adi = valorConferido(cur.adiant_premio_planilha, cur.adiant_premio_pdf);
                    const total = com + g20 + nps + prm + adi;
                    if (total === 0) return null;
                    return (
                      <tr key={cur.id} onClick={() => setColSel(cur.id)} className="border-t hover:bg-muted/40 cursor-pointer">
                        <td className="p-2 font-medium">{cur.nome}</td>
                        <td className="p-2 text-xs text-muted-foreground">{cur.setor ?? "—"}</td>
                        <td className="p-2 text-right tabular-nums">{fmtBR(com)}</td>
                        <td className="p-2 text-right tabular-nums">{fmtBR(g20)}</td>
                        <td className="p-2 text-right tabular-nums">{fmtBR(nps)}</td>
                        <td className="p-2 text-right tabular-nums">{fmtBR(prm)}</td>
                        <td className="p-2 text-right tabular-nums">{fmtBR(adi)}</td>
                        <td className="p-2 text-right tabular-nums font-bold">{fmtBR(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ================== BENEFÍCIOS ================== */}
        <TabsContent value="beneficios" className="space-y-4 mt-4">
          <Card className="p-4">
            <Input placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-md mb-3" />
            <div className="overflow-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr className="text-left">
                    <th className="p-2">Nome</th>
                    <th className="p-2 text-right">Salário-base</th>
                    <th className="p-2 text-right">VT</th>
                    <th className="p-2 text-right">Δ</th>
                    <th className="p-2 text-right">VR/VA</th>
                    <th className="p-2 text-right">Δ</th>
                    <th className="p-2 text-right">Plano saúde</th>
                    <th className="p-2 text-right">Δ</th>
                    <th className="p-2 text-right">Base INSS</th>
                    <th className="p-2 text-right">Δ</th>
                    <th className="p-2 text-right">FGTS</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(({ cur, prev }) => (
                    <tr key={cur.id} onClick={() => setColSel(cur.id)} className="border-t hover:bg-muted/40 cursor-pointer">
                      <td className="p-2 font-medium">{cur.nome}</td>
                      <td className="p-2 text-right tabular-nums">{fmtBR(Number(cur.salario_base))}</td>
                      <td className="p-2 text-right tabular-nums">{fmtBR(Number(cur.vale_transporte))}</td>
                      <td className="p-2 text-right"><Delta value={Number(cur.vale_transporte) - Number(prev?.vale_transporte ?? 0)} money /></td>
                      <td className="p-2 text-right tabular-nums">{fmtBR(Number(cur.vale_refeicao))}</td>
                      <td className="p-2 text-right"><Delta value={Number(cur.vale_refeicao) - Number(prev?.vale_refeicao ?? 0)} money /></td>
                      <td className="p-2 text-right tabular-nums">{fmtBR(Number(cur.plano_saude))}</td>
                      <td className="p-2 text-right"><Delta value={Number(cur.plano_saude) - Number(prev?.plano_saude ?? 0)} money /></td>
                      <td className="p-2 text-right tabular-nums">{fmtBR(Number(cur.base_inss))}</td>
                      <td className="p-2 text-right"><Delta value={Number(cur.base_inss) - Number(prev?.base_inss ?? 0)} money /></td>
                      <td className="p-2 text-right tabular-nums">{fmtBR(Number(cur.valor_fgts))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ================== CONFERÊNCIA ================== */}
        <TabsContent value="conferencia" className="space-y-4 mt-4">
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-3">
              {data.atual.total_divergencias} divergências de {data.atual.total_funcionarios} funcionários conferidos.
            </p>
            <div className="overflow-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr className="text-left">
                    <th className="p-2">Status</th>
                    <th className="p-2">Nome</th>
                    <th className="p-2">Setor</th>
                    <th className="p-2">Divergências</th>
                  </tr>
                </thead>
                <tbody>
                  {data.itensAtual.filter(i => i.status !== "ok").map((i) => {
                    const divs = Array.isArray(i.divergencias) ? (i.divergencias as string[]) : [];
                    return (
                      <tr key={i.id} onClick={() => setColSel(i.id)} className="border-t hover:bg-muted/40 cursor-pointer">
                        <td className="p-2"><Badge variant="outline" className="border-destructive/40 text-destructive bg-destructive/5">{i.status}</Badge></td>
                        <td className="p-2 font-medium">{i.nome}</td>
                        <td className="p-2 text-xs text-muted-foreground">{i.setor ?? "—"}</td>
                        <td className="p-2 text-xs">{divs.join(" · ")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Drawer de detalhe do colaborador */}
      <Sheet open={!!colSel} onOpenChange={(o) => !o && setColSel(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-auto">
          {colaboradorSelecionado && (
            <ColaboradorDetalhe
              cur={colaboradorSelecionado.cur}
              prev={colaboradorSelecionado.prev}
              emprestimos={empPorItem.get(colaboradorSelecionado.cur.id) ?? []}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ColaboradorDetalhe({ cur, prev, emprestimos }: { cur: ItemRow; prev: ItemRow | null; emprestimos: EmprestimoRow[] }) {
  const bancos = Array.isArray(cur.bancos_esocial) ? (cur.bancos_esocial as string[]) : [];
  return (
    <>
      <SheetHeader>
        <SheetTitle>{cur.nome}</SheetTitle>
        <p className="text-xs text-muted-foreground">
          Mat. {cur.matricula ?? "—"} · CPF {cur.cpf ?? "—"} · {cur.setor ?? "Sem setor"}
        </p>
      </SheetHeader>
      <div className="mt-4 space-y-4">
        <Section title="Comissões e gratificações (a lançar)">
          <Linha label="Comissão (37)" value={valorConferido(cur.comissao_planilha, cur.comissao_pdf)} prev={valorConferido(prev?.comissao_planilha, prev?.comissao_pdf)} />
          <Linha label="Gratificação (20)" value={valorConferido(cur.gratificacao_planilha, cur.gratificacao_pdf)} prev={valorConferido(prev?.gratificacao_planilha, prev?.gratificacao_pdf)} />
          <Linha label="Gratificação NPS (286)" value={valorConferido(cur.gratificacao_nps_planilha, cur.gratificacao_nps_pdf)} prev={valorConferido(prev?.gratificacao_nps_planilha, prev?.gratificacao_nps_pdf)} />
          <Linha label="Prêmio (219)" value={valorConferido(cur.premio_planilha, cur.premio_pdf)} prev={valorConferido(prev?.premio_planilha, prev?.premio_pdf)} />
          <Linha label="Adiant. Prêmio (241)" value={valorConferido(cur.adiant_premio_planilha, cur.adiant_premio_pdf)} prev={valorConferido(prev?.adiant_premio_planilha, prev?.adiant_premio_pdf)} />
        </Section>

        <Section title="Empréstimos consignados">
          <Linha label="Qtd contratos (eSocial)" value={cur.emprestimos_esocial_qtd} prev={prev?.emprestimos_esocial_qtd ?? 0} integer />
          <Linha label="Soma parcelas (PDF)" value={Number(cur.emprestimos_pdf)} prev={Number(prev?.emprestimos_pdf ?? 0)} />
          {bancos.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2">Bancos: {bancos.join(", ")}</p>
          )}
          {emprestimos.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs font-semibold">Contratos detalhados (PDF):</p>
              <ul className="text-xs space-y-1">
                {emprestimos.map((e) => (
                  <li key={e.id} className="flex justify-between bg-muted/40 rounded px-2 py-1">
                    <span>{e.banco ?? "—"} {e.numero_contrato ? `· ${e.numero_contrato}` : ""}</span>
                    <span className="tabular-nums">R$ {fmtBR(Number(e.parcela))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        <Section title="Benefícios">
          <Linha label="Vale-Transporte" value={Number(cur.vale_transporte)} prev={Number(prev?.vale_transporte ?? 0)} />
          <Linha label="Vale-Refeição/Alimentação" value={Number(cur.vale_refeicao)} prev={Number(prev?.vale_refeicao ?? 0)} />
          <Linha label="Plano de Saúde" value={Number(cur.plano_saude)} prev={Number(prev?.plano_saude ?? 0)} />
        </Section>

        <Section title="Bases">
          <Linha label="Salário-base" value={Number(cur.salario_base)} prev={Number(prev?.salario_base ?? 0)} />
          <Linha label="Base INSS" value={Number(cur.base_inss)} prev={Number(prev?.base_inss ?? 0)} />
          <Linha label="Valor FGTS" value={Number(cur.valor_fgts)} prev={Number(prev?.valor_fgts ?? 0)} />
        </Section>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-md p-3">
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Linha({ label, value, prev, integer }: { label: string; value: number; prev: number; integer?: boolean }) {
  const d = value - prev;
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums flex items-center gap-2">
        <span>{integer ? value : `R$ ${fmtBR(value)}`}</span>
        <Delta value={d} money={!integer} />
      </span>
    </div>
  );
}

function Kpi({ label, value, prev, money, icon }: { label: string; value: number; prev?: number; money?: boolean; icon?: React.ReactNode }) {
  const d = prev !== undefined ? value - prev : null;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>{icon}
      </div>
      <p className="text-2xl font-bold mt-1 tabular-nums">{money ? `R$ ${fmtBR(value)}` : value.toLocaleString("pt-BR")}</p>
      {d !== null && (
        <div className="text-xs mt-1 flex items-center gap-1">
          <Delta value={d} money={money} />
          <span className="text-muted-foreground">vs anterior ({money ? `R$ ${fmtBR(prev!)}` : prev!.toLocaleString("pt-BR")})</span>
        </div>
      )}
    </Card>
  );
}

function Delta({ value, money }: { value: number; money?: boolean }) {
  const tol = money ? 0.05 : 0;
  if (Math.abs(value) <= tol) return <span className="text-muted-foreground inline-flex items-center gap-0.5"><Minus className="h-3 w-3" />0</span>;
  const pos = value > 0;
  const cls = pos ? "text-emerald-600" : "text-rose-600";
  const Icon = pos ? ArrowUp : ArrowDown;
  const txt = money ? `R$ ${fmtBR(Math.abs(value))}` : Math.abs(value).toLocaleString("pt-BR");
  return <span className={`inline-flex items-center gap-0.5 font-semibold ${cls}`}><Icon className="h-3 w-3" />{pos ? "+" : "−"}{txt}</span>;
}

function competenciaAnterior(comp: string): string | null {
  // Aceita "MM/AAAA" ou "AAAA-MM"
  const m = comp.match(/^(\d{2})[\/-](\d{4})$/);
  if (m) {
    let mm = parseInt(m[1], 10) - 1;
    let yy = parseInt(m[2], 10);
    if (mm === 0) { mm = 12; yy -= 1; }
    return `${String(mm).padStart(2, "0")}/${yy}`;
  }
  const m2 = comp.match(/^(\d{4})[\/-](\d{2})$/);
  if (m2) {
    let yy = parseInt(m2[1], 10);
    let mm = parseInt(m2[2], 10) - 1;
    if (mm === 0) { mm = 12; yy -= 1; }
    return `${yy}-${String(mm).padStart(2, "0")}`;
  }
  return null;
}

function ALancarTab({ itens, competencia, empresa }: { itens: ItemRow[]; competencia: string; empresa: string }) {
  const linhas = itens
      .map((i) => {
        const com = valorConferido(i.comissao_planilha, i.comissao_pdf);
        const g20 = valorConferido(i.gratificacao_planilha, i.gratificacao_pdf);
        const nps = valorConferido(i.gratificacao_nps_planilha, i.gratificacao_nps_pdf);
        const prm = valorConferido(i.premio_planilha, i.premio_pdf);
        const adi = valorConferido(i.adiant_premio_planilha, i.adiant_premio_pdf);
      const total = com + g20 + nps + prm + adi;
      return { i, com, g20, nps, prm, adi, total };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  const totGeral = linhas.reduce(
    (acc, r) => ({
      com: acc.com + r.com, g20: acc.g20 + r.g20, nps: acc.nps + r.nps,
      prm: acc.prm + r.prm, adi: acc.adi + r.adi, total: acc.total + r.total,
    }),
    { com: 0, g20: 0, nps: 0, prm: 0, adi: 0, total: 0 }
  );

  const exportar = () => {
    const header = ["Matrícula", "CPF", "Nome", "Setor", "Comissão (37)", "Gratif. 20", "NPS 286", "Prêmio 219", "Adiant. 241", "Total a lançar"];
    const rows = linhas.map((r) => [
      r.i.matricula ?? "", r.i.cpf ?? "", r.i.nome, r.i.setor ?? "",
      r.com.toFixed(2), r.g20.toFixed(2), r.nps.toFixed(2), r.prm.toFixed(2), r.adi.toFixed(2), r.total.toFixed(2),
    ]);
    const csv = [header, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `a-lancar-${empresa.replace(/\W+/g, "_")}-${competencia.replace(/\W+/g, "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Valores a lançar na folha</h2>
          <p className="text-xs text-muted-foreground">
            {linhas.length} colaboradores · Total: <strong className="text-foreground">R$ {fmtBR(totGeral.total)}</strong>
          </p>
        </div>
        <button onClick={exportar} className="text-sm px-3 py-1.5 rounded-md border hover:bg-muted">Exportar CSV</button>
      </div>

      <div className="overflow-auto border rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr className="text-left">
              <th className="p-2">Mat.</th>
              <th className="p-2">Nome</th>
              <th className="p-2">Setor</th>
              <th className="p-2 text-right">Comissão 37</th>
              <th className="p-2 text-right">Gratif. 20</th>
              <th className="p-2 text-right">NPS 286</th>
              <th className="p-2 text-right">Prêmio 219</th>
              <th className="p-2 text-right">Adiant. 241</th>
              <th className="p-2 text-right font-bold">Total</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((r) => (
              <tr key={r.i.id} className="border-t hover:bg-muted/40">
                <td className="p-2">{r.i.matricula ?? "—"}</td>
                <td className="p-2 font-medium">{r.i.nome}</td>
                <td className="p-2 text-xs text-muted-foreground">{r.i.setor ?? "—"}</td>
                <td className="p-2 text-right tabular-nums">{r.com > 0 ? fmtBR(r.com) : "—"}</td>
                <td className="p-2 text-right tabular-nums">{r.g20 > 0 ? fmtBR(r.g20) : "—"}</td>
                <td className="p-2 text-right tabular-nums">{r.nps > 0 ? fmtBR(r.nps) : "—"}</td>
                <td className="p-2 text-right tabular-nums">{r.prm > 0 ? fmtBR(r.prm) : "—"}</td>
                <td className="p-2 text-right tabular-nums">{r.adi > 0 ? fmtBR(r.adi) : "—"}</td>
                <td className="p-2 text-right tabular-nums font-bold">{fmtBR(r.total)}</td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Nenhum valor a lançar nesta competência.</td></tr>
            )}
          </tbody>
          {linhas.length > 0 && (
            <tfoot className="bg-muted/60 font-semibold">
              <tr>
                <td className="p-2" colSpan={3}>Total geral</td>
                <td className="p-2 text-right tabular-nums">{fmtBR(totGeral.com)}</td>
                <td className="p-2 text-right tabular-nums">{fmtBR(totGeral.g20)}</td>
                <td className="p-2 text-right tabular-nums">{fmtBR(totGeral.nps)}</td>
                <td className="p-2 text-right tabular-nums">{fmtBR(totGeral.prm)}</td>
                <td className="p-2 text-right tabular-nums">{fmtBR(totGeral.adi)}</td>
                <td className="p-2 text-right tabular-nums">{fmtBR(totGeral.total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}
