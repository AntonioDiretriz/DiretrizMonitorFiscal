/**
 * Edge Function: sync-inter
 * Busca extrato do Banco Inter via API oficial (mTLS + OAuth2)
 * e grava as transações em transacoes_bancarias.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTER_BASE       = "https://cdpj.partners.bancointer.com.br";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const { conta_bancaria_id, data_inicio, data_fim, user_id } = await req.json();

    if (!conta_bancaria_id) return json({ error: "conta_bancaria_id obrigatório" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    // Buscar credenciais
    const { data: integracao, error: errInt } = await supabase
      .from("integracoes_bancarias")
      .select("*")
      .eq("conta_bancaria_id", conta_bancaria_id)
      .eq("ativo", true)
      .single();

    if (errInt || !integracao) return json({ error: "Integração não configurada para esta conta" }, 400);

    // Cliente HTTP com mTLS (certificado do Inter)
    const httpClient = Deno.createHttpClient({
      certChain:  integracao.certificado_pem,
      privateKey: integracao.chave_pem,
    });

    // Obter token OAuth2
    const tokenBody = new URLSearchParams({
      client_id:     integracao.client_id,
      client_secret: integracao.client_secret,
      grant_type:    "client_credentials",
      scope:         "extrato.read",
    });

    const tokenResp = await fetch(`${INTER_BASE}/oauth/v2/token`, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    tokenBody,
      client:  httpClient,
    });

    if (!tokenResp.ok) {
      const err = await tokenResp.text();
      return json({ error: `Erro ao autenticar no Inter: ${err}` }, 400);
    }

    const { access_token } = await tokenResp.json();

    // Período de busca (padrão: mês atual)
    const hoje   = new Date().toISOString().slice(0, 10);
    const inicio = data_inicio ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const fim    = data_fim ?? hoje;

    // Buscar extrato (paginado)
    let page = 0, totalPages = 1;
    const allTx: Record<string, unknown>[] = [];

    while (page < totalPages) {
      const url = `${INTER_BASE}/banking/v2/extrato?dataInicio=${inicio}&dataFim=${fim}&pagina=${page}&tamanhoPagina=200`;
      const resp = await fetch(url, {
        headers: { "Authorization": `Bearer ${access_token}` },
        client:  httpClient,
      });

      if (!resp.ok) {
        const err = await resp.text();
        return json({ error: `Erro ao buscar extrato: ${err}` }, 400);
      }

      const data = await resp.json();
      totalPages = data.totalPages ?? 1;
      allTx.push(...(data.transacoes ?? []));
      page++;
    }

    if (allTx.length === 0) return json({ success: true, total: 0, novas: 0 });

    // Mapear para o formato transacoes_bancarias
    const ownerId = integracao.user_id;
    const rows = allTx.map((t: Record<string, unknown>) => ({
      user_id:          ownerId,
      conta_bancaria_id,
      data:             t.dataEntrada as string,
      descricao:        (t.descricao || t.titulo || "") as string,
      valor:            Math.abs(Number(t.valor)),
      tipo:             t.tipoOperacao === "C" ? "credito" : "debito",
      status:           "pendente",
      hash_dedup:       t.idTransacao as string,
      importacao_id:    null,
      plano_contas_id:  null,
    }));

    const { error: upsertErr } = await supabase
      .from("transacoes_bancarias")
      .upsert(rows, { onConflict: "user_id,conta_bancaria_id,hash_dedup", ignoreDuplicates: true });

    if (upsertErr) return json({ error: upsertErr.message }, 500);

    // Atualizar ultima_sincronizacao
    await supabase
      .from("integracoes_bancarias")
      .update({ ultima_sincronizacao: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", integracao.id);

    return json({ success: true, total: allTx.length });

  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
