-- ═══════════════════════════════════════════════════════════════════
-- Agendamento automático: Gerar Rotinas no 1º dia de cada mês
-- Usa pg_cron (nativo no Supabase) chamando função SQL diretamente
-- Execute no Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Habilita pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── Função que gera obrigações para TODAS as empresas ──────────────────────
CREATE OR REPLACE FUNCTION public.gerar_rotinas_mensais_auto()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER   -- roda como superuser, contorna RLS
SET search_path = public
AS $$
DECLARE
  v_empresa        RECORD;
  v_competencia    DATE;
  v_geradas_total  INTEGER := 0;
  v_erros          INTEGER := 0;
  v_geradas        INTEGER;
BEGIN
  -- Competência = 1º dia do mês atual
  v_competencia := DATE_TRUNC('month', NOW())::DATE;

  -- Itera todas as empresas ativas de todos os usuários
  FOR v_empresa IN
    SELECT e.id AS empresa_id, e.user_id, e.razao_social
      FROM public.empresas e
  LOOP
    BEGIN
      SELECT public.gerar_obrigacoes(
        v_empresa.user_id,
        v_empresa.empresa_id,
        v_competencia
      ) INTO v_geradas;

      v_geradas_total := v_geradas_total + COALESCE(v_geradas, 0);

      IF COALESCE(v_geradas, 0) > 0 THEN
        RAISE LOG '[gerar_rotinas_auto] % → % obrigações geradas (competência %)',
          v_empresa.razao_social, v_geradas, v_competencia;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_erros := v_erros + 1;
      RAISE LOG '[gerar_rotinas_auto] ERRO em %: %',
        v_empresa.razao_social, SQLERRM;
    END;
  END LOOP;

  RETURN format(
    'Competência %s | %s obrigações geradas | %s erros',
    v_competencia, v_geradas_total, v_erros
  );
END;
$$;

-- Permissão de execução para postgres (usado pelo pg_cron)
GRANT EXECUTE ON FUNCTION public.gerar_rotinas_mensais_auto() TO postgres;

-- ── Remove agendamento anterior se existir ────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gerar-rotinas-mensais') THEN
    PERFORM cron.unschedule('gerar-rotinas-mensais');
  END IF;
END;
$$;

-- ── Agenda: todo dia 1 às 06:00 UTC (03:00 horário Brasília) ─────────────
SELECT cron.schedule(
  'gerar-rotinas-mensais',
  '0 6 1 * *',
  $$ SELECT public.gerar_rotinas_mensais_auto() $$
);
