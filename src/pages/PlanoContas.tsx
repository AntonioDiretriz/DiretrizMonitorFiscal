import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, Upload, Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";

type PlanoContaTipo = "ativo" | "passivo" | "patrimonio" | "receita" | "custo" | "despesa" | "resultado" | "imposto" | "outro";

interface PlanoConta {
  id: string;
  user_id: string;
  empresa_id: string | null;
  classificacao: string | null;
  codigo: string;
  natureza: string | null;
  grau: number | null;
  nome: string;
  tipo: PlanoContaTipo;
  parent_id: string | null;
  ativo: boolean;
  created_at: string;
  children?: PlanoConta[];
}

interface Empresa { id: string; razao_social: string; }

const TIPO_CONFIG: Record<PlanoContaTipo, { label: string; color: string }> = {
  ativo:       { label: "Ativo",       color: "#3b82f6" },
  passivo:     { label: "Passivo",     color: "#f59e0b" },
  patrimonio:  { label: "Patrimônio",  color: "#8b5cf6" },
  receita:     { label: "Receita",     color: "#22c55e" },
  custo:       { label: "Custo",       color: "#f97316" },
  despesa:     { label: "Despesa",     color: "#ED3237" },
  resultado:   { label: "Resultado",   color: "#06b6d4" },
  imposto:     { label: "Imposto",     color: "#eab308" },
  outro:       { label: "Outro",       color: "#6b7280" },
};

const EMPTY_FORM = {
  classificacao: "", codigo: "", natureza: "A", nome: "",
  tipo: "despesa" as PlanoContaTipo, parent_id: "",
};

function detectTipo(classificacao: string, nome: string): PlanoContaTipo {
  const first = classificacao ? classificacao.split(".")[0] : "";
  switch (first) {
    case "1": return "ativo";
    case "2": return "passivo";
    case "3": return "patrimonio";
    case "4": return "receita";
    case "5": return "custo";
    case "6": return "despesa";
    case "7": return "resultado";
    case "8": return "outro";
    default: {
      const n = nome.toLowerCase();
      if (n.includes("receita") || n.includes("venda")) return "receita";
      if (n.includes("imposto") || n.includes("tributo") || n.includes("irpj") || n.includes("csll")) return "imposto";
      if (n.includes("ativo") || n.includes("caixa") || n.includes("banco")) return "ativo";
      if (n.includes("passivo") || n.includes("fornecedor")) return "passivo";
      return "despesa";
    }
  }
}

// Build hierarchy using classificacao prefix matching
function buildTree(items: PlanoConta[]): PlanoConta[] {
  const sorted = [...items].sort((a, b) => {
    const ca = a.classificacao ?? a.codigo;
    const cb = b.classificacao ?? b.codigo;
    return ca.localeCompare(cb);
  });
  const withChildren: PlanoConta[] = sorted.map(i => ({ ...i, children: [] }));
  const byClassif: Record<string, PlanoConta> = {};
  withChildren.forEach(i => { if (i.classificacao) byClassif[i.classificacao] = i; });

  const roots: PlanoConta[] = [];
  withChildren.forEach(item => {
    if (!item.classificacao) { roots.push(item); return; }
    const parts = item.classificacao.split(".");
    let parent: PlanoConta | null = null;
    for (let len = parts.length - 1; len >= 1; len--) {
      const key = parts.slice(0, len).join(".");
      if (byClassif[key]) { parent = byClassif[key]; break; }
    }
    if (parent) parent.children!.push(item);
    else roots.push(item);
  });
  return roots;
}

// Converte código Domínio (ex: 11201009) para classificação dotada (ex: 1.1.2.01.009)
// Comprimentos por grau derivados da máscara 9.9.9.99.999.999 → [1,1,1,2,3,3]
function toDotted(code: string, grau: number): string {
  const LENS = [1, 1, 1, 2, 3, 3];
  const parts: string[] = [];
  let pos = 0;
  for (let i = 0; i < grau && i < LENS.length && pos < code.length; i++) {
    parts.push(code.slice(pos, pos + LENS[i]));
    pos += LENS[i];
  }
  return parts.join(".");
}

