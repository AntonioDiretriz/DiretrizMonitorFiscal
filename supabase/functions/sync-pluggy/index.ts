/**
 * Edge Function: sync-pluggy
 * Busca transações via Pluggy para um item conectado e grava em transacoes_bancarias.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PLUGGY_CLIENT_ID      = Deno.env.get("PLUGGY_CLIENT_ID")!;
const PLUGGY_CLIENT_SECRET  = Deno.env.get("PLUGGY_CLIENT_SECRET")!;
const PLUGGY_API            = "https://api.pluggy.ai";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function pluggyAuth(): Promise<string> {
  const res = await fetch(`${PLUGGY_API}/auth`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ clientId: PLUGGY_CLIENT_ID, clientSecret: PLUGGY_CLIENT_SECRET }),
  });
  if (!res.ok) throw new Error(`Pluggy auth failed: ${await res.text()}`);
  const { apiKey } = await res.json();
  return apiKey as string;
}

async function fetchAllPages(url: string, apiKey: string): Promise<Record<string, unknown>[]> {
  let page = 1, all: Record<string, unknown>[] = [];
  while (true) {
    const res  = await fetch(`${url}&page=${page}&pageSize=500`, { headers: { "X-API-KEY": apiKey } });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json() as { results: Record<string, unknown>[]; totalPages?: number };
    all.push(...data.results);
    if (page >= (data.totalPages ?? 1)) break;
    page++;
  }
  return all;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const { item_id, conta_bancaria_id, user_id, data_inicio, data_fim } = await req.json();
    if (!item_id || !conta_bancaria_id || !user_id) return json({ error: "Parâmetros obrigatórios ausentes" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);
    const apiKey   = await pluggyAuth();

    // Buscar contas do item
    const accRes = await fetch(`${PLUGGY_API}/accounts?itemId=${item_id}`, { headers: { "X-API-KEY": apiKey } });
    if (!accRes.ok) throw new Error(`Erro ao buscar contas: ${await accRes.text()}`);
    const { results: accounts } = await accRes.json() as { results: Record<string, unknown>[] };
    if (!accounts?.length) return json({ error: "Nenhuma conta encontrada neste item" }, 400);

    // Usar primeira conta corrente/pagamento (ou a primeira disponível)
    const account = accounts.find((a: any) => ["CHECKING", "PAYMENT"].includes(a.type)) ?? accounts[0];
    const accountId = account.id as string;
    const bancoNome = (account as any).institution?.name ?? "Banco";

    // Período (padrão: mês atual)
    const hoje   = new Date().toISOString().slice(0, 10);
    const inicio = data_inicio ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const fim    = data_fim ?? hoje;

    // Buscar transações (paginado)
    const txUrl = `${PLUGGY_API}/transactions?accountId=${accountId}&from=${inicio}&to=${fim}`;
    const txs   = await fetchAllPages(txUrl, apiKey);

    if (txs.length === 0) {
      // Salvar/atualizar conexão mesmo sem transações
      await (supabase as any).from("pluggy_connections").upsert({
        user_id, conta_bancaria_id, item_id, account_id: accountId, banco_nome: bancoNome,
        status: "connected", ultima_sincronizacao: new Date().toISOString(),
      }, { onConflict: "user_id,item_id" });
      return json({ success: true, total: 0 });
    }

    // Mapear para transacoes_bancarias
    const rows = txs.map((t: any) => ({
      user_id,
      conta_bancaria_id,
      data:             t.date?.slice(0, 10) ?? hoje,
      descricao:        t.description ?? t.name ?? "",
      valor:            Math.abs(Number(t.amount)),
      tipo:             Number(t.amount) >= 0 ? "credito" : "debito",
      status:           "pendente",
      hash_dedup:       `pluggy_${t.id}`,
      importacao_id:    null,
      plano_contas_id:  null,
    }));

    const { error: upsertErr } = await supabase
      .from("transacoes_bancarias")
      .upsert(rows, { onConflict: "user_id,conta_bancaria_id,hash_dedup", ignoreDuplicates: true });

    if (upsertErr) return json({ error: upsertErr.message }, 500);

    // Salvar/atualizar conexão
    await (supabase as any).from("pluggy_connections").upsert({
      user_id, conta_bancaria_id, item_id, account_id: accountId, banco_nome: bancoNome,
      status: "connected", ultima_sincronizacao: new Date().toISOString(),
    }, { onConflict: "user_id,item_id" });

    return json({ success: true, total: txs.length, banco: bancoNome });

  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
