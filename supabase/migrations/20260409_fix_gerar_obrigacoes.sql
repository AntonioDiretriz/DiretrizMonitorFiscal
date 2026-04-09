-- ═══════════════════════════════════════════════════════════════════
-- Fix: gerar_obrigacoes usa motor_ativacao + lê regime_tributario
-- Execute no Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.gerar_obrigacoes(
  p_user_id      UUID,
  p_empresa_id   UUID,
  p_competencia  DATE   -- primeiro dia do mês de competência
)
RETURNS INTEGER   -- número de obrigações geradas
LANGUAGE plpgsql AS $$
DECLARE
  v_rm         RECORD;
  v_vencimento DATE;
  v_prazo_int  DATE;
  v_geradas    INTEGER := 0;
  v_base       DATE;
BEGIN
  -- Verifica se a empresa existe
  IF NOT EXISTS (SELECT 1 FROM public.empresas WHERE id = p_empresa_id) THEN
    RETURN 0;
  END IF;

  -- Itera sobre as obrigações do perfil da empresa via motor_ativacao
  FOR v_rm IN
    SELECT ma.*
      FROM public.motor_ativacao(p_empresa_id) ma
     WHERE ma.periodicidade IN ('mensal', 'trimestral', 'eventual')
        OR (
          -- Anuais: só gera no mês correto (meses_offset indica o mês de vencimento a partir de jan)
          ma.periodicidade = 'anual'
          AND EXTRACT(MONTH FROM (DATE_TRUNC('year', p_competencia) + (ma.meses_offset || ' months')::INTERVAL - INTERVAL '1 day')) =
              EXTRACT(MONTH FROM (p_competencia + (ma.meses_offset || ' months')::INTERVAL))
        )
  LOOP
    -- Não gerar duplicata para mesma empresa+competencia+tipo
    IF EXISTS (
      SELECT 1 FROM public.rotinas r
       WHERE r.empresa_id  = p_empresa_id
         AND r.competencia = p_competencia
         AND r.tipo        = v_rm.tipo_rotina
         AND r.user_id     = p_user_id
    ) THEN
      CONTINUE;
    END IF;

    -- Calcula vencimento: meses_offset após competência, no dia dia_vencimento
    v_base       := p_competencia + (COALESCE(v_rm.meses_offset, 1) || ' months')::INTERVAL;
    v_vencimento := DATE_TRUNC('month', v_base)
                    + LEAST(
                        COALESCE(v_rm.dia_vencimento, 20) - 1,
                        EXTRACT(DAY FROM (DATE_TRUNC('month', v_base) + INTERVAL '1 month - 1 day'))::INT
                      ) * INTERVAL '1 day';
    v_prazo_int  := v_vencimento - COALESCE(v_rm.margem_seguranca, 3);

    INSERT INTO public.rotinas (
      user_id, empresa_id, titulo, tipo,
      competencia, data_vencimento, data_vencimento_interno,
      prazo_interno, status, etapa, origem, risco
    ) VALUES (
      p_user_id, p_empresa_id,
      v_rm.nome_rotina,
      v_rm.tipo_rotina,
      p_competencia,
      v_vencimento,
      v_prazo_int,
      v_prazo_int,
      'pendente', 'preparar', 'automatica',
      CASE v_rm.criticidade
        WHEN 'critica' THEN 'critico'
        WHEN 'alta'    THEN 'alto'
        WHEN 'media'   THEN 'medio'
        ELSE 'baixo'
      END
    );

    v_geradas := v_geradas + 1;
  END LOOP;

  RETURN v_geradas;
END;
$$;

GRANT EXECUTE ON FUNCTION public.gerar_obrigacoes(UUID, UUID, DATE) TO authenticated;