// Parser principal — detecta formato Domínio ou fallback tabular
// Domínio: empCod seqNo NOME dominioCode [S|A] mascara EMPRESA cnpjEmp grau [cnpjCliente]
function parseTxt(txt: string) {
  const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const result: { classificacao: string; codigo: string; natureza: string; nome: string; grau: number; tipo: PlanoContaTipo }[] = [];

  for (const line of lines) {
    if (/classificaç[aã]o|c[oó]digo|descri[cç][aã]o/i.test(line)) continue;

    const tokens = line.split(/\s+/).filter(Boolean);

    // ── Formato Domínio (primeiro e segundo token são números inteiros) ────────
    if (tokens.length >= 9 && /^\d+$/.test(tokens[0]) && /^\d+$/.test(tokens[1])) {
      let ri = tokens.length - 1;

      // Remove CNPJ cliente opcional do final (11–14 dígitos)
      if (/^\d{11,14}$/.test(tokens[ri]) && ri > 9) {
        const prev = tokens[ri - 1];
        if (/^\d{1,2}$/.test(prev) && +prev >= 1 && +prev <= 9) ri--;
      }

      const grau = parseInt(tokens[ri]); ri--;
      if (isNaN(grau) || grau < 1 || grau > 9) continue;

      // CNPJ empresa (11–14 dígitos)
      if (!/^\d{11,14}$/.test(tokens[ri])) continue;
      ri--;

      // Encontra a máscara (token com dígitos e pontos, ex: 9.9.9.99.999.999)
      let mascaraIdx = -1;
      for (let i = ri; i >= 4; i--) {
        if (/^\d[\d.]+\d$/.test(tokens[i]) && tokens[i].includes(".")) { mascaraIdx = i; break; }
      }
      if (mascaraIdx < 0) continue;

      const natureza = tokens[mascaraIdx - 1];
      if (!/^[SA]$/i.test(natureza)) continue;

      const dominioCode = tokens[mascaraIdx - 2];
      if (!/^\d+$/.test(dominioCode)) continue;

      // Nome = tudo entre seqNo (idx 1) e dominioCode
      const nome = tokens.slice(2, mascaraIdx - 2).join(" ").trim();
      if (!nome) continue;

      const classificacao = toDotted(dominioCode, grau);
      result.push({ classificacao, codigo: dominioCode, natureza: natureza.toUpperCase(), nome, grau, tipo: detectTipo(classificacao, nome) });
      continue;
    }

    // ── Fallback: tabular com separadores (tab, ;) ou espaço ─────────────────
    // Formato Excel Domínio: Classificação;Código;T;Descrição;CNPJ;Grau
    //   col[0] = código Domínio sem pontos (11101), col[1] = código reduzido,
    //   col[2] = S/A, col[3] = Nome, col[4] = CNPJ, col[5] = Grau
    let parts: string[] = [];
    if (line.includes("\t"))      parts = line.split("\t").map(p => p.trim());
    else if (line.includes(";"))  parts = line.split(";").map(p => p.trim());
    else {
      const m = line.match(/^([\d.]+)\s+(\d+)\s+([SA])\s+(.+?)(?:\s+\d{11,14})?\s*(\d+)?\s*$/i);
      if (m)  parts = [m[1], m[2], m[3], m[4].trim(), "", m[5] ?? ""];
      else {
        const m2 = line.match(/^([\d.]+)\s+(.+)$/);
        if (m2) parts = [m2[1], "", "A", m2[2], "", ""];
      }
    }
    if (parts.length < 2) continue;

    const rawCode = parts[0];
    if (!/^[\d.]+$/.test(rawCode)) continue;

    const codigo   = parts[1] || parts[0];
    const natureza = (parts[2] || "A").toUpperCase() === "S" ? "S" : "A";
    const nome     = (parts[3] || parts[1] || "").trim();
    const grauRaw  = parseInt(parts[5] ?? "");
    const grau     = !isNaN(grauRaw) && grauRaw > 0 ? grauRaw : rawCode.split(".").length;

    if (!nome || /^\d+$/.test(nome)) continue;

    // Se rawCode é só dígitos (sem pontos) → código Domínio → converte para dotado
    // Se já tem pontos (1.1.1.01) → usa diretamente
    const classificacao = /^\d+$/.test(rawCode) ? toDotted(rawCode, grau) : rawCode;

    result.push({ classificacao, codigo, natureza, nome, grau, tipo: detectTipo(classificacao, nome) });
  }
  return result;
}

