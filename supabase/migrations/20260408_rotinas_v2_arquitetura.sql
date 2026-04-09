-- ═══════════════════════════════════════════════════════════════════
-- Rotinas v2 — Arquitetura Rotina / Obrigação / Tarefa
-- Execute no Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- 1. Adiciona regime à empresas (Simples | Presumido | Real | MEI)
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS regime TEXT NOT NULL DEFAULT 'simples';

-- 2. Novos campos na tabela rotinas (= Obrigação)
ALTER TABLE public.rotinas
  ADD COLUMN IF NOT EXISTS risco               TEXT NOT NULL DEFAULT 'baixo',
  ADD COLUMN IF NOT EXISTS responsabilidade_erro TEXT,
  ADD COLUMN IF NOT EXISTS prazo_interno        DATE;

-- 3. Tarefas da Obrigação (checklist de execução)
CREATE TABLE IF NOT EXISTS public.rotinas_tarefas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rotina_id       UUID NOT NULL REFERENCES public.rotinas(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  nome            TEXT NOT NULL,
  ordem           INTEGER NOT NULL DEFAULT 0,
  dependente_de   UUID REFERENCES public.rotinas_tarefas(id)  ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'pendente',
  -- pendente | em_andamento | concluida | bloqueada
  comprovante_url TEXT,
  observacao      TEXT,
  data_inicio     TIMESTAMPTZ,
  data_conclusao  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rotinas_tarefas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rotinas_tarefas_select" ON public.rotinas_tarefas FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.rotinas r WHERE r.id = rotina_id
    AND (r.user_id = auth.uid()
         OR (SELECT escritorio_owner_id FROM public.usuarios_perfil WHERE user_id = auth.uid()) = r.user_id)
  )
);
CREATE POLICY "rotinas_tarefas_insert" ON public.rotinas_tarefas FOR INSERT WITH CHECK (
  auth.uid() = user_id
);
CREATE POLICY "rotinas_tarefas_update" ON public.rotinas_tarefas FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.rotinas r WHERE r.id = rotina_id
    AND (r.user_id = auth.uid()
         OR (SELECT escritorio_owner_id FROM public.usuarios_perfil WHERE user_id = auth.uid()) = r.user_id)
  )
);
CREATE POLICY "rotinas_tarefas_delete" ON public.rotinas_tarefas FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.rotinas r WHERE r.id = rotina_id
    AND (r.user_id = auth.uid()
         OR (SELECT escritorio_owner_id FROM public.usuarios_perfil WHERE user_id = auth.uid()) = r.user_id)
  )
);

CREATE INDEX IF NOT EXISTS idx_rotinas_tarefas_rotina_id ON public.rotinas_tarefas(rotina_id);
CREATE INDEX IF NOT EXISTS idx_rotinas_tarefas_status    ON public.rotinas_tarefas(status);

CREATE OR REPLACE FUNCTION public.set_rotinas_tarefas_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_rotinas_tarefas_updated_at ON public.rotinas_tarefas;
CREATE TRIGGER trg_rotinas_tarefas_updated_at
  BEFORE UPDATE ON public.rotinas_tarefas
  FOR EACH ROW EXECUTE FUNCTION public.set_rotinas_tarefas_updated_at();

-- ═══════════════════════════════════════════════════════════════════
-- 4. Função: Gerar obrigações automáticas para uma empresa + competência
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.gerar_obrigacoes(
  p_user_id      UUID,
  p_empresa_id   UUID,
  p_competencia  DATE   -- primeiro dia do mês de competência
)
RETURNS INTEGER   -- número de obrigações geradas
LANGUAGE plpgsql AS $$
DECLARE
  v_empresa        RECORD;
  v_perfil         RECORD;
  v_rm             RECORD;
  v_vencimento     DATE;
  v_prazo_int      DATE;
  v_geradas        INTEGER := 0;
  v_base           DATE;
BEGIN
  -- Busca dados da empresa
  SELECT regime, atividade, possui_prolabore, possui_funcionario, tem_retencoes, tem_reinf
    INTO v_empresa
    FROM public.empresas
   WHERE id = p_empresa_id;

  IF NOT FOUND THEN RETURN 0; END IF;

  -- Seleciona as rotinas_modelo aplicáveis ao perfil da empresa
  FOR v_rm IN
    SELECT rm.*
      FROM public.rotina_modelo rm
     WHERE rm.ativo = true
       AND (
         -- regime aplicável
         rm.codigo_rotina LIKE 'FIS-SN%'  AND v_empresa.regime = 'simples'   OR
         rm.codigo_rotina LIKE 'FIS-SN%'  AND v_empresa.regime = 'mei'       OR
         rm.codigo_rotina NOT LIKE 'FIS-SN%' AND v_empresa.regime IN ('presumido','real') OR
         rm.departamento = 'DP'
       )
       -- gatilhos condicionais
       AND (
         rm.gatilho IS NULL
         OR (rm.gatilho = 'possui_prolabore'   AND v_empresa.possui_prolabore   = true)
         OR (rm.gatilho = 'possui_funcionario' AND v_empresa.possui_funcionario = true)
         OR (rm.gatilho = 'tem_reinf'          AND v_empresa.tem_reinf          = true)
         OR (rm.gatilho = 'servico'            AND v_empresa.atividade IN ('servico','misto'))
         OR (rm.gatilho = 'comercio'           AND v_empresa.atividade IN ('comercio','misto'))
       )
       -- não gerar duplicata para mesma empresa+competencia+tipo
       AND NOT EXISTS (
         SELECT 1 FROM public.rotinas r
          WHERE r.empresa_id   = p_empresa_id
            AND r.competencia  = p_competencia
            AND r.tipo         = rm.tipo_rotina
            AND r.user_id      = p_user_id
       )
  LOOP
    -- Calcula vencimento: meses_offset após competência, no dia dia_vencimento
    v_base := p_competencia + (rm.meses_offset || ' months')::INTERVAL;
    -- Ajusta para o dia de vencimento (cap no último dia do mês)
    v_vencimento := DATE_TRUNC('month', v_base)
                    + LEAST(rm.dia_vencimento - 1,
                            EXTRACT(DAY FROM (DATE_TRUNC('month', v_base) + INTERVAL '1 month - 1 day'))::INT
                           ) * INTERVAL '1 day';
    v_prazo_int  := v_vencimento - rm.margem_seguranca;

    INSERT INTO public.rotinas (
      user_id, empresa_id, titulo, tipo,
      competencia, data_vencimento, data_vencimento_interno,
      prazo_interno, status, etapa, origem, risco
    ) VALUES (
      p_user_id, p_empresa_id,
      rm.nome_rotina,
      rm.tipo_rotina,
      p_competencia,
      v_vencimento,
      v_prazo_int,
      v_prazo_int,
      'pendente', 'preparar', 'automatica',
      CASE rm.criticidade
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
