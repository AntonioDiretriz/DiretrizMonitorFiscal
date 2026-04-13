-- ═══════════════════════════════════════════════════════════════════
-- Responsáveis por departamento em cada empresa
-- Execute no Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS responsavel_fiscal_id   UUID REFERENCES public.usuarios_perfil(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responsavel_contabil_id UUID REFERENCES public.usuarios_perfil(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responsavel_pessoal_id  UUID REFERENCES public.usuarios_perfil(id) ON DELETE SET NULL;

-- Atualiza gerar_obrigacoes para usar responsável da empresa por departamento
-- Prioridade: 1) responsável específico da empresa  2) membro com departamento global
CREATE OR REPLACE FUNCTION public.gerar_obrigacoes(
  p_user_id     UUID,
  p_empresa_id  UUID,
  p_competencia DATE
)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  v_rm              RECORD;
  v_rvu             RECORD;
  v_emp             RECORD;
  v_vencimento      DATE;
  v_prazo_int       DATE;
  v_geradas         INTEGER := 0;
  v_base            DATE;
  v_dia             INTEGER;
  v_margem          INTEGER;
  v_responsavel_id  UUID;
BEGIN
  -- Busca responsáveis configurados na empresa
  SELECT responsavel_fiscal_id, responsavel_contabil_id, responsavel_pessoal_id
    INTO v_emp
    FROM public.empresas
   WHERE id = p_empresa_id;

  IF NOT FOUND THEN RETURN 0; END IF;

  FOR v_rm IN
    SELECT ma.*
      FROM public.motor_ativacao(p_empresa_id) ma
     WHERE ma.periodicidade IN ('mensal', 'trimestral', 'eventual')
        OR (
          ma.periodicidade = 'anual'
          AND EXTRACT(MONTH FROM (DATE_TRUNC('year', p_competencia) + (ma.meses_offset || ' months')::INTERVAL - INTERVAL '1 day')) =
              EXTRACT(MONTH FROM (p_competencia + (ma.meses_offset || ' months')::INTERVAL))
        )
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.rotinas r
       WHERE r.empresa_id  = p_empresa_id
         AND r.competencia = p_competencia
         AND r.tipo        = v_rm.tipo_rotina
         AND r.user_id     = p_user_id
    ) THEN CONTINUE; END IF;

    -- Regra personalizada do usuário para esta obrigação
    SELECT dia_vencimento, dias_margem INTO v_rvu
      FROM public.regra_vencimento_usuario
     WHERE user_id = p_user_id AND rotina_modelo_id = v_rm.id;

    v_dia    := COALESCE(v_rvu.dia_vencimento, v_rm.dia_vencimento, 20);
    v_margem := COALESCE(v_rvu.dias_margem, v_rm.margem_seguranca, 3);

    -- Vencimento legal → próximo dia útil se cair em feriado/fim-de-semana
    v_base       := p_competencia + (COALESCE(v_rm.meses_offset, 1) || ' months')::INTERVAL;
    v_vencimento := DATE_TRUNC('month', v_base)
                    + LEAST(v_dia - 1,
                            EXTRACT(DAY FROM (DATE_TRUNC('month', v_base) + INTERVAL '1 month - 1 day'))::INT
                           ) * INTERVAL '1 day';
    v_vencimento := public.proximo_dia_util(v_vencimento);

    -- Prazo interno = vencimento - margem → dia útil anterior
    v_prazo_int  := public.anterior_dia_util(v_vencimento - v_margem);

    -- ── Determina responsável ───────────────────────────────────────
    -- 1. Responsável específico da empresa por departamento
    v_responsavel_id := CASE v_rm.departamento
      WHEN 'Fiscal'   THEN v_emp.responsavel_fiscal_id
      WHEN 'Contábil' THEN v_emp.responsavel_contabil_id
      WHEN 'DP'       THEN v_emp.responsavel_pessoal_id
      ELSE NULL
    END;

    -- 2. Fallback: membro da equipe com o departamento global
    IF v_responsavel_id IS NULL THEN
      SELECT up.id INTO v_responsavel_id
        FROM public.usuarios_perfil up
       WHERE up.escritorio_owner_id = p_user_id
         AND up.papel_rotinas IN ('responsavel', 'ambos')
         AND v_rm.departamento = ANY(COALESCE(up.departamentos, '{}'))
       ORDER BY up.nome
       LIMIT 1;
    END IF;

    INSERT INTO public.rotinas (
      user_id, empresa_id, titulo, tipo,
      competencia, data_vencimento, data_vencimento_interno,
      prazo_interno, status, etapa, origem, risco,
      responsavel_id
    ) VALUES (
      p_user_id, p_empresa_id,
      v_rm.nome_rotina, v_rm.tipo_rotina,
      p_competencia,
      v_vencimento, v_prazo_int, v_prazo_int,
      'pendente', 'preparar', 'automatica',
      CASE v_rm.criticidade
        WHEN 'critica' THEN 'critico'
        WHEN 'alta'    THEN 'alto'
        WHEN 'media'   THEN 'medio'
        ELSE 'baixo'
      END,
      v_responsavel_id
    );

    v_geradas := v_geradas + 1;
  END LOOP;

  RETURN v_geradas;
END; $$;

GRANT EXECUTE ON FUNCTION public.gerar_obrigacoes(UUID, UUID, DATE) TO authenticated;