function PlanoRow({ item, depth = 0, onEdit, onDelete, podeEditar, podeExcluir }: {
  item: PlanoConta; depth?: number;
  onEdit: (i: PlanoConta) => void;
  onDelete: (id: string) => void;
  podeEditar: boolean; podeExcluir: boolean;
}) {
  const [open, setOpen] = useState(depth < 2);
  const cfg = TIPO_CONFIG[item.tipo] ?? TIPO_CONFIG.outro;
  const hasChildren = (item.children?.length ?? 0) > 0;
  const isSintetica = item.natureza === "S";

  return (
    <>
      <tr className={`border-b transition-colors ${isSintetica ? "bg-muted/20 hover:bg-muted/30" : "hover:bg-muted/10"}`}>
        <td className="py-1.5 px-3 font-mono text-xs text-muted-foreground whitespace-nowrap w-36">
          {item.classificacao ?? "—"}
        </td>
        <td className="py-1.5 px-2 font-mono text-xs text-muted-foreground text-center w-12">
          {item.codigo || "—"}
        </td>
        <td className="py-1.5 px-2 text-center w-8">
          <span className={`text-xs font-bold ${isSintetica ? "text-orange-500" : "text-blue-500"}`}>
            {item.natureza ?? "A"}
          </span>
        </td>
        <td className="py-1.5 px-2" style={{ paddingLeft: `${8 + depth * 20}px` }}>
          <div className="flex items-center gap-1.5">
            {hasChildren ? (
              <button onClick={() => setOpen(o => !o)} className="text-muted-foreground hover:text-foreground shrink-0">
                {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
            ) : <span className="w-3 inline-block" />}
            <span className={`text-sm ${isSintetica ? "font-semibold" : ""}`}>{item.nome}</span>
          </div>
        </td>
        <td className="py-1.5 px-2 w-28">
          <Badge style={{ backgroundColor: cfg.color + "20", color: cfg.color, border: `1px solid ${cfg.color}30`, fontSize: "11px", padding: "1px 6px" }}>
            {cfg.label}
          </Badge>
        </td>
        <td className="py-1.5 px-2 text-right w-16">
          <div className="flex items-center gap-0.5 justify-end">
            {podeEditar && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(item)}>
                <Pencil className="h-3 w-3 text-muted-foreground" />
              </Button>
            )}
            {podeExcluir && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir conta?</AlertDialogTitle>
                    <AlertDialogDescription>A conta <strong>{item.nome}</strong> será removida permanentemente.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(item.id)} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </td>
      </tr>
      {open && item.children?.map(child => (
        <PlanoRow key={child.id} item={child} depth={depth + 1}
          onEdit={onEdit} onDelete={onDelete} podeEditar={podeEditar} podeExcluir={podeExcluir} />
      ))}
    </>
  );
}

