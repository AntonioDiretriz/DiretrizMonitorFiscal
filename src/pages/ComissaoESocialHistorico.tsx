import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fmtBR } from "@/lib/normalize";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Conf {
  id: string;
  competencia: string;
  empresa: string | null;
  cnpj: string | null;
  total_funcionarios: number;
  total_divergencias: number;
  total_comissao_pdf: number;
  total_comissao_planilha: number;
  total_gratificacao_pdf: number;
  total_gratificacao_planilha: number;
  created_at: string;
}

export default function ComissaoESocialHistorico() {
  const { user } = useAuth();
  const [list, setList] = useState<Conf[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("conferencias")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setList((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const remove = async (id: string) => {
    if (!confirm("Excluir esta conferência?")) return;
    const { error } = await (supabase as any).from("conferencias").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Excluída."); load(); }
  };

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Histórico</h1>
          <p className="text-muted-foreground mt-1">Conferências salvas</p>
        </div>
        <Button asChild><Link to="/comissao-esocial">Nova conferência</Link></Button>
      </header>

      {loading ? <p className="text-muted-foreground">Carregando…</p> : list.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">Nenhuma conferência salva ainda.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {list.map((c) => (
            <Card key={c.id} className="p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{c.empresa ?? "—"}</h3>
                    <Badge variant="secondary">{c.competencia}</Badge>
                    {c.total_divergencias > 0
                      ? <Badge variant="outline" className="border-destructive/40 text-destructive">{c.total_divergencias} divergências</Badge>
                      : <Badge variant="outline" className="border-success/40 text-success">Sem divergências</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{c.cnpj ?? "—"} · {new Date(c.created_at).toLocaleString("pt-BR")}</p>
                </div>
                <div className="text-right text-sm">
                  <p>{c.total_funcionarios} funcionários</p>
                  <p className="text-muted-foreground">Comissão PDF R$ {fmtBR(Number(c.total_comissao_pdf))} · Planilha R$ {fmtBR(Number(c.total_comissao_planilha))}</p>
                </div>
                <div className="flex gap-2">
                  <Button asChild size="sm"><Link to={`/comissao-esocial/dashboard/${c.id}`}>Abrir dashboard</Link></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
