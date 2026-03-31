-- ═══════════════════════════════════════════════════════════════════════════
-- PERFIS-MODELO E ROTINAS-PADRÃO
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Campos operacionais na tabela empresas ──────────────────────────────────
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS atividade           TEXT DEFAULT 'servico',     -- servico | comercio | misto
  ADD COLUMN IF NOT EXISTS possui_prolabore    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS possui_funcionario  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tem_retencoes       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tem_reinf           BOOLEAN NOT NULL DEFAULT false;

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
  departamento      TEXT NOT NULL,   -- Fiscal | Contábil | DP | Legalização | Financeiro | Gestão
  periodicidade     TEXT NOT NULL,   -- diario | semanal | mensal | trimestral | anual | eventual
  criticidade       TEXT NOT NULL DEFAULT 'alta',  -- baixa | media | alta | critica
  exige_comprovante BOOLEAN NOT NULL DEFAULT true,
  gatilho           TEXT,            -- campo da empresa que ativa esta rotina
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
  condicional      TEXT    -- ex: 'tem_reinf' = só gera se empresa.tem_reinf=true
);

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: 18 PERFIS-MODELO
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.perfil_modelo (nome_exibicao, codigo_perfil, regime, atividade, possui_prolabore, possui_funcionario, descricao) VALUES
-- Simples Nacional
('SN | Serviço | Pró-labore | Sem Funcionário',   'SN-SERV-PL-SF', 'simples',   'servico',  true, false, 'Simples Nacional, prestador de serviço, sem empregados CLT'),
('SN | Serviço | Pró-labore | Com Funcionário',   'SN-SERV-PL-CF', 'simples',   'servico',  true, true,  'Simples Nacional, prestador de serviço, com empregados CLT'),
('SN | Comércio | Pró-labore | Sem Funcionário',  'SN-COM-PL-SF',  'simples',   'comercio', true, false, 'Simples Nacional, comércio, sem empregados CLT'),
('SN | Comércio | Pró-labore | Com Funcionário',  'SN-COM-PL-CF',  'simples',   'comercio', true, true,  'Simples Nacional, comércio, com empregados CLT'),
('SN | Misto | Pró-labore | Sem Funcionário',     'SN-MIX-PL-SF',  'simples',   'misto',    true, false, 'Simples Nacional, serviço + comércio, sem empregados CLT'),
('SN | Misto | Pró-labore | Com Funcionário',     'SN-MIX-PL-CF',  'simples',   'misto',    true, true,  'Simples Nacional, serviço + comércio, com empregados CLT'),
-- Lucro Presumido
('LP | Serviço | Pró-labore | Sem Funcionário',   'LP-SERV-PL-SF', 'presumido', 'servico',  true, false, 'Lucro Presumido, prestador de serviço, sem empregados CLT'),
('LP | Serviço | Pró-labore | Com Funcionário',   'LP-SERV-PL-CF', 'presumido', 'servico',  true, true,  'Lucro Presumido, prestador de serviço, com empregados CLT'),
('LP | Comércio | Pró-labore | Sem Funcionário',  'LP-COM-PL-SF',  'presumido', 'comercio', true, false, 'Lucro Presumido, comércio, sem empregados CLT'),
('LP | Comércio | Pró-labore | Com Funcionário',  'LP-COM-PL-CF',  'presumido', 'comercio', true, true,  'Lucro Presumido, comércio, com empregados CLT'),
('LP | Misto | Pró-labore | Sem Funcionário',     'LP-MIX-PL-SF',  'presumido', 'misto',    true, false, 'Lucro Presumido, serviço + comércio, sem empregados CLT'),
('LP | Misto | Pró-labore | Com Funcionário',     'LP-MIX-PL-CF',  'presumido', 'misto',    true, true,  'Lucro Presumido, serviço + comércio, com empregados CLT'),
-- Lucro Real
('LR | Serviço | Pró-labore | Sem Funcionário',   'LR-SERV-PL-SF', 'real',      'servico',  true, false, 'Lucro Real, prestador de serviço, sem empregados CLT'),
('LR | Serviço | Pró-labore | Com Funcionário',   'LR-SERV-PL-CF', 'real',      'servico',  true, true,  'Lucro Real, prestador de serviço, com empregados CLT'),
('LR | Comércio | Pró-labore | Sem Funcionário',  'LR-COM-PL-SF',  'real',      'comercio', true, false, 'Lucro Real, comércio, sem empregados CLT'),
('LR | Comércio | Pró-labore | Com Funcionário',  'LR-COM-PL-CF',  'real',      'comercio', true, true,  'Lucro Real, comércio, com empregados CLT'),
('LR | Misto | Pró-labore | Sem Funcionário',     'LR-MIX-PL-SF',  'real',      'misto',    true, false, 'Lucro Real, serviço + comércio, sem empregados CLT'),
('LR | Misto | Pró-labore | Com Funcionário',     'LR-MIX-PL-CF',  'real',      'misto',    true, true,  'Lucro Real, serviço + comércio, com empregados CLT')
ON CONFLICT (codigo_perfil) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: ROTINAS-MODELO
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.rotina_modelo (nome_rotina, codigo_rotina, departamento, periodicidade, criticidade, exige_comprovante, gatilho, descricao) VALUES
-- Simples Nacional
('PGDAS-D',               'FIS-SN-001',       'Fiscal',     'mensal',    'alta',    true,  null,             'Apuração mensal do Simples Nacional'),
('DAS',                   'FIS-SN-002',       'Fiscal',     'mensal',    'critica', true,  null,             'Guia de pagamento do Simples Nacional — depende do PGDAS-D'),
('DEFIS',                 'FIS-SN-003',       'Contábil',   'anual',     'alta',    true,  null,             'Declaração de Informações Socioeconômicas e Fiscais — anual março'),
-- Trabalhista / DP
('eSocial Pró-labore',    'DP-001',           'DP',         'mensal',    'alta',    true,  'possui_prolabore',  'Eventos de pró-labore no eSocial'),
('Folha de Pagamento',    'DP-002',           'DP',         'mensal',    'critica', true,  'possui_funcionario','Processamento e fechamento da folha mensal'),
('FGTS Digital',          'DP-003',           'DP',         'mensal',    'critica', true,  'possui_funcionario','Geração e pagamento do FGTS via FGTS Digital'),
('eSocial Funcionários',  'DP-004',           'DP',         'mensal',    'critica', true,  'possui_funcionario','Eventos mensais de funcionários CLT no eSocial'),
('DCTFWeb',               'FIS-DCTFWEB-001',  'Fiscal',     'mensal',    'critica', true,  null,             'Declaração de débitos e créditos tributários federais'),
-- Obrigações por atividade
('NFS-e',                 'FIS-MUN-001',      'Fiscal',     'mensal',    'alta',    true,  'servico',        'Emissão e conferência de notas fiscais de serviço'),
('ISS',                   'FIS-ISS-001',      'Fiscal',     'mensal',    'alta',    true,  'servico',        'Apuração e pagamento do ISS municipal'),
('NF-e / NFC-e',          'FIS-EST-001',      'Fiscal',     'mensal',    'alta',    true,  'comercio',       'Emissão e conferência de notas fiscais de produtos'),
('ICMS',                  'FIS-ICMS-001',     'Fiscal',     'mensal',    'alta',    true,  'comercio',       'Apuração e pagamento do ICMS estadual'),
-- Presumido / Real
('IRPJ',                  'CONT-IRPJ-001',    'Contábil',   'trimestral','critica', true,  null,             'Apuração do Imposto de Renda Pessoa Jurídica'),
('CSLL',                  'CONT-CSLL-001',    'Contábil',   'trimestral','critica', true,  null,             'Apuração da Contribuição Social sobre o Lucro Líquido'),
('PIS/COFINS',            'FIS-PISCOFINS-001','Fiscal',     'mensal',    'alta',    true,  null,             'Apuração e pagamento de PIS e COFINS'),
('ECF',                   'CONT-ECF-001',     'Contábil',   'anual',     'alta',    true,  null,             'Escrituração Contábil Fiscal — anual julho'),
('ECD',                   'CONT-ECD-001',     'Contábil',   'anual',     'alta',    true,  null,             'Escrituração Contábil Digital — anual junho'),
('EFD-Contribuições',     'FIS-CONTRIB-001',  'Fiscal',     'mensal',    'alta',    true,  null,             'Escrituração Fiscal Digital das Contribuições'),
('EFD-Reinf',             'FIS-REINF-001',    'Fiscal',     'mensal',    'alta',    true,  'tem_reinf',      'Escrituração Fiscal Digital de Retenções e Outras Informações Fiscais'),
-- Fechamento
('Fechamento Fiscal Mensal',    'FIS-FECH-001',  'Fiscal',   'mensal', 'alta',    true,  null, 'Conferência e fechamento fiscal do mês'),
('Fechamento Contábil Mensal',  'CONT-FECH-001', 'Contábil', 'mensal', 'alta',    true,  null, 'Encerramento contábil mensal com conciliações'),
('Conciliações Fiscais',        'CONT-CONC-001', 'Contábil', 'mensal', 'alta',    true,  null, 'Conciliações fiscais e contábeis — obrigatório Lucro Real'),
('Controle de Certidões',       'GES-CERT-001',  'Gestão',   'mensal', 'media',   false, null, 'Monitoramento de vencimento de certidões negativas')
ON CONFLICT (codigo_rotina) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: VÍNCULO PERFIL → ROTINAS
-- (usando subqueries para evitar hardcode de UUIDs)
-- ═══════════════════════════════════════════════════════════════════════════

