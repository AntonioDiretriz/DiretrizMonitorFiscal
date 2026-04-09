-- ═══════════════════════════════════════════════════════════════════
-- Configuração de Obrigações por Empresa
-- Execute no Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Tabela: overrides por empresa
-- ativo = false → excluída do perfil
-- ativo = true  → forçada (adicionada manualmente, não estava no perfil padrão)
CREATE TABLE IF NOT EXISTS public.empresa_rotina_config (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id       UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  rotina_modelo_id UUID NOT NULL REFERENCES public.rotina_modelo(id) ON DELETE CASCADE,
  ativo            BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(empresa_id, rotina_modelo_id)
);

ALTER TABLE public.empresa_rotina_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "erc_select" ON public.empresa_rotina_config FOR SELECT
  USING (
    auth.uid() = user_id
    OR (SELECT escritorio_owner_id FROM public.usuarios_perfil WHERE user_id = auth.uid()) = user_id
  );

CREATE POLICY "erc_insert" ON public.empresa_rotina_config FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "erc_update" ON public.empresa_rotina_config FOR UPDATE
  USING (
    auth.uid() = user_id
    OR (SELECT escritorio_owner_id FROM public.usuarios_perfil WHERE user_id = auth.uid()) = user_id
  );

CREATE POLICY "erc_delete" ON public.empresa_rotina_config FOR DELETE
  USING (
    auth.uid() = user_id
    OR (SELECT escritorio_owner_id FROM public.usuarios_perfil WHERE user_id = auth.uid()) = user_id
  );

-- ── Atualização do motor_ativacao ────────────────────────────────────────────
-- Agora respeita overrides: exclusões (ativo=false) e adições manuais (ativo=true)
CREATE OR REPLACE FUNCTION public.motor_ativacao(p_empresa_id UUID)
RETURNS TABLE(
  id               UUID,
  nome_rotina      TEXT,
  codigo_rotina    TEXT,
  tipo_rotina      TEXT,
  departamento     TEXT,
  periodicidade    TEXT,
  criticidade      TEXT,
  dia_vencimento   INTEGER,
  meses_offset     INTEGER,
  margem_seguranca INTEGER,
  descricao        TEXT,
  origem           TEXT   -- 'perfil' | 'manual'
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$

  -- 1. Obrigações do perfil padrão, excluindo as que foram desativadas manualmente
  SELECT DISTINCT ON (r.id)
    r.id, r.nome_rotina, r.codigo_rotina, r.tipo_rotina,
    r.departamento, r.periodicidade, r.criticidade,
    r.dia_vencimento, r.meses_offset, r.margem_seguranca, r.descricao,
    'perfil'::TEXT AS origem
  FROM public.rotina_modelo r
  JOIN public.regra_ativacao_rotina rar
    ON rar.rotina_modelo_id = r.id AND rar.ativo = true
  JOIN public.empresas e
    ON e.id = p_empresa_id
  WHERE r.ativo = true
    AND (rar.regime_tributario = 'qualquer' OR rar.regime_tributario = COALESCE(e.regime_tributario, e.regime))
    AND (rar.tipo_atividade = 'qualquer'
         OR rar.tipo_atividade = e.atividade
         OR (rar.tipo_atividade = 'servico'  AND e.atividade = 'misto')
         OR (rar.tipo_atividade = 'comercio' AND e.atividade = 'misto'))
    AND (rar.exige_prolabore = 'qualquer'
         OR (rar.exige_prolabore = 'true'  AND e.possui_prolabore = true)
         OR (rar.exige_prolabore = 'false' AND e.possui_prolabore = false))
    AND (rar.exige_funcionario = 'qualquer'
         OR (rar.exige_funcionario = 'true'  AND e.possui_funcionario = true)
         OR (rar.exige_funcionario = 'false' AND e.possui_funcionario = false))
    AND (rar.exige_retencao = 'qualquer'
         OR (rar.exige_retencao = 'true'  AND e.tem_retencoes = true)
         OR (rar.exige_retencao = 'false' AND e.tem_retencoes = false))
    AND (rar.exige_icms = 'qualquer'
         OR (rar.exige_icms = 'true'  AND e.contribuinte_icms = true)
         OR (rar.exige_icms = 'false' AND e.contribuinte_icms = false))
    AND (rar.exige_iss = 'qualquer'
         OR (rar.exige_iss = 'true'  AND e.contribuinte_iss = true)
         OR (rar.exige_iss = 'false' AND e.contribuinte_iss = false))
    -- Não retorna se foi excluída manualmente
    AND NOT EXISTS (
      SELECT 1 FROM public.empresa_rotina_config erc
      WHERE erc.empresa_id = p_empresa_id
        AND erc.rotina_modelo_id = r.id
        AND erc.ativo = false
    )
  ORDER BY r.id

  UNION ALL

  -- 2. Obrigações adicionadas manualmente (não estão no perfil padrão)
  SELECT
    r.id, r.nome_rotina, r.codigo_rotina, r.tipo_rotina,
    r.departamento, r.periodicidade, r.criticidade,
    r.dia_vencimento, r.meses_offset, r.margem_seguranca, r.descricao,
    'manual'::TEXT AS origem
  FROM public.rotina_modelo r
  JOIN public.empresa_rotina_config erc
    ON erc.rotina_modelo_id = r.id
    AND erc.empresa_id = p_empresa_id
    AND erc.ativo = true
  WHERE r.ativo = true;

$$;

GRANT EXECUTE ON FUNCTION public.motor_ativacao(UUID) TO authenticated;
