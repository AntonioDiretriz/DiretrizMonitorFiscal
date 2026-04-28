/**
 * Edge Function: sync-belvo
 * Busca transações via Belvo para um link conectado e grava em transacoes_bancarias.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BELVO_SECRET_ID       = Deno.env.get("BELVO_SECRET_ID")!;
const BELVO_SECRET_PASSWORD = Deno.env.get("BELVO_SECRET_PASSWORD")!;
const BELVO_API             = "https://sandbox.belvo.com";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const belvoHeaders = () => ({
  "Content-Type":  "application/json",
  "Authorization": `Basic ${btoa(`${BELVO_SECRET_ID}:${BELVO_SECRET_PASSWORD}`)}`,
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const { link_id, conta_bancaria_id, user_id, data_inicio, data_fim } = await req.json();
    if (!link_id || !conta_bancaria_id || !user_id) return json({ error: "Parâmetros obrigatórios ausentes" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    // Buscar contas do link
    const accRes = await fetch(`${BELVO_API}/api/accounts/?link=${link_id}`, { headers: belvoHeaders() });
    if (!accRes.ok) throw new Error(`Erro ao buscar contas: ${await accRes.text()}`);
    const accounts = await accRes.json();
    if (!accounts?.results?.length) return json({ error: "Nenhuma conta encontrada neste link" }, 400);

    // Usar conta corrente ou a primeira disponível
    const account = accounts.results.find((a: any) => a.type === "CHECKING") ?? accounts.results[0];
    const accountId = account.id as string;
    const bancoNome = account.institution?.name ?? account.name ?? "Banco";

    // Período (padrão: mês atual)
    const hoje   = new Date().toISOString().slice(0, 10);
    const inicio = data_inicio ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const fim    = data_fim ?? hoje;

    // Buscar transações
    const txRes = await fetch(
      `${BELVO_API}/api/transactions/?account=${accountId}&value_date__gte=${inicio}&value_date__lte=${fim}&page_size=1000`,
      { headers: belvoHeaders() }
    );
    if (!txRes.ok) throw new Error(`Erro ao buscar transações: ${await txRes.text()}`);
    const txData = await txRes.json();
    const txs: any[] = txData.results ?? [];

    if (txs.length === 0) {
      await saveConnection(supabase, { user_id, conta_bancaria_id, link_id, bancoNome });
      return json({ success: true, total: 0, banco: bancoNome });
    }

    // Mapear para transacoes_bancarias
    const rows = txs.map((t: any) => ({
      user_id,
      conta_bancaria_id,
      data:             t.value_date ?? t.accounting_date ?? hoje,
      descricao:        t.description ?? t.reference ?? "",
      valor:            Math.abs(Number(t.amount)),
      tipo:             Number(t.amount) >= 0 ? "credito" : "debito",
      status:           "pendente",
      hash_dedup:       `belvo_${t.id}`,
      importacao_id:    null,
      plano_contas_id:  null,
    }));

    const { error: upsertErr } = await supabase
      .from("transacoes_bancarias")
      .upsert(rows, { onConflict: "user_id,conta_bancaria_id,hash_dedup", ignoreDuplicates: true });

    if (upsertErr) return json({ error: upsertErr.message }, 500);

    await saveConnection(supabase, { user_id, conta_bancaria_id, link_id, bancoNome });
    return json({ success: true, total: txs.length, banco: bancoNome });

  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

async function saveConnection(supabase: any, { user_id, conta_bancaria_id, link_id, bancoNome }: any) {
  await supabase.from("belvo_connections").upsert({
    user_id, conta_bancaria_id, link_id, banco_nome: bancoNome,
    status: "connected", ultima_sincronizacao: new Date().toISOString(),
  }, { onConflict: "user_id,link_id" });
}
