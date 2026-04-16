-- ═══════════════════════════════════════════════════════════════════════════
-- PERFIS-MODELO E ROTINAS-PADRÃO
-- Execute no Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Campos operacionais na tabela empresas ──────────────────────────────────
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS atividade           TEXT DEFAULT 'servico',
  ADD COLUMN IF NOT EXISTS possui_prolabore    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS possui_funcionario  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tem_retencoes       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tem_reinf           BOOLEAnN NOT NULL DEFAULT false;

-- ── Campos de integração Domínio (se não existirem) ─────────────────────────
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS codigo_dominio       TEXT,
  ADD COLUMN IF NOT EXISTS plano_contas_dominio TEXT,
  ADD COLUMN IF NOT EXISTS codigo_contabil      TEXT;

-- ── Tabela: perfil_modelo ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.perfil_modelo (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_exibicao       TEXT NOT NULL,
  codigo_perfil       TEXT NOT NULL UNIQUE,
  regime              TEXT NOT NULL,   -- simples | presumido | real
  atividade           TEXT NOT NULL,   -- servico | comercio | misto
  possui_prolabore    BOOLEAN NOT NULL DEFAULT true,
  possui_funcionario  BOOLEAN NOT NULL DEFAULT false,
  descricao           TEXT,
  ativo               BOOLEAN NOT NULL DEFAULT true
);

-- ── Tabela: rotina_modelo ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rotina_modelo (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_rotina       TEXT NOT NULL,
  codigo_rotina     TEXT NOT NULL UNIQUE,
  tipo_rotina       TEXT NOT NULL,      -- das | fgts | inss | iss | irpj | folha | ecf | ecd | outro ...
  departamento      TEXT NOT NULL,      -- Fiscal | Contábil | DP | Legalização | Financeiro | Gestão
  periodicidade     TEXT NOT NULL,      -- mensal | trimestral | anual | eventual
  criticidade       TEXT NOT NULL DEFAULT 'alta',  -- baixa | media | alta | critica
  dia_vencimento    INTEGER,            -- dia do mês de vencimento
  meses_offset      INTEGER DEFAULT 1,  -- meses após competência (1 = mês seguinte)
  margem_seguranca  INTEGER DEFAULT 3,  -- dias de antecedência do prazo legal
  exige_comprovante BOOLEAN NOT NULL DEFAULT true,
  gatilho           TEXT,               -- campo da empresa que ativa esta rotina
  descricao         TEXT,
  ativo             BOOLEAN NOT NULL DEFAULT true
);

