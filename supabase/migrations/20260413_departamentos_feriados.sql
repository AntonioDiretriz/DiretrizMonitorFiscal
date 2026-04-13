-- ═══════════════════════════════════════════════════════════════════
-- Departamentos por membro + Feriados nacionais + Ajuste de prazos
-- Execute no Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- 1. Departamentos que o membro da equipe é responsável
ALTER TABLE public.usuarios_perfil
  ADD COLUMN IF NOT EXISTS departamentos TEXT[] NOT NULL DEFAULT '{}';

-- 2. Tabela de feriados nacionais
CREATE TABLE IF NOT EXISTS public.feriados_nacionais (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data DATE NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'nacional'
);

ALTER TABLE public.feriados_nacionais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feriados_select" ON public.feriados_nacionais FOR SELECT USING (true);

-- Seed feriados fixos + moveis calculados 2024-2028
INSERT INTO public.feriados_nacionais (data, nome) VALUES
-- 2024 ─ fixos
('2024-01-01','Confraternização Universal'),
('2024-04-21','Tiradentes'),
('2024-05-01','Dia do Trabalho'),
('2024-09-07','Independência do Brasil'),
('2024-10-12','Nossa Senhora Aparecida'),
('2024-11-02','Finados'),
('2024-11-15','Proclamação da República'),
('2024-11-20','Dia da Consciência Negra'),
('2024-12-25','Natal'),
-- 2024 ─ móveis (Páscoa 31/03)
('2024-02-12','Carnaval (segunda)'),
('2024-02-13','Carnaval (terça)'),
('2024-03-29','Sexta-feira Santa'),
('2024-05-30','Corpus Christi'),
-- 2025 ─ fixos
('2025-01-01','Confraternização Universal'),
('2025-04-21','Tiradentes'),
('2025-05-01','Dia do Trabalho'),
('2025-09-07','Independência do Brasil'),
('2025-10-12','Nossa Senhora Aparecida'),
('2025-11-02','Finados'),
('2025-11-15','Proclamação da República'),
('2025-11-20','Dia da Consciência Negra'),
('2025-12-25','Natal'),
-- 2025 ─ móveis (Páscoa 20/04)
('2025-03-03','Carnaval (segunda)'),
('2025-03-04','Carnaval (terça)'),
('2025-04-18','Sexta-feira Santa'),
('2025-06-19','Corpus Christi'),
-- 2026 ─ fixos
('2026-01-01','Confraternização Universal'),
('2026-04-21','Tiradentes'),
('2026-05-01','Dia do Trabalho'),
('2026-09-07','Independência do Brasil'),
('2026-10-12','Nossa Senhora Aparecida'),
('2026-11-02','Finados'),
('2026-11-15','Proclamação da República'),
('2026-11-20','Dia da Consciência Negra'),
('2026-12-25','Natal'),
-- 2026 ─ móveis (Páscoa 05/04)
('2026-02-16','Carnaval (segunda)'),
('2026-02-17','Carnaval (terça)'),
('2026-04-03','Sexta-feira Santa'),
('2026-06-04','Corpus Christi'),
-- 2027 ─ fixos
('2027-01-01','Confraternização Universal'),
('2027-04-21','Tiradentes'),
('2027-05-01','Dia do Trabalho'),
('2027-09-07','Independência do Brasil'),
('2027-10-12','Nossa Senhora Aparecida'),
('2027-11-02','Finados'),
('2027-11-15','Proclamação da República'),
('2027-11-20','Dia da Consciência Negra'),
('2027-12-25','Natal'),
-- 2027 ─ móveis (Páscoa 28/03)
('2027-02-08','Carnaval (segunda)'),
('2027-02-09','Carnaval (terça)'),
('2027-03-26','Sexta-feira Santa'),
('2027-05-27','Corpus Christi'),
-- 2028 ─ fixos
('2028-01-01','Confraternização Universal'),
('2028-04-21','Tiradentes'),
('2028-05-01','Dia do Trabalho'),
('2028-09-07','Independência do Brasil'),
('2028-10-12','Nossa Senhora Aparecida'),
('2028-11-02','Finados'),
('2028-11-15','Proclamação da República'),
('2028-11-20','Dia da Consciência Negra'),
('2028-12-25','Natal'),
-- 2028 ─ móveis (Páscoa 16/04)
('2028-02-28','Carnaval (segunda)'),
('2028-02-29','Carnaval (terça)'),
('2028-04-14','Sexta-feira Santa'),
('2028-06-15','Corpus Christi')
ON CONFLICT (data) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────
-- 3. anterior_dia_util: recua até o dia útil anterior ao feriado/fim-de-semana
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.anterior_dia_util(p_data DATE)
RETURNS DATE LANGUAGE plpgsql AS $$
DECLARE
  v_data DATE := p_data;
  v_iter INTEGER := 0;
