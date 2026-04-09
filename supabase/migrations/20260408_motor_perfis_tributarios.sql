-- ═══════════════════════════════════════════════════════════════════
-- Motor de Perfis Tributários — Diagnóstico Fiscal
-- Execute no Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- 1. Novos campos na tabela empresas (flags fiscais detalhados)
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS contribuinte_iss  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contribuinte_icms BOOLEAN NOT NULL DEFAULT false;

-- 2. Tabela de regras de ativação (motor data-driven, sem perfis fixos)
CREATE TABLE IF NOT EXISTS public.regra_ativacao_rotina (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rotina_modelo_id UUID NOT NULL REFERENCES public.rotina_modelo(id) ON DELETE CASCADE,
  -- 'qualquer' = não filtra; valor específico = exige essa condição
  regime_tributario TEXT NOT NULL DEFAULT 'qualquer', -- simples | presumido | real | qualquer
  tipo_atividade    TEXT NOT NULL DEFAULT 'qualquer', -- servico | comercio | misto | qualquer
  exige_prolabore   TEXT NOT NULL DEFAULT 'qualquer', -- true | false | qualquer
  exige_funcionario TEXT NOT NULL DEFAULT 'qualquer',
  exige_retencao    TEXT NOT NULL DEFAULT 'qualquer',
  exige_icms        TEXT NOT NULL DEFAULT 'qualquer',
  exige_iss         TEXT NOT NULL DEFAULT 'qualquer',
  ativo             BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: leitura pública (regras são globais, não por usuário)
ALTER TABLE public.regra_ativacao_rotina ENABLE ROW LEVEL SECURITY;

CREATE POLICY "regra_ativacao_select" ON public.regra_ativacao_rotina
  FOR SELECT USING (true);

CREATE POLICY "regra_ativacao_insert" ON public.regra_ativacao_rotina
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "regra_ativacao_update" ON public.regra_ativacao_rotina
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- 3. Helper de seed
CREATE OR REPLACE FUNCTION _ins_rar(
  r_cod TEXT,
  p_regime TEXT DEFAULT 'qualquer',
  p_atividade TEXT DEFAULT 'qualquer',
  p_prolabore TEXT DEFAULT 'qualquer',
  p_funcionario TEXT DEFAULT 'qualquer',
  p_retencao TEXT DEFAULT 'qualquer',
  p_icms TEXT DEFAULT 'qualquer',
  p_iss TEXT DEFAULT 'qualquer'
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.regra_ativacao_rotina
    (rotina_modelo_id, regime_tributario, tipo_atividade, exige_prolabore,
     exige_funcionario, exige_retencao, exige_icms, exige_iss)
  SELECT rm.id, p_regime, p_atividade, p_prolabore, p_funcionario, p_retencao, p_icms, p_iss
  FROM public.rotina_modelo rm WHERE rm.codigo_rotina = r_cod AND rm.ativo = true;
END; $$;

-- 4. Seed: regras por obrigação (cada linha = UMA condição de ativação; OR entre linhas)

-- ── Simples Nacional ───────────────────────────────────────────────────────────
SELECT _ins_rar('FIS-SN-001', 'simples');        -- PGDAS-D
SELECT _ins_rar('FIS-SN-002', 'simples');        -- DAS
SELECT _ins_rar('FIS-SN-003', 'simples');        -- DEFIS

-- ── Departamento Pessoal ───────────────────────────────────────────────────────
SELECT _ins_rar('DP-001', 'qualquer', 'qualquer', 'true');              -- eSocial Pró-labore
SELECT _ins_rar('DP-002', 'qualquer', 'qualquer', 'qualquer', 'true'); -- Folha de Pagamento
SELECT _ins_rar('DP-003', 'qualquer', 'qualquer', 'qualquer', 'true'); -- FGTS Digital
SELECT _ins_rar('DP-004', 'qualquer', 'qualquer', 'qualquer', 'true'); -- eSocial Funcionários

-- ── DCTFWeb (ativa se prolabore OU funcionário OU retenções) ───────────────────
SELECT _ins_rar('FIS-DCTFWEB-001', 'qualquer', 'qualquer', 'true');              -- por pró-labore
SELECT _ins_rar('FIS-DCTFWEB-001', 'qualquer', 'qualquer', 'qualquer', 'true'); -- por funcionário
SELECT _ins_rar('FIS-DCTFWEB-001', 'qualquer', 'qualquer', 'qualquer', 'qualquer', 'true'); -- por retenção

-- ── EFD-Reinf ──────────────────────────────────────────────────────────────────
SELECT _ins_rar('FIS-REINF-001', 'qualquer', 'qualquer', 'qualquer', 'qualquer', 'true');

-- ── Municipal — Serviço / ISS ──────────────────────────────────────────────────
SELECT _ins_rar('FIS-MUN-001', 'qualquer', 'servico');   -- NFS-e em serviço
SELECT _ins_rar('FIS-MUN-001', 'qualquer', 'misto');     -- NFS-e em misto
SELECT _ins_rar('FIS-ISS-001', 'qualquer', 'qualquer', 'qualquer', 'qualquer', 'qualquer', 'qualquer', 'true'); -- ISS: contribuinte ISS
SELECT _ins_rar('FIS-ISS-001', 'qualquer', 'servico');   -- ISS: atividade serviço fallback

-- ── Estadual — Comércio / ICMS ─────────────────────────────────────────────────
SELECT _ins_rar('FIS-EST-001', 'qualquer', 'comercio');  -- NF-e/NFC-e comércio
SELECT _ins_rar('FIS-EST-001', 'qualquer', 'misto');     -- NF-e/NFC-e misto
SELECT _ins_rar('FIS-ICMS-001', 'qualquer', 'qualquer', 'qualquer', 'qualquer', 'qualquer', 'true'); -- ICMS: contribuinte ICMS
SELECT _ins_rar('FIS-ICMS-001', 'qualquer', 'comercio'); -- ICMS: atividade comércio fallback

-- ── Lucro Presumido / Real ─────────────────────────────────────────────────────
SELECT _ins_rar('FIS-PISCOFINS-001', 'presumido');
SELECT _ins_rar('FIS-PISCOFINS-001', 'real');
SELECT _ins_rar('FIS-CONTRIB-001',   'presumido');
SELECT _ins_rar('FIS-CONTRIB-001',   'real');
SELECT _ins_rar('CONT-IRPJ-001',     'presumido');
SELECT _ins_rar('CONT-IRPJ-001',     'real');
SELECT _ins_rar('CONT-CSLL-001',     'presumido');
SELECT _ins_rar('CONT-CSLL-001',     'real');
SELECT _ins_rar('CONT-ECF-001',      'presumido');
SELECT _ins_rar('CONT-ECF-001',      'real');
SELECT _ins_rar('CONT-ECD-001',      'presumido');
SELECT _ins_rar('CONT-ECD-001',      'real');
SELECT _ins_rar('CONT-CONC-001',     'real');  -- Conciliações Fiscais: só Lucro Real

-- ── Fechamento / Gestão (todos) ────────────────────────────────────────────────
SELECT _ins_rar('FIS-FECH-001');    -- Fechamento Fiscal Mensal: qualquer regime
SELECT _ins_rar('CONT-FECH-001', 'presumido');
SELECT _ins_rar('CONT-FECH-001', 'real');
SELECT _ins_rar('GES-CERT-001');    -- Controle de Certidões: todos

-- Remove helper temporário
DROP FUNCTION IF EXISTS _ins_rar(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

-- 5. Função: motor_ativacao(empresa_id)
-- Retorna as rotinas que devem estar ativas para a empresa, com base nas regras
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
  descricao        TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT DISTINCT ON (r.id)
    r.id, r.nome_rotina, r.codigo_rotina, r.tipo_rotina,
    r.departamento, r.periodicidade, r.criticidade,
    r.dia_vencimento, r.meses_offset, r.margem_seguranca, r.descricao
  FROM public.rotina_modelo r
  JOIN public.regra_ativacao_rotina rar
    ON rar.rotina_modelo_id = r.id AND rar.ativo = true
  JOIN public.empresas e
    ON e.id = p_empresa_id
  WHERE r.ativo = true
    -- regime
    AND (rar.regime_tributario = 'qualquer'
         OR rar.regime_tributario = COALESCE(e.regime_tributario, e.regime))
    -- atividade (misto ativa tanto servico quanto comercio)
    AND (rar.tipo_atividade = 'qualquer'
         OR rar.tipo_atividade = e.atividade
         OR (rar.tipo_atividade = 'servico'  AND e.atividade = 'misto')
         OR (rar.tipo_atividade = 'comercio' AND e.atividade = 'misto'))
    -- prolabore
    AND (rar.exige_prolabore = 'qualquer'
         OR (rar.exige_prolabore = 'true'  AND e.possui_prolabore  = true)
         OR (rar.exige_prolabore = 'false' AND e.possui_prolabore  = false))
    -- funcionário
    AND (rar.exige_funcionario = 'qualquer'
         OR (rar.exige_funcionario = 'true'  AND e.possui_funcionario  = true)
         OR (rar.exige_funcionario = 'false' AND e.possui_funcionario  = false))
    -- retenções
    AND (rar.exige_retencao = 'qualquer'
         OR (rar.exige_retencao = 'true'  AND e.tem_retencoes  = true)
         OR (rar.exige_retencao = 'false' AND e.tem_retencoes  = false))
    -- ICMS
    AND (rar.exige_icms = 'qualquer'
         OR (rar.exige_icms = 'true'  AND e.contribuinte_icms  = true)
         OR (rar.exige_icms = 'false' AND e.contribuinte_icms  = false))
    -- ISS
    AND (rar.exige_iss = 'qualquer'
         OR (rar.exige_iss = 'true'  AND e.contribuinte_iss  = true)
         OR (rar.exige_iss = 'false' AND e.contribuinte_iss  = false))
  ORDER BY r.id, r.departamento, r.nome_rotina;
$$;

GRANT EXECUTE ON FUNCTION public.motor_ativacao(UUID) TO authenticated;
