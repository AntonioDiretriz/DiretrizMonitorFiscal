import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Usa service_role para contornar RLS e processar todos os usuários
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  // Aceita POST do pg_cron (sem body) ou chamada manual com { competencia: "2026-05-01" }
  let competencia: string;
  try {
    const body = await req.json().catch(() => ({}));
    competencia = body.competencia ?? null;
  } catch {
    competencia = null as any;
  }

  // Se não informado, usa o mês atual (1º dia)
  if (!competencia) {
    const hoje = new Date();
    competencia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
  }

  console.log(`[gerar-rotinas-mensais] Competência: ${competencia}`);

  // Busca todos os pares (user_id, empresa_id) — cada dono com suas empresas
  const { data: empresas, error } = await supabase
    .from("empresas")
    .select("id, user_id, razao_social");

  if (error) {
    console.error("Erro ao buscar empresas:", error.message);
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
  }

  let totalGeradas = 0;
  let totalErros   = 0;
  const detalhes: { empresa: string; geradas: number }[] = [];

  for (const empresa of empresas ?? []) {
    try {
      const { data, error: rpcError } = await supabase.rpc("gerar_obrigacoes", {
        p_user_id:    empresa.user_id,
        p_empresa_id: empresa.id,
        p_competencia: competencia,
      });

      if (rpcError) {
        console.error(`Erro empresa ${empresa.razao_social}:`, rpcError.message);
        totalErros++;
      } else {
        const geradas = (data as number) ?? 0;
        totalGeradas += geradas;
        if (geradas > 0) {
          detalhes.push({ empresa: empresa.razao_social, geradas });
          console.log(`  ✓ ${empresa.razao_social}: ${geradas} obrigações geradas`);
        }
      }
    } catch (err: any) {
      console.error(`Exceção empresa ${empresa.razao_social}:`, err.message);
      totalErros++;
    }
  }

  console.log(`[gerar-rotinas-mensais] Concluído: ${totalGeradas} geradas, ${totalErros} erros`);

  return new Response(
    JSON.stringify({
      ok: true,
      competencia,
      empresas_processadas: empresas?.length ?? 0,
      total_geradas: totalGeradas,
      total_erros: totalErros,
      detalhes,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