-- ── Tabela: perfil_rotina ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.perfil_rotina (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_modelo_id UUID NOT NULL REFERENCES public.perfil_modelo(id) ON DELETE CASCADE,
  rotina_modelo_id UUID NOT NULL REFERENCES public.rotina_modelo(id) ON DELETE CASCADE,
  obrigatoria      BOOLEAN NOT NULL DEFAULT true,
  ordem_execucao   INTEGER DEFAULT 0,
  condicional      TEXT,    -- ex: 'possui_funcionario' — só gera se empresa.campo=true
  UNIQUE (perfil_modelo_id, rotina_modelo_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: 18 PERFIS-MODELO
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.perfil_modelo (nome_exibicao, codigo_perfil, regime, atividade, possui_prolabore, possui_funcionario, descricao) VALUES
-- Simples Nacional
('SN | Serviço | Pró-labore | Sem Funcionário',  'SN-SERV-PL-SF', 'simples',   'servico',  true, false, 'Simples Nacional, serviço, sem CLT'),
('SN | Serviço | Pró-labore | Com Funcionário',  'SN-SERV-PL-CF', 'simples',   'servico',  true, true,  'Simples Nacional, serviço, com CLT'),
('SN | Comércio | Pró-labore | Sem Funcionário', 'SN-COM-PL-SF',  'simples',   'comercio', true, false, 'Simples Nacional, comércio, sem CLT'),
('SN | Comércio | Pró-labore | Com Funcionário', 'SN-COM-PL-CF',  'simples',   'comercio', true, true,  'Simples Nacional, comércio, com CLT'),
('SN | Misto | Pró-labore | Sem Funcionário',    'SN-MIX-PL-SF',  'simples',   'misto',    true, false, 'Simples Nacional, serv+com, sem CLT'),
('SN | Misto | Pró-labore | Com Funcionário',    'SN-MIX-PL-CF',  'simples',   'misto',    true, true,  'Simples Nacional, serv+com, com CLT'),
-- Lucro Presumido
('LP | Serviço | Pró-labore | Sem Funcionário',  'LP-SERV-PL-SF', 'presumido', 'servico',  true, false, 'Lucro Presumido, serviço, sem CLT'),
('LP | Serviço | Pró-labore | Com Funcionário',  'LP-SERV-PL-CF', 'presumido', 'servico',  true, true,  'Lucro Presumido, serviço, com CLT'),
('LP | Comércio | Pró-labore | Sem Funcionário', 'LP-COM-PL-SF',  'presumido', 'comercio', true, false, 'Lucro Presumido, comércio, sem CLT'),
('LP | Comércio | Pró-labore | Com Funcionário', 'LP-COM-PL-CF',  'presumido', 'comercio', true, true,  'Lucro Presumido, comércio, com CLT'),
('LP | Misto | Pró-labore | Sem Funcionário',    'LP-MIX-PL-SF',  'presumido', 'misto',    true, false, 'Lucro Presumido, serv+com, sem CLT'),
('LP | Misto | Pró-labore | Com Funcionário',    'LP-MIX-PL-CF',  'presumido', 'misto',    true, true,  'Lucro Presumido, serv+com, com CLT'),
-- Lucro Real
('LR | Serviço | Pró-labore | Sem Funcionário',  'LR-SERV-PL-SF', 'real',      'servico',  true, false, 'Lucro Real, serviço, sem CLT'),
('LR | Serviço | Pró-labore | Com Funcionário',  'LR-SERV-PL-CF', 'real',      'servico',  true, true,  'Lucro Real, serviço, com CLT'),
('LR | Comércio | Pró-labore | Sem Funcionário', 'LR-COM-PL-SF',  'real',      'comercio', true, false, 'Lucro Real, comércio, sem CLT'),
('LR | Comércio | Pró-labore | Com Funcionário', 'LR-COM-PL-CF',  'real',      'comercio', true, true,  'Lucro Real, comércio, com CLT'),
('LR | Misto | Pró-labore | Sem Funcionário',    'LR-MIX-PL-SF',  'real',      'misto',    true, false, 'Lucro Real, serv+com, sem CLT'),
('LR | Misto | Pró-labore | Com Funcionário',    'LR-MIX-PL-CF',  'real',      'misto',    true, true,  'Lucro Real, serv+com, com CLT')
ON CONFLICT (codigo_perfil) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: ROTINAS-MODELO
-- Colunas: nome_rotina, codigo_rotina, tipo_rotina, departamento,
--          periodicidade, criticidade, dia_vencimento, meses_offset,
--          margem_seguranca, exige_comprovante, gatilho, descricao
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.rotina_modelo
  (nome_rotina, codigo_rotina, tipo_rotina, departamento, periodicidade, criticidade,
   dia_vencimento, meses_offset, margem_seguranca, exige_comprovante, gatilho, descricao)
VALUES
-- ── Simples Nacional ──────────────────────────────────────────────────────
('PGDAS-D',              'FIS-SN-001',       'pgdas',    'Fiscal',   'mensal',     'alta',    20,   0, 3, true,  null,                 'Apuração mensal do Simples Nacional (mesmo mês competência)'),
('DAS',                  'FIS-SN-002',       'das',      'Fiscal',   'mensal',     'critica', 20,   1, 3, true,  null,                 'Guia de pagamento do Simples Nacional'),
('DEFIS',                'FIS-SN-003',       'defis',    'Contábil', 'anual',      'alta',    31,   3, 5, true,  null,                 'Declaração de Informações Socioeconômicas e Fiscais — março do ano seguinte'),
-- ── Departamento Pessoal ──────────────────────────────────────────────────
('eSocial Pró-labore',   'DP-001',           'esocial',  'DP',       'mensal',     'alta',    20,   1, 3, true,  'possui_prolabore',   'Eventos de pró-labore no eSocial — guia INSS sócio'),
('Folha de Pagamento',   'DP-002',           'folha',    'DP',       'mensal',     'critica',  5,   1, 2, true,  'possui_funcionario', 'Processamento e fechamento da folha mensal'),
('FGTS Digital',         'DP-003',           'fgts',     'DP',       'mensal',     'critica',  7,   1, 2, true,  'possui_funcionario', 'Geração e pagamento do FGTS via FGTS Digital'),
('eSocial Funcionários', 'DP-004',           'esocial',  'DP',       'mensal',     'critica', 15,   1, 3, true,  'possui_funcionario', 'Eventos mensais de funcionários CLT no eSocial'),
-- ── Federal ───────────────────────────────────────────────────────────────
('DCTFWeb',              'FIS-DCTFWEB-001',  'dctfweb',  'Fiscal',   'mensal',     'critica', 15,   1, 3, true,  null,                 'Declaração de débitos e créditos tributários federais web'),
('PIS/COFINS',           'FIS-PISCOFINS-001','piscofins', 'Fiscal',   'mensal',     'alta',    25,   1, 3, true,  null,                 'Apuração e pagamento de PIS e COFINS'),
('EFD-Contribuições',    'FIS-CONTRIB-001',  'efd',      'Fiscal',   'mensal',     'alta',    15,   2, 3, true,  null,                 'Escrituração Fiscal Digital das Contribuições — 2º mês após competência'),
('EFD-Reinf',            'FIS-REINF-001',    'reinf',    'Fiscal',   'mensal',     'alta',    15,   1, 3, true,  'tem_reinf',          'EFD de Retenções e Outras Informações Fiscais'),
-- ── Municipal / Serviço ──────────────────────────────────────────────────
('NFS-e',                'FIS-MUN-001',      'nfse',     'Fiscal',   'mensal',     'alta',     5,   1, 2, true,  'servico',            'Emissão e conferência de notas fiscais de serviço'),
('ISS',                  'FIS-ISS-001',      'iss',      'Fiscal',   'mensal',     'alta',    10,   1, 3, true,  'servico',            'Apuração e pagamento do ISS municipal'),
-- ── Estadual / Comércio ──────────────────────────────────────────────────
('NF-e / NFC-e',         'FIS-EST-001',      'nfe',      'Fiscal',   'mensal',     'alta',     5,   1, 2, true,  'comercio',           'Emissão e conferência de notas fiscais de produtos'),
('ICMS',                 'FIS-ICMS-001',     'icms',     'Fiscal',   'mensal',     'alta',    15,   1, 3, true,  'comercio',           'Apuração e pagamento do ICMS estadual'),
-- ── Lucro Presumido / Real ────────────────────────────────────────────────
('IRPJ',                 'CONT-IRPJ-001',    'irpj',     'Contábil', 'trimestral', 'critica', 30,   1, 5, true,  null,                 'Apuração do Imposto de Renda Pessoa Jurídica'),
('CSLL',                 'CONT-CSLL-001',    'csll',     'Contábil', 'trimestral', 'critica', 30,   1, 5, true,  null,                 'Apuração da Contribuição Social sobre o Lucro Líquido'),
('ECF',                  'CONT-ECF-001',     'ecf',      'Contábil', 'anual',      'alta',    31,   7, 5, true,  null,                 'Escrituração Contábil Fiscal — julho do ano seguinte'),
('ECD',                  'CONT-ECD-001',     'ecd',      'Contábil', 'anual',      'alta',    30,   6, 5, true,  null,                 'Escrituração Contábil Digital — junho do ano seguinte'),
-- ── Fechamento ───────────────────────────────────────────────────────────
('Fechamento Fiscal Mensal',   'FIS-FECH-001',  'fechamento', 'Fiscal',   'mensal', 'alta',  25, 0, 3, true,  null, 'Conferência e fechamento fiscal do mês corrente'),
('Fechamento Contábil Mensal', 'CONT-FECH-001', 'fechamento', 'Contábil', 'mensal', 'alta',   5, 1, 2, true,  null, 'Encerramento contábil mensal com conciliações'),
('Conciliações Fiscais',       'CONT-CONC-001', 'conciliacao','Contábil', 'mensal', 'alta',  10, 1, 3, true,  null, 'Conciliações fiscais e contábeis — obrigatório Lucro Real'),
('Controle de Certidões',      'GES-CERT-001',  'certidoes',  'Gestão',   'mensal', 'media',  1, 1, 5, false, null, 'Monitoramento de vencimento de certidões negativas')
ON CONFLICT (codigo_rotina) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: VÍNCULOS PERFIL → ROTINAS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION _ins_pr(p_cod TEXT, r_cod TEXT, ord INT, cond TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.perfil_rotina (perfil_modelo_id, rotina_modelo_id, obrigatoria, ordem_execucao, condicional)
  SELECT pm.id, rm.id, true, ord, cond
  FROM public.perfil_modelo pm, public.rotina_modelo rm
  WHERE pm.codigo_perfil = p_cod AND rm.codigo_rotina = r_cod
  ON CONFLICT (perfil_modelo_id, rotina_modelo_id) DO NOTHING;
END;
$$;

-- ── Simples Nacional — rotinas base (todos os 6 perfis SN) ────────────────
DO $$
DECLARE p TEXT;
BEGIN
  FOREACH p IN ARRAY ARRAY['SN-SERV-PL-SF','SN-SERV-PL-CF','SN-COM-PL-SF','SN-COM-PL-CF','SN-MIX-PL-SF','SN-MIX-PL-CF']
  LOOP
    PERFORM _ins_pr(p, 'FIS-SN-001',      1,  null);
    PERFORM _ins_pr(p, 'FIS-SN-002',      2,  null);
    PERFORM _ins_pr(p, 'FIS-SN-003',      3,  null);
    PERFORM _ins_pr(p, 'DP-001',          4,  'possui_prolabore');
    PERFORM _ins_pr(p, 'FIS-DCTFWEB-001', 5,  null);
    PERFORM _ins_pr(p, 'FIS-REINF-001',   6,  'tem_reinf');
    PERFORM _ins_pr(p, 'FIS-FECH-001',    9,  null);
    PERFORM _ins_pr(p, 'GES-CERT-001',    10, null);
  END LOOP;
END;
$$;

-- Serviço SN (SERV + MIX)
DO $$
DECLARE p TEXT;
BEGIN
  FOREACH p IN ARRAY ARRAY['SN-SERV-PL-SF','SN-SERV-PL-CF','SN-MIX-PL-SF','SN-MIX-PL-CF']
  LOOP
    PERFORM _ins_pr(p, 'FIS-MUN-001', 7, 'servico');
    PERFORM _ins_pr(p, 'FIS-ISS-001', 8, 'servico');
  END LOOP;
END;
$$;

-- Comércio SN (COM + MIX)
DO $$
DECLARE p TEXT;
BEGIN
  FOREACH p IN ARRAY ARRAY['SN-COM-PL-SF','SN-COM-PL-CF','SN-MIX-PL-SF','SN-MIX-PL-CF']
  LOOP
    PERFORM _ins_pr(p, 'FIS-EST-001',  7, 'comercio');
    PERFORM _ins_pr(p, 'FIS-ICMS-001', 8, 'comercio');
  END LOOP;
END;
$$;

-- Funcionários SN (perfis CF)
DO $$
DECLARE p TEXT;
BEGIN
  FOREACH p IN ARRAY ARRAY['SN-SERV-PL-CF','SN-COM-PL-CF','SN-MIX-PL-CF']
  LOOP
    PERFORM _ins_pr(p, 'DP-002', 11, 'possui_funcionario');
    PERFORM _ins_pr(p, 'DP-003', 12, 'possui_funcionario');
    PERFORM _ins_pr(p, 'DP-004', 13, 'possui_funcionario');
  END LOOP;
END;
$$;

-- ── Lucro Presumido — rotinas base (todos os 6 perfis LP) ─────────────────
DO $$
DECLARE p TEXT;
BEGIN
  FOREACH p IN ARRAY ARRAY['LP-SERV-PL-SF','LP-SERV-PL-CF','LP-COM-PL-SF','LP-COM-PL-CF','LP-MIX-PL-SF','LP-MIX-PL-CF']
  LOOP
    PERFORM _ins_pr(p, 'DP-001',           1,  'possui_prolabore');
    PERFORM _ins_pr(p, 'FIS-DCTFWEB-001',  2,  null);
    PERFORM _ins_pr(p, 'CONT-IRPJ-001',    3,  null);
    PERFORM _ins_pr(p, 'CONT-CSLL-001',    4,  null);
    PERFORM _ins_pr(p, 'FIS-PISCOFINS-001', 5, null);
    PERFORM _ins_pr(p, 'FIS-CONTRIB-001',  6,  null);
    PERFORM _ins_pr(p, 'CONT-ECF-001',     7,  null);
    PERFORM _ins_pr(p, 'CONT-ECD-001',     8,  null);
    PERFORM _ins_pr(p, 'FIS-REINF-001',    9,  'tem_reinf');
    PERFORM _ins_pr(p, 'FIS-FECH-001',     12, null);
    PERFORM _ins_pr(p, 'CONT-FECH-001',    13, null);
    PERFORM _ins_pr(p, 'GES-CERT-001',     14, null);
  END LOOP;
END;
$$;

-- Serviço LP
DO $$
DECLARE p TEXT;
BEGIN
  FOREACH p IN ARRAY ARRAY['LP-SERV-PL-SF','LP-SERV-PL-CF','LP-MIX-PL-SF','LP-MIX-PL-CF']
  LOOP
    PERFORM _ins_pr(p, 'FIS-MUN-001', 10, 'servico');
    PERFORM _ins_pr(p, 'FIS-ISS-001', 11, 'servico');
  END LOOP;
END;
$$;

-- Comércio LP
DO $$
DECLARE p TEXT;
BEGIN
  FOREACH p IN ARRAY ARRAY['LP-COM-PL-SF','LP-COM-PL-CF','LP-MIX-PL-SF','LP-MIX-PL-CF']
  LOOP
    PERFORM _ins_pr(p, 'FIS-EST-001',  10, 'comercio');
    PERFORM _ins_pr(p, 'FIS-ICMS-001', 11, 'comercio');
  END LOOP;
END;
$$;

-- Funcionários LP
DO $$
DECLARE p TEXT;
BEGIN
  FOREACH p IN ARRAY ARRAY['LP-SERV-PL-CF','LP-COM-PL-CF','LP-MIX-PL-CF']
  LOOP
    PERFORM _ins_pr(p, 'DP-002', 15, 'possui_funcionario');
    PERFORM _ins_pr(p, 'DP-003', 16, 'possui_funcionario');
    PERFORM _ins_pr(p, 'DP-004', 17, 'possui_funcionario');
  END LOOP;
END;
$$;

-- ── Lucro Real — rotinas base (todos os 6 perfis LR) ──────────────────────
DO $$
DECLARE p TEXT;
BEGIN
  FOREACH p IN ARRAY ARRAY['LR-SERV-PL-SF','LR-SERV-PL-CF','LR-COM-PL-SF','LR-COM-PL-CF','LR-MIX-PL-SF','LR-MIX-PL-CF']
  LOOP
    PERFORM _ins_pr(p, 'DP-001',           1,  'possui_prolabore');
    PERFORM _ins_pr(p, 'FIS-DCTFWEB-001',  2,  null);
    PERFORM _ins_pr(p, 'CONT-IRPJ-001',    3,  null);
    PERFORM _ins_pr(p, 'CONT-CSLL-001',    4,  null);
    PERFORM _ins_pr(p, 'FIS-PISCOFINS-001', 5, null);
    PERFORM _ins_pr(p, 'FIS-CONTRIB-001',  6,  null);
    PERFORM _ins_pr(p, 'CONT-CONC-001',    7,  null);
    PERFORM _ins_pr(p, 'CONT-ECF-001',     8,  null);
    PERFORM _ins_pr(p, 'CONT-ECD-001',     9,  null);
    PERFORM _ins_pr(p, 'FIS-REINF-001',    10, 'tem_reinf');
    PERFORM _ins_pr(p, 'FIS-FECH-001',     13, null);
    PERFORM _ins_pr(p, 'CONT-FECH-001',    14, null);
    PERFORM _ins_pr(p, 'GES-CERT-001',     15, null);
  END LOOP;
END;
$$;

-- Serviço LR
DO $$
DECLARE p TEXT;
BEGIN
  FOREACH p IN ARRAY ARRAY['LR-SERV-PL-SF','LR-SERV-PL-CF','LR-MIX-PL-SF','LR-MIX-PL-CF']
  LOOP
    PERFORM _ins_pr(p, 'FIS-MUN-001', 11, 'servico');
    PERFORM _ins_pr(p, 'FIS-ISS-001', 12, 'servico');
  END LOOP;
END;
$$;

-- Comércio LR
DO $$
DECLARE p TEXT;
BEGIN
  FOREACH p IN ARRAY ARRAY['LR-COM-PL-SF','LR-COM-PL-CF','LR-MIX-PL-SF','LR-MIX-PL-CF']
  LOOP
    PERFORM _ins_pr(p, 'FIS-EST-001',  11, 'comercio');
    PERFORM _ins_pr(p, 'FIS-ICMS-001', 12, 'comercio');
  END LOOP;
END;
$$;

-- Funcionários LR
DO $$
DECLARE p TEXT;
BEGIN
  FOREACH p IN ARRAY ARRAY['LR-SERV-PL-CF','LR-COM-PL-CF','LR-MIX-PL-CF']
  LOOP
    PERFORM _ins_pr(p, 'DP-002', 16, 'possui_funcionario');
    PERFORM _ins_pr(p, 'DP-003', 17, 'possui_funcionario');
    PERFORM _ins_pr(p, 'DP-004', 18, 'possui_funcionario');
  END LOOP;
END;
$$;

-- Remove função auxiliar temporária
DROP FUNCTION IF EXISTS _ins_pr(TEXT, TEXT, INT, TEXT);