BEGIN
  LOOP
    v_iter := v_iter + 1;
    IF v_iter > 31 THEN RETURN p_data; END IF; -- safety
    IF EXTRACT(DOW FROM v_data) IN (0, 6) -- domingo=0, sábado=6
       OR EXISTS (SELECT 1 FROM public.feriados_nacionais WHERE data = v_data) THEN
      v_data := v_data - 1;
    ELSE
      RETURN v_data;
    END IF;
  END LOOP;
END; $$;

GRANT EXECUTE ON FUNCTION public.anterior_dia_util(DATE) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 4. proximo_dia_util: avança até o próximo dia útil (usado no vencimento legal)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.proximo_dia_util(p_data DATE)
RETURNS DATE LANGUAGE plpgsql AS $$
DECLARE
  v_data DATE := p_data;
  v_iter INTEGER := 0;
BEGIN
  LOOP
    v_iter := v_iter + 1;
    IF v_iter > 31 THEN RETURN p_data; END IF;
    IF EXTRACT(DOW FROM v_data) IN (0, 6)
       OR EXISTS (SELECT 1 FROM public.feriados_nacionais WHERE data = v_data) THEN
      v_data := v_data + 1;
    ELSE
      RETURN v_data;
    END IF;
  END LOOP;
END; $$;

GRANT EXECUTE ON FUNCTION public.proximo_dia_util(DATE) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 5. Atualiza gerar_obrigacoes: auto-atribui responsável + ajusta prazos nos feriados
-- ─────────────────────────────────────────────────────────────────
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
  v_vencimento      DATE;
  v_prazo_int       DATE;
  v_geradas         INTEGER := 0;
  v_base            DATE;
  v_dia             INTEGER;
  v_margem          INTEGER;
  v_responsavel_id  UUID;
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
    ) THEN
      CONTINUE;
    END IF;

    -- Regra personalizada do usuário para esta obrigação
    SELECT dia_vencimento, dias_margem
      INTO v_rvu
      FROM public.regra_vencimento_usuario
     WHERE user_id = p_user_id
       AND rotina_modelo_id = v_rm.id;

    v_dia    := COALESCE(v_rvu.dia_vencimento, v_rm.dia_vencimento, 20);
    v_margem := COALESCE(v_rvu.dias_margem, v_rm.margem_seguranca, 3);

    -- Calcula data base
    v_base       := p_competencia + (COALESCE(v_rm.meses_offset, 1) || ' months')::INTERVAL;
    v_vencimento := DATE_TRUNC('month', v_base)
                    + LEAST(
                        v_dia - 1,
                        EXTRACT(DAY FROM (DATE_TRUNC('month', v_base) + INTERVAL '1 month - 1 day'))::INT
                      ) * INTERVAL '1 day';

    -- Ajusta vencimento legal para próximo dia útil se cair em feriado/fim-de-semana
    v_vencimento := public.proximo_dia_util(v_vencimento);

    -- Prazo interno = vencimento - margem, ajustado para dia útil anterior
    v_prazo_int  := public.anterior_dia_util(v_vencimento - v_margem);

    -- Auto-atribui responsável: membro da equipe com o departamento e papel correto
    SELECT up.id INTO v_responsavel_id
      FROM public.usuarios_perfil up
     WHERE up.escritorio_owner_id = p_user_id
       AND up.papel_rotinas IN ('responsavel', 'ambos')
       AND v_rm.departamento = ANY(COALESCE(up.departamentos, '{}'))
     ORDER BY up.nome
     LIMIT 1;

    INSERT INTO public.rotinas (
      user_id, empresa_id, titulo, tipo,
      competencia, data_vencimento, data_vencimento_interno,
      prazo_interno, status, etapa, origem, risco,
      responsavel_id
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
      END,
      v_responsavel_id
    );

    v_geradas := v_geradas + 1;
  END LOOP;

  RETURN v_geradas;
END; $$;

GRANT EXECUTE ON FUNCTION public.gerar_obrigacoes(UUID, UUID, DATE) TO authenticated;