-- Helper: função para inserir vínculo evitando duplicata
CREATE OR REPLACE FUNCTION _ins_pr(p_cod TEXT, r_cod TEXT, ord INT, cond TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.perfil_rotina (perfil_modelo_id, rotina_modelo_id, obrigatoria, ordem_execucao, condicional)
  SELECT pm.id, rm.id, true, ord, cond
  FROM public.perfil_modelo pm, public.rotina_modelo rm
  WHERE pm.codigo_perfil = p_cod AND rm.codigo_rotina = r_cod
  ON CONFLICT DO NOTHING;
END;
$$;

-- ── Rotinas base Simples Nacional (todos os 6 perfis SN) ──────────────────
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
    PERFORM _ins_pr(p, 'FIS-FECH-001',    10, null);
    PERFORM _ins_pr(p, 'GES-CERT-001',    11, null);
    PERFORM _ins_pr(p, 'FIS-REINF-001',   12, 'tem_reinf');
  END LOOP;
END;
$$;
-- Serviço SN
DO $$
DECLARE p TEXT;
BEGIN
  FOREACH p IN ARRAY ARRAY['SN-SERV-PL-SF','SN-SERV-PL-CF','SN-MIX-PL-SF','SN-MIX-PL-CF']
  LOOP
    PERFORM _ins_pr(p, 'FIS-MUN-001', 6, 'servico');
    PERFORM _ins_pr(p, 'FIS-ISS-001', 7, 'servico');
  END LOOP;
END;
$$;
-- Comércio SN
DO $$
DECLARE p TEXT;
BEGIN
  FOREACH p IN ARRAY ARRAY['SN-COM-PL-SF','SN-COM-PL-CF','SN-MIX-PL-SF','SN-MIX-PL-CF']
  LOOP
    PERFORM _ins_pr(p, 'FIS-EST-001',  6, 'comercio');
    PERFORM _ins_pr(p, 'FIS-ICMS-001', 7, 'comercio');
  END LOOP;
END;
$$;
-- Funcionários SN
DO $$
DECLARE p TEXT;
BEGIN
  FOREACH p IN ARRAY ARRAY['SN-SERV-PL-CF','SN-COM-PL-CF','SN-MIX-PL-CF']
  LOOP
    PERFORM _ins_pr(p, 'DP-002', 8, 'possui_funcionario');
    PERFORM _ins_pr(p, 'DP-003', 9, 'possui_funcionario');
    PERFORM _ins_pr(p, 'DP-004', 9, 'possui_funcionario');
  END LOOP;
END;
$$;

-- ── Rotinas base Lucro Presumido (perfis LP) ──────────────────────────────
DO $$
DECLARE p TEXT;
BEGIN
  FOREACH p IN ARRAY ARRAY['LP-SERV-PL-SF','LP-SERV-PL-CF','LP-COM-PL-SF','LP-COM-PL-CF','LP-MIX-PL-SF','LP-MIX-PL-CF']
  LOOP
    PERFORM _ins_pr(p, 'DP-001',          1,  'possui_prolabore');
    PERFORM _ins_pr(p, 'FIS-DCTFWEB-001', 2,  null);
    PERFORM _ins_pr(p, 'CONT-IRPJ-001',   3,  null);
    PERFORM _ins_pr(p, 'CONT-CSLL-001',   4,  null);
    PERFORM _ins_pr(p, 'FIS-PISCOFINS-001',5, null);
    PERFORM _ins_pr(p, 'CONT-ECF-001',    6,  null);
    PERFORM _ins_pr(p, 'CONT-ECD-001',    7,  null);
    PERFORM _ins_pr(p, 'FIS-CONTRIB-001', 8,  null);
    PERFORM _ins_pr(p, 'FIS-FECH-001',    11, null);
    PERFORM _ins_pr(p, 'CONT-FECH-001',   12, null);
    PERFORM _ins_pr(p, 'GES-CERT-001',    13, null);
    PERFORM _ins_pr(p, 'FIS-REINF-001',   14, 'tem_reinf');
  END LOOP;
END;
$$;
-- Serviço LP
DO $$
DECLARE p TEXT;
BEGIN
  FOREACH p IN ARRAY ARRAY['LP-SERV-PL-SF','LP-SERV-PL-CF','LP-MIX-PL-SF','LP-MIX-PL-CF']
  LOOP
    PERFORM _ins_pr(p, 'FIS-MUN-001', 9,  'servico');
    PERFORM _ins_pr(p, 'FIS-ISS-001', 10, 'servico');
  END LOOP;
END;
$$;
-- Comércio LP
DO $$
DECLARE p TEXT;
BEGIN
  FOREACH p IN ARRAY ARRAY['LP-COM-PL-SF','LP-COM-PL-CF','LP-MIX-PL-SF','LP-MIX-PL-CF']
  LOOP
    PERFORM _ins_pr(p, 'FIS-EST-001',  9,  'comercio');
    PERFORM _ins_pr(p, 'FIS-ICMS-001', 10, 'comercio');
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
    PERFORM _ins_pr(p, 'DP-004', 16, 'possui_funcionario');
  END LOOP;
END;
$$;

-- ── Rotinas base Lucro Real (perfis LR) ──────────────────────────────────
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
    PERFORM _ins_pr(p, 'CONT-ECF-001',     6,  null);
    PERFORM _ins_pr(p, 'CONT-ECD-001',     7,  null);
    PERFORM _ins_pr(p, 'FIS-CONTRIB-001',  8,  null);
    PERFORM _ins_pr(p, 'CONT-CONC-001',    9,  null);
    PERFORM _ins_pr(p, 'FIS-FECH-001',     12, null);
    PERFORM _ins_pr(p, 'CONT-FECH-001',    13, null);
    PERFORM _ins_pr(p, 'GES-CERT-001',     14, null);
    PERFORM _ins_pr(p, 'FIS-REINF-001',    15, 'tem_reinf');
  END LOOP;
END;
$$;
-- Serviço LR
DO $$
DECLARE p TEXT;
BEGIN
  FOREACH p IN ARRAY ARRAY['LR-SERV-PL-SF','LR-SERV-PL-CF','LR-MIX-PL-SF','LR-MIX-PL-CF']
  LOOP
    PERFORM _ins_pr(p, 'FIS-MUN-001', 10, 'servico');
    PERFORM _ins_pr(p, 'FIS-ISS-001', 11, 'servico');
  END LOOP;
END;
$$;
-- Comércio LR
DO $$
DECLARE p TEXT;
BEGIN
  FOREACH p IN ARRAY ARRAY['LR-COM-PL-SF','LR-COM-PL-CF','LR-MIX-PL-SF','LR-MIX-PL-CF']
  LOOP
    PERFORM _ins_pr(p, 'FIS-EST-001',  10, 'comercio');
    PERFORM _ins_pr(p, 'FIS-ICMS-001', 11, 'comercio');
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
    PERFORM _ins_pr(p, 'DP-004', 17, 'possui_funcionario');
  END LOOP;
END;
$$;

-- Remove função auxiliar
DROP FUNCTION IF EXISTS _ins_pr(TEXT, TEXT, INT, TEXT);
