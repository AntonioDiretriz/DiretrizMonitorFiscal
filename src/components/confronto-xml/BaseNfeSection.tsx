import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Database, Trash2, Search, RefreshCw } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ExcelBaseSection } from '@/components/confronto-xml/ExcelBaseSection';
import { toast } from 'sonner';

interface EmpresaOpt {
  id: string;
  razao_social: string;
}

interface XmlRow {
  id: string;
  ch_nfe: string;
  n_nf: string | null;
  serie: string | null;
  dh_emi: string | null;
  cnpj_emitente: string | null;
  x_nome: string | null;
  v_nf: number | null;
  v_ipi: number | null;
  cancelada: boolean;
  created_at: string;
}

const MONTH_NAMES_PT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

function competenciaFromDhEmi(dh: string | null): string {
  if (!dh) return '';
  const d = new Date(dh);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(key: string): string {
  if (!key) return '—';
  const [year, month] = key.split('-');
  const idx = parseInt(month, 10) - 1;
  if (idx < 0 || idx > 11) return key;
  return `${MONTH_NAMES_PT[idx]}/${year}`;
}

function formatCnpj(v: string | null): string {
  const s = String(v ?? '').replace(/\D/g, '');
  if (s.length !== 14) return v ?? '—';
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
}

function formatBRL(v: number | null): string {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function BaseNfeSection() {
  const { user } = useAuth();
  const [empresas, setEmpresas] = useState<EmpresaOpt[]>([]);
  const [empresaId, setEmpresaId] = useState<string>('');
  const [xmls, setXmls] = useState<XmlRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // filtros
  const [search, setSearch] = useState('');
  const [competenciaFiltro, setCompetenciaFiltro] = useState<string>('todas');
  const [cnpjFiltro, setCnpjFiltro] = useState<string>('todos');
  const [statusFiltro, setStatusFiltro] = useState<string>('todos');

  useEffect(() => {
    if (!user) return;
    supabase
      .from('empresas')
      .select('id, razao_social')
      .eq('ativa', true)
      .order('razao_social', { ascending: true })
      .then(({ data }) => {
        if (data) {
          setEmpresas(data as EmpresaOpt[]);
          if (data.length > 0 && !empresaId) setEmpresaId((data[0] as EmpresaOpt).id);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const carregarXmls = async (id: string) => {
    if (!id) {
      setXmls([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('xmls_armazenados')
      .select('id, ch_nfe, n_nf, serie, dh_emi, cnpj_emitente, x_nome, v_nf, v_ipi, cancelada, created_at')
      .eq('empresa_id', id)
      .order('dh_emi', { ascending: false })
      .limit(5000);
    if (error) {
      toast.error('Erro ao carregar XMLs', { description: error.message });
      setXmls([]);
    } else {
      setXmls((data ?? []) as XmlRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!user || !empresaId) return;
    void carregarXmls(empresaId);
  }, [user, empresaId]);

  const competenciasDisponiveis = useMemo(() => {
    const set = new Set<string>();
    xmls.forEach((x) => {
      const c = competenciaFromDhEmi(x.dh_emi);
      if (c) set.add(c);
    });
    return Array.from(set).sort().reverse();
  }, [xmls]);

  const cnpjsDisponiveis = useMemo(() => {
    const map = new Map<string, string>();
    xmls.forEach((x) => {
      if (x.cnpj_emitente) map.set(x.cnpj_emitente, x.x_nome ?? x.cnpj_emitente);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [xmls]);

  const xmlsFiltrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return xmls.filter((x) => {
      if (statusFiltro === 'canceladas' && !x.cancelada) return false;
      if (statusFiltro === 'ativas' && x.cancelada) return false;
      if (competenciaFiltro !== 'todas' && competenciaFromDhEmi(x.dh_emi) !== competenciaFiltro) return false;
      if (cnpjFiltro !== 'todos' && x.cnpj_emitente !== cnpjFiltro) return false;
      if (q) {
        const hay = `${x.n_nf ?? ''} ${x.ch_nfe} ${x.x_nome ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [xmls, search, competenciaFiltro, cnpjFiltro, statusFiltro]);

  const excluirXml = async (id: string) => {
    if (!confirm('Excluir este XML da base? Essa ação não pode ser desfeita.')) return;
    const { error } = await supabase.from('xmls_armazenados').delete().eq('id', id);
    if (error) {
      toast.error('Não foi possível excluir', { description: error.message });
      return;
    }
    toast.success('XML excluído');
    setXmls((prev) => prev.filter((x) => x.id !== id));
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
  };

  const excluirSelecionados = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`Excluir ${ids.length} XML(s) da base? Essa ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from('xmls_armazenados').delete().in('id', ids);
    if (error) {
      toast.error('Não foi possível excluir', { description: error.message });
      return;
    }
    toast.success(`${ids.length} XML(s) excluído(s)`);
    const idSet = new Set(ids);
    setXmls((prev) => prev.filter((x) => !idSet.has(x.id)));
    setSelected(new Set());
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const visibleIds = xmlsFiltrados.map((x) => x.id);
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      if (allSelected) {
        const n = new Set(prev);
        visibleIds.forEach((id) => n.delete(id));
        return n;
      }
      const n = new Set(prev);
      visibleIds.forEach((id) => n.add(id));
      return n;
    });
  };

  useEffect(() => { setSelected(new Set()); }, [empresaId]);

  const [reprocessando, setReprocessando] = useState(false);

  const reprocessarXmls = async (files: File[]) => {
    if (!user || !empresaId || files.length === 0) return;
    setReprocessando(true);
    try {
      const { parseXmlFiles } = await import('@/lib/xml-parser');
      const { salvarXmls } = await import('@/lib/xml-storage');
      const parsed = await parseXmlFiles(files);
      if (parsed.length === 0) {
        toast.error('Nenhum XML válido encontrado nos arquivos enviados');
        return;
      }
      const n = await salvarXmls(empresaId, user.id, parsed);
      toast.success(`${n} XML(s) reprocessado(s) — dados atualizados na base`);
      await carregarXmls(empresaId);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao reprocessar XMLs');
    } finally {
      setReprocessando(false);
    }
  };



  return (
    <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" /> Base de NF-e
            </h1>
            <p className="text-sm text-muted-foreground">
              XMLs e linhas de planilha armazenados são reutilizados automaticamente no próximo confronto.
            </p>
          </div>
          <Select value={empresaId} onValueChange={setEmpresaId}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Selecione a empresa" />
            </SelectTrigger>
            <SelectContent>
              {empresas.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.razao_social}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="xmls" className="space-y-4">
          <TabsList>
            <TabsTrigger value="xmls">XMLs</TabsTrigger>
            <TabsTrigger value="excel">Planilhas (Excel)</TabsTrigger>
          </TabsList>

          <TabsContent value="xmls" className="space-y-4 mt-0">
          <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Reprocessar XMLs</p>
              <p className="text-xs text-muted-foreground">
                Reenvie os arquivos do mês para atualizar os registros já salvos (inclui o CNPJ do destinatário, usado nas notas de garantia).
              </p>
            </div>
            <label className="inline-flex">
              <input
                type="file"
                accept=".xml"
                multiple
                className="hidden"
                disabled={reprocessando || !empresaId}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  void reprocessarXmls(files);
                }}
              />
              <Button asChild variant="outline" disabled={reprocessando || !empresaId}>
                <span className="cursor-pointer">
                  <RefreshCw className={`h-4 w-4 mr-2 ${reprocessando ? 'animate-spin' : ''}`} />
                  {reprocessando ? 'Reprocessando...' : 'Selecionar XMLs'}
                </span>
              </Button>
            </label>
          </Card>

          <Card className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nº NF, chave ou emitente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={competenciaFiltro} onValueChange={setCompetenciaFiltro}>
              <SelectTrigger>
                <SelectValue placeholder="Competência" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as competências</SelectItem>
                {competenciasDisponiveis.map((c) => (
                  <SelectItem key={c} value={c}>{formatMonthLabel(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFiltro} onValueChange={setStatusFiltro}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="ativas">Apenas ativas</SelectItem>
                <SelectItem value="canceladas">Apenas canceladas</SelectItem>
              </SelectContent>
            </Select>
            <div className="md:col-span-4">
              <Select value={cnpjFiltro} onValueChange={setCnpjFiltro}>
                <SelectTrigger>
                  <SelectValue placeholder="Emitente (CNPJ)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os emitentes</SelectItem>
                  {cnpjsDisponiveis.map(([cnpj, nome]) => (
                    <SelectItem key={cnpj} value={cnpj}>
                      {nome} — {formatCnpj(cnpj)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm text-muted-foreground">
              {loading ? 'Carregando...' : `${xmlsFiltrados.length} de ${xmls.length} XMLs`}
              {selected.size > 0 && <span className="ml-3 font-medium text-foreground">· {selected.size} selecionado(s)</span>}
            </div>
            {selected.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={excluirSelecionados}
              >
                <Trash2 className="h-4 w-4" /> Excluir selecionados ({selected.size})
              </Button>
            )}
          </div>
        </Card>

        <Card>
          {loading ? (
            <div className="p-12 flex justify-center">
              <span className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : xmlsFiltrados.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              {xmls.length === 0
                ? 'Nenhum XML armazenado para esta empresa ainda.'
                : 'Nenhum XML corresponde aos filtros.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={xmlsFiltrados.length > 0 && xmlsFiltrados.every((x) => selected.has(x.id))}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Selecionar todos"
                    />
                  </TableHead>
                  <TableHead>Nº NF</TableHead>
                  <TableHead>Série</TableHead>
                  <TableHead>Emissão</TableHead>
                  <TableHead>Comp.</TableHead>
                  <TableHead>Emitente</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead className="text-right">vNF</TableHead>
                  <TableHead className="text-right">vIPI</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {xmlsFiltrados.map((x) => (
                  <TableRow key={x.id} data-state={selected.has(x.id) ? 'selected' : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(x.id)}
                        onCheckedChange={() => toggleSelected(x.id)}
                        aria-label={`Selecionar XML ${x.n_nf ?? x.id}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono">{x.n_nf ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{x.serie ?? '—'}</TableCell>
                    <TableCell className="text-xs">
                      {x.dh_emi ? new Date(x.dh_emi).toLocaleDateString('pt-BR') : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {formatMonthLabel(competenciaFromDhEmi(x.dh_emi))}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate" title={x.x_nome ?? ''}>
                      {x.x_nome ?? '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{formatCnpj(x.cnpj_emitente)}</TableCell>
                    <TableCell className="text-right font-mono">{formatBRL(x.v_nf)}</TableCell>
                    <TableCell className="text-right font-mono">{formatBRL(x.v_ipi)}</TableCell>
                    <TableCell>
                      {x.cancelada ? (
                        <Badge variant="destructive">🚫 Cancelada</Badge>
                      ) : (
                        <Badge variant="secondary">Ativa</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => excluirXml(x.id)}
                        title="Excluir XML"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
          </TabsContent>

          <TabsContent value="excel" className="mt-0">
            <ExcelBaseSection empresaId={empresaId} />
          </TabsContent>
        </Tabs>
    </div>
  );
}
