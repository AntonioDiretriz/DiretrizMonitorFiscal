-- ═══════════════════════════════════════════════════════════════════
-- Regras de Vencimento por Usuário/Escritório
-- Permite customizar dia legal e prazo interno por obrigação
-- Execute no Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.regra_vencimento_usuario (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rotina_modelo_id UUID NOT NULL REFERENCES public.rotina_modelo(id) ON DELETE CASCADE,
  dia_vencimento   INTEGER,   -- override do dia legal (1–31)
  dias_margem      INTEGER,   -- dias antes do vencimento → prazo interno
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, rotina_modelo_id)
);

ALTER TABLE public.regra_vencimento_usuario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rvu_select" ON public.regra_vencimento_usuario FOR SELECT
  USING (
    auth.uid() = user_id
    OR (SELECT escritorio_owner_id FROM public.usuarios_perfil WHERE user_id = auth.uid()) = user_id
  );

CREATE POLICY "rvu_insert" ON public.regra_vencimento_usuario FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "rvu_update" ON public.regra_vencimento_usuario FOR UPDATE
  USING (
    auth.uid() = user_id
    OR (SELECT escritorio_owner_id FROM public.usuarios_perfil WHERE user_id = auth.uid()) = user_id
  );

CREATE POLICY "rvu_delete" ON public.regra_vencimento_usuario FOR DELETE
  USING (
    auth.uid() = user_id
    OR (SELECT escritorio_owner_id FROM public.usuarios_perfil WHERE user_id = auth.uid()) = user_id
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_rvu_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_rvu_updated_at ON public.regra_vencimento_usuario;
CREATE TRIGGER trg_rvu_updated_at
  BEFORE UPDATE ON public.regra_vencimento_usuario
  FOR EACH ROW EXECUTE FUNCTION public.set_rvu_updated_at();

-- ── Atualiza gerar_obrigacoes para usar regras do usuário ──────────────────
CREATE OR REPLACE FUNCTION public.gerar_obrigacoes(
  p_user_id      UUID,
  p_empresa_id   UUID,
  p_competencia  DATE
)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  v_rm         RECORD;
  v_rvu        RECORD;
  v_vencimento DATE;
  v_prazo_int  DATE;
  v_geradas    INTEGER := 0;
  v_base       DATE;
  v_dia        INTEGER;
  v_margem     INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.empresas WHERE id = p_empresa_id) THEN
    RETURN 0;
  END IF;

  FOR v_rm IN
    SELECT ma.*
      FROM public.motor_ativacao(p_empresa_id) ma
     WHERE ma.periodicidade IN ('mensal', 'trimestral', 'eventual')
        OR (
          ma.periodicidade = 'anual'
          AND EXTRACT(MONTH FROM (p_competencia + (ma.meses_offset || ' months')::INTERVAL)) =
              EXTRACT(MONTH FROM (p_competencia + (ma.meses_offset || ' months')::INTERVAL))
        )
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.rotinas r
       WHERE r.empresa_id  = p_empresa_id
         AND r.competencia = p_competencia
         AND r.tipo        = v_rm.tipo_rotina
         AND r.user_id     = p_user_id
    ) THEN
      CONTINUE;
    END IF;

    -- Busca regra personalizada do usuário para esta obrigação
    SELECT dia_vencimento, dias_margem
      INTO v_rvu
      FROM public.regra_vencimento_usuario
     WHERE user_id = p_user_id
       AND rotina_modelo_id = v_rm.id;

    -- Usa regra do usuário se existir, senão usa padrão do modelo
    v_dia    := COALESCE(v_rvu.dia_vencimento, v_rm.dia_vencimento, 20);
    v_margem := COALESCE(v_rvu.dias_margem,    v_rm.margem_seguranca, 3);

    v_base       := p_competencia + (COALESCE(v_rm.meses_offset, 1) || ' months')::INTERVAL;
    v_vencimento := DATE_TRUNC('month', v_base)
                    + LEAST(
                        v_dia - 1,
                        EXTRACT(DAY FROM (DATE_TRUNC('month', v_base) + INTERVAL '1 month - 1 day'))::INT
                      ) * INTERVAL '1 day';
    v_prazo_int  := v_vencimento - v_margem;

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