export default function PlanoContas() {
  const { user, podeIncluir, podeEditar, podeExcluir, ownerUserId } = useAuth();
  const { toast } = useToast();

  const [empresas,        setEmpresas]        = useState<Empresa[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<string>("");
  const [contas,          setContas]          = useState<PlanoConta[]>([]);
  const [tree,            setTree]            = useState<PlanoConta[]>([]);
  const [search,          setSearch]          = useState("");
  const [dialogOpen,      setDialogOpen]      = useState(false);
  const [editingId,       setEditingId]       = useState<string | null>(null);
  const [form,            setForm]            = useState(EMPTY_FORM);
  const [importPreview,   setImportPreview]   = useState<ReturnType<typeof parseTxt>>([]);
  const [importOpen,      setImportOpen]      = useState(false);
  const [importing,       setImporting]       = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("empresas").select("id, razao_social").order("razao_social")
      .then(({ data }) => {
        const emps = (data ?? []) as Empresa[];
        setEmpresas(emps);
        if (emps.length === 1) setSelectedEmpresa(emps[0].id);
      });
  }, [user]);

  const load = useCallback(async () => {
    if (!user || !selectedEmpresa) { setContas([]); setTree([]); return; }
    const { data } = await supabase.from("plano_contas").select("*")
      .eq("empresa_id", selectedEmpresa)
      .order("classificacao", { nullsFirst: false })
      .order("codigo");
    const items = (data ?? []) as PlanoConta[];
    setContas(items);
    setTree(buildTree(items));
  }, [user, selectedEmpresa]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome) { toast({ title: "Preencha o nome", variant: "destructive" }); return; }
    const payload = {
      user_id: ownerUserId!,
      empresa_id: selectedEmpresa || null,
      classificacao: form.classificacao || null,
      codigo: form.codigo,
      natureza: form.natureza,
      nome: form.nome,
      tipo: form.tipo,
      parent_id: form.parent_id || null,
    };
    const { error } = editingId
      ? await supabase.from("plano_contas").update(payload).eq("id", editingId)
      : await supabase.from("plano_contas").insert(payload);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingId ? "Conta atualizada!" : "Conta criada!" });
    setForm(EMPTY_FORM); setEditingId(null); setDialogOpen(false); load();
  };

  const handleEdit = (item: PlanoConta) => {
    setEditingId(item.id);
    setForm({
      classificacao: item.classificacao ?? "",
      codigo: item.codigo,
      natureza: item.natureza ?? "A",
      nome: item.nome,
      tipo: item.tipo,
      parent_id: item.parent_id ?? "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("plano_contas").delete().eq("id", id);
    if (error) { toast({ title: "Erro ao excluir", variant: "destructive" }); return; }
    toast({ title: "Conta removida" }); load();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!selectedEmpresa) {
      toast({ title: "Selecione uma empresa antes de importar", variant: "destructive" });
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const reader = new FileReader();

    if (ext === "xlsx" || ext === "xls") {
      reader.onload = ev => {
        const ab = ev.target?.result as ArrayBuffer;
        let wb: XLSX.WorkBook | null = null;
        try {
          wb = XLSX.read(new Uint8Array(ab), { type: "array" });
          if (Object.keys(wb.Sheets).length === 0) wb = null;
        } catch { wb = null; }
        if (!wb) {
          try {
            const bstr = Array.from(new Uint8Array(ab)).map(b => String.fromCharCode(b)).join("");
            wb = XLSX.read(bstr, { type: "binary" });
          } catch (e) {
            toast({ title: "Erro ao ler o arquivo", description: String(e), variant: "destructive" });
            return;
          }
        }
        const ws = (Object.values(wb.Sheets).find((s: any) => s && s["!ref"]) ?? Object.values(wb.Sheets)[0]) as XLSX.WorkSheet | undefined;
        if (!ws) {
          toast({ title: "Planilha não encontrada", description: `Abas: ${wb.SheetNames.join(", ")} | Sheets: ${Object.keys(wb.Sheets).length}`, variant: "destructive", duration: 20000 });
          return;
        }
        const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" });

        const norm = (s: string) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        let cClassif = 0, cCodigo = 1, cNat = 2, cNome = 3, cGrau = 5, dataStart = 0;
        for (let ri = 0; ri < Math.min(rows.length, 20); ri++) {
          const row: any[] = rows[ri] ?? [];
          let found = false;
          for (let ci = 0; ci < row.length; ci++) {
            const h = norm(row[ci]);
            if (h.includes("classific")) { cClassif = ci; found = true; }
            else if (h.includes("descri") || h.includes("nome")) { cNome = ci; found = true; }
            else if (h === "t" || h === "nat" || h === "natureza") cNat = ci;
            else if (h === "grau") cGrau = ci;
            else if (h === "cod" || h === "codigo") cCodigo = ci;
          }
          if (found) { dataStart = ri + 1; break; }
        }

        const estimaGrau = (code: string) => {
          const parts = code.split(".");
          if (parts.length > 1) return parts.length;
          const l = code.length;
          if (l <= 1) return 1; if (l <= 2) return 2; if (l <= 3) return 3;
          if (l <= 5) return 4; return 5;
        };

        const parsed: ReturnType<typeof parseTxt> = [];
        for (let ri = dataStart; ri < rows.length; ri++) {
          const row: any[] = rows[ri] ?? [];
          const rawCode   = String(row[cClassif] ?? "").trim();
          const codigoRed = String(row[cCodigo]  ?? "").trim();
          const natureza  = String(row[cNat]      ?? "").trim();
          const nome      = String(row[cNome]     ?? "").trim();
          const grauRaw   = String(row[cGrau]     ?? "").trim();
          // Aceita "11201" (puro) ou "1.1.2.01" (já pontilhado)
          if (!rawCode || (!(/^\d+$/.test(rawCode)) && !(/^[\d.]+$/.test(rawCode)))) continue;
          if (!nome || /^\d+$/.test(nome)) continue;
          const nat = /^s/i.test(natureza) ? "S" : "A";
          const grau = parseInt(grauRaw) || estimaGrau(rawCode);
          const classificacao = /^\d+$/.test(rawCode) ? toDotted(rawCode, grau) : rawCode;
          parsed.push({ classificacao, codigo: codigoRed || rawCode, natureza: nat, grau, nome, tipo: detectTipo(classificacao, nome) });
        }
        if (parsed.length === 0) {
          const preview = rows.slice(0, 5).map((r: any[]) =>
            (r ?? []).slice(0, 6).map((c: any) => String(c ?? "").substring(0, 15)).join(" | ")
          ).join("\n");
          toast({ title: `Arquivo lido (${rows.length} linhas) — nenhuma conta reconhecida`, description: `Linhas:\n${preview}\nColunas: classif=${cClassif} cod=${cCodigo} nome=${cNome}`, variant: "destructive", duration: 30000 });
          return;
        }
        setImportPreview(parsed);
        setImportOpen(true);
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = ev => {
        const txt = ev.target?.result as string;
        const parsed = parseTxt(txt);
        if (parsed.length === 0) {
          toast({ title: "Nenhuma conta reconhecida", description: "Verifique o formato do arquivo.", variant: "destructive" });
          return;
        }
        setImportPreview(parsed);
        setImportOpen(true);
      };
      reader.readAsText(file, "latin1");
    }

    e.target.value = "";
  };

  const handleImportConfirm = async () => {
    setImporting(true);
    // Replace all accounts for this empresa
    await supabase.from("plano_contas").delete().eq("empresa_id", selectedEmpresa);

    const payload = importPreview.map(c => ({
      user_id: ownerUserId!,
      empresa_id: selectedEmpresa,
      classificacao: c.classificacao,
      codigo: c.codigo,
      natureza: c.natureza,
      nome: c.nome,
      tipo: c.tipo,
      grau: c.grau,
      parent_id: null,
    }));

    let error = null;
    for (let i = 0; i < payload.length; i += 500) {
      const { error: e } = await supabase.from("plano_contas").insert(payload.slice(i, i + 500));
      if (e) { error = e; break; }
    }

    setImporting(false);
    if (error) { toast({ title: "Erro ao importar", description: (error as any).message, variant: "destructive" }); return; }
    toast({ title: `${payload.length} contas importadas com sucesso!` });
    setImportOpen(false);
    setImportPreview([]);
    load();
  };

  const flatFiltered = search
    ? contas.filter(c =>
        c.nome.toLowerCase().includes(search.toLowerCase()) ||
        (c.classificacao ?? "").includes(search) ||
        c.codigo.includes(search)
      )
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Plano de Contas</h1>
          <p className="text-muted-foreground">Estrutura hierárquica de contas contábeis</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {empresas.length > 1 && (
            <Select value={selectedEmpresa} onValueChange={setSelectedEmpresa}>
              <SelectTrigger className="w-64">
                <Building2 className="h-4 w-4 mr-2 shrink-0" />
                <SelectValue placeholder="Selecione a empresa" />
              </SelectTrigger>
              <SelectContent>
                {empresas.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.razao_social}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {podeIncluir && selectedEmpresa && (
            <>
              <input ref={fileRef} type="file" accept=".txt,.csv,.xlsx,.xls" className="hidden" onChange={handleFileSelect} />
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" /> Importar
              </Button>
            </>
          )}

          <Dialog open={dialogOpen} onOpenChange={o => { if (!o) { setEditingId(null); setForm(EMPTY_FORM); } setDialogOpen(o); }}>
            {podeIncluir && selectedEmpresa && (
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> Nova Conta</Button>
              </DialogTrigger>
            )}
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>{editingId ? "Editar Conta" : "Nova Conta"}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2 col-span-2">
                    <Label>Classificação</Label>
                    <Input placeholder="Ex: 1.1.1.02.001" value={form.classificacao}
                      onChange={e => {
                        const cl = e.target.value;
                        setForm(p => ({ ...p, classificacao: cl, tipo: detectTipo(cl, p.nome) }));
                      }} />
                  </div>
                  <div className="space-y-2">
                    <Label>Código</Label>
                    <Input placeholder="Ex: 8" value={form.codigo}
                      onChange={e => setForm(p => ({ ...p, codigo: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input placeholder="Nome da conta" value={form.nome} required
                    onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Natureza</Label>
                    <Select value={form.natureza} onValueChange={v => setForm(p => ({ ...p, natureza: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="S">S — Sintética</SelectItem>
                        <SelectItem value="A">A — Analítica</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select value={form.tipo} onValueChange={v => setForm(p => ({ ...p, tipo: v as PlanoContaTipo }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(TIPO_CONFIG).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" className="w-full">{editingId ? "Salvar Alterações" : "Criar Conta"}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground bg-muted/30 rounded-lg px-4 py-2">
        <span><strong className="text-orange-500">S</strong> = Sintética (agrupadora)</span>
        <span><strong className="text-blue-500">A</strong> = Analítica (lançamentos)</span>
        {Object.entries(TIPO_CONFIG).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: v.color }} />
            {v.label}
          </span>
        ))}
      </div>

      {/* Import preview dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader><DialogTitle>Importar Plano de Contas</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {importPreview.length} contas identificadas.{" "}
            <strong className="text-destructive">As contas existentes desta empresa serão substituídas.</strong>
          </p>
          <div className="overflow-y-auto flex-1 border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Classificação</th>
                  <th className="text-center px-2 py-2 font-medium">Cód.</th>
                  <th className="text-center px-2 py-2 font-medium">T</th>
                  <th className="text-left px-3 py-2 font-medium">Descrição</th>
                  <th className="text-left px-2 py-2 font-medium">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.map((c, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-1 font-mono text-xs">{c.classificacao}</td>
                    <td className="px-2 py-1 font-mono text-xs text-center">{c.codigo}</td>
                    <td className="px-2 py-1 text-center text-xs font-bold">{c.natureza}</td>
                    <td className="px-3 py-1 text-sm" style={{ paddingLeft: `${8 + (c.grau - 1) * 12}px` }}>{c.nome}</td>
                    <td className="px-2 py-1">
                      <Badge style={{ backgroundColor: TIPO_CONFIG[c.tipo].color + "20", color: TIPO_CONFIG[c.tipo].color, border: `1px solid ${TIPO_CONFIG[c.tipo].color}30`, fontSize: "11px" }}>
                        {TIPO_CONFIG[c.tipo].label}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button>
            <Button onClick={handleImportConfirm} disabled={importing}>
              {importing ? "Importando..." : `Importar ${importPreview.length} contas`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {!selectedEmpresa ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Building2 className="mx-auto h-10 w-10 mb-3 opacity-30" />
            <p>Selecione uma empresa para visualizar o plano de contas</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Input
            placeholder="Buscar por nome, classificação ou código..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Card>
            <CardContent className="p-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground w-36">Classificação</th>
                    <th className="text-center py-2 px-2 text-xs font-medium text-muted-foreground w-12">Cód.</th>
                    <th className="text-center py-2 px-2 text-xs font-medium text-muted-foreground w-8">T</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">Descrição</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground w-28">Tipo</th>
                    <th className="w-16" />
                  </tr>
                </thead>
                <tbody>
                  {contas.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                      Nenhuma conta cadastrada. Importe um arquivo ou crie manualmente.
                    </td></tr>
                  ) : flatFiltered ? (
                    flatFiltered.map(item => (
                      <PlanoRow key={item.id} item={{ ...item, children: [] }} depth={0}
                        onEdit={handleEdit} onDelete={handleDelete}
                        podeEditar={podeEditar} podeExcluir={podeExcluir} />
                    ))
                  ) : (
                    tree.map(item => (
                      <PlanoRow key={item.id} item={item}
                        onEdit={handleEdit} onDelete={handleDelete}
                        podeEditar={podeEditar} podeExcluir={podeExcluir} />
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
