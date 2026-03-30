-- ── Diretriz Rotinas — Fase 1 ─────────────────────────────────────────────────

-- ── Catálogo de Obrigações ────────────────────────────────────────────────────
CREATE TABLE public.catalogo_obrigacoes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  -- NULL = registro do sistema (pré-cadastrado, disponível para todos)
  nome             TEXT NOT NULL,
  tipo             TEXT NOT NULL,
  descricao        TEXT,
  esfera           TEXT NOT NULL DEFAULT 'federal',  -- federal | estadual | municipal
  regimes          TEXT[] NOT NULL DEFAULT '{}',
  -- array: simples | presumido | real | mei | todos
  periodicidade    TEXT NOT NULL DEFAULT 'mensal',   -- mensal | trimestral | anual | eventual
  dia_vencimento   INTEGER,      -- dia do mês de vencimento (ex: 20)
  meses_offset     INTEGER DEFAULT 1,  -- meses após competência (1 = mês seguinte)
  meses_aplicaveis INTEGER[],   -- para anuais: [7] = julho
  margem_seguranca INTEGER NOT NULL DEFAULT 3, -- dias antes do prazo legal (SLA interno)
  ativo            BOOLEAN NOT NULL DEFAULT true,
  sistema          BOOLEAN NOT NULL DEFAULT false,
  -- true = pré-cadastrado pela Diretriz, não pode ser excluído
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.catalogo_obrigacoes ENABLE ROW LEVEL SECURITY;
-- Registros do sistema (user_id IS NULL) são visíveis para todos autenticados
CREATE POLICY "Authenticated users can view catalogo"
  ON public.catalogo_obrigacoes FOR SELECT
  TO authenticated
  USING (user_id IS NULL OR auth.uid() = user_id);
CREATE POLICY "Users can insert own catalogo"
  ON public.catalogo_obrigacoes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own catalogo"
  ON public.catalogo_obrigacoes FOR UPDATE USING (auth.uid() = user_id AND sistema = false);
CREATE POLICY "Users can delete own catalogo"
  ON public.catalogo_obrigacoes FOR DELETE USING (auth.uid() = user_id AND sistema = false);

CREATE INDEX idx_catalogo_user_id ON public.catalogo_obrigacoes(user_id);
CREATE INDEX idx_catalogo_sistema ON public.catalogo_obrigacoes(sistema);

-- ── Tarefas de Rotina ─────────────────────────────────────────────────────────
CREATE TABLE public.rotinas (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id              UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
  catalogo_id             UUID REFERENCES public.catalogo_obrigacoes(id) ON DELETE SET NULL,
  titulo                  TEXT NOT NULL,
  tipo                    TEXT NOT NULL,
  competencia             DATE,          -- primeiro dia do mês de competência
  data_vencimento         DATE NOT NULL, -- prazo legal
  data_vencimento_interno DATE,          -- prazo interno (legal - margem_seguranca)
  responsavel_id          UUID REFERENCES public.usuarios_perfil(id) ON DELETE SET NULL,
  revisor_id              UUID REFERENCES public.usuarios_perfil(id) ON DELETE SET NULL,
  etapa                   TEXT NOT NULL DEFAULT 'preparar',
  -- preparar | revisar | enviar | concluido
  status                  TEXT NOT NULL DEFAULT 'pendente',
  -- pendente | em_preparacao | em_revisao | devolvida | pronta_envio | concluida | em_risco | atrasada | nao_aplicavel
  valor                   NUMERIC(14,2),
  observacao              TEXT,
  contas_pagar_id         UUID REFERENCES public.contas_pagar(id) ON DELETE SET NULL,
  origem                  TEXT NOT NULL DEFAULT 'manual', -- manual | automatica
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rotinas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own rotinas"   ON public.rotinas FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own rotinas" ON public.rotinas FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own rotinas" ON public.rotinas FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own rotinas" ON public.rotinas FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_rotinas_user_id         ON public.rotinas(user_id);
CREATE INDEX idx_rotinas_empresa_id      ON public.rotinas(empresa_id);
CREATE INDEX idx_rotinas_status          ON public.rotinas(status);
CREATE INDEX idx_rotinas_etapa           ON public.rotinas(etapa);
CREATE INDEX idx_rotinas_data_vencimento ON public.rotinas(data_vencimento);
CREATE INDEX idx_rotinas_competencia     ON public.rotinas(competencia);
CREATE INDEX idx_rotinas_responsavel_id  ON public.rotinas(responsavel_id);

CREATE OR REPLACE FUNCTION public.update_rotinas_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_rotinas_updated_at
  BEFORE UPDATE ON public.rotinas
  FOR EACH ROW EXECUTE FUNCTION public.update_rotinas_updated_at();

-- ── Evidências ────────────────────────────────────────────────────────────────
CREATE TABLE public.rotinas_evidencias (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rotina_id        UUID NOT NULL REFERENCES public.rotinas(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo             TEXT NOT NULL DEFAULT 'comprovante',
  -- protocolo | recibo | comprovante | outro
  numero_protocolo TEXT,
  arquivo_url      TEXT,
  observacao       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rotinas_evidencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own evidencias"   ON public.rotinas_evidencias FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own evidencias" ON public.rotinas_evidencias FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own evidencias" ON public.rotinas_evidencias FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_evidencias_rotina_id ON public.rotinas_evidencias(rotina_id);

-- ── Comentários / Log de Atividade ────────────────────────────────────────────
CREATE TABLE public.rotinas_comentarios (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rotina_id  UUID NOT NULL REFERENCES public.rotinas(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mensagem   TEXT NOT NULL,
  tipo       TEXT NOT NULL DEFAULT 'comentario',
  -- comentario | status_change | revisao_devolvida
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rotinas_comentarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own comentarios"   ON public.rotinas_comentarios FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own comentarios" ON public.rotinas_comentarios FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_comentarios_rotina_id ON public.rotinas_comentarios(rotina_id);

-- ── Catálogo Pré-Cadastrado (sistema = true) ──────────────────────────────────
INSERT INTO public.catalogo_obrigacoes
  (nome, tipo, descricao, esfera, regimes, periodicidade, dia_vencimento, meses_offset, margem_seguranca, sistema)
VALUES
  -- Federais mensais
  ('DAS — Simples Nacional',        'das',    'Documento de Arrecadação do Simples Nacional',             'federal',    ARRAY['simples','mei'],             'mensal', 20, 1, 3, true),
  ('FGTS — Guia de Recolhimento',   'fgts',   'Fundo de Garantia do Tempo de Serviço',                   'federal',    ARRAY['simples','presumido','real','mei'], 'mensal', 7,  1, 3, true),
  ('INSS / GPS',                    'inss',   'Guia da Previdência Social — contribuição patronal',       'federal',    ARRAY['simples','presumido','real'],  'mensal', 20, 1, 3, true),
  ('PIS / PASEP',                   'pis',    'Contribuição ao Programa de Integração Social',            'federal',    ARRAY['presumido','real'],             'mensal', 25, 1, 3, true),
  ('COFINS',                        'cofins', 'Contribuição para Financiamento da Seguridade Social',     'federal',    ARRAY['presumido','real'],             'mensal', 25, 1, 3, true),
  ('DCTF / DCTFWeb',                'dctf',   'Declaração de Débitos e Créditos Tributários Federais',   'federal',    ARRAY['presumido','real'],             'mensal', 15, 2, 5, true),
  ('IRPJ — Estimativa Mensal',      'irpj',   'Imposto de Renda Pessoa Jurídica — estimativa',           'federal',    ARRAY['real'],                         'mensal', 30, 1, 5, true),
  ('CSLL — Estimativa Mensal',      'csll',   'Contribuição Social sobre Lucro Líquido — estimativa',    'federal',    ARRAY['real'],                         'mensal', 30, 1, 5, true),
  ('ISS — Imposto Sobre Serviços',  'iss',    'Imposto sobre Serviços de Qualquer Natureza',             'municipal',  ARRAY['simples','presumido','real','mei'], 'mensal', 10, 1, 3, true),
  -- Federais anuais
  ('DEFIS — Declaração Simples',    'defis',  'Declaração de Informações Socioeconômicas e Fiscais',     'federal',    ARRAY['simples'],                      'anual',  31, 0, 7, true),
  ('ECF — Escr. Contábil Fiscal',   'ecf',    'Escrituração Contábil Fiscal — entrega SPED',             'federal',    ARRAY['presumido','real'],             'anual',  31, 0, 10, true),
  ('ECD — Escr. Contábil Digital',  'ecd',    'Escrituração Contábil Digital — entrega SPED',            'federal',    ARRAY['real'],                         'anual',  30, 0, 10, true),
  ('RAIS / eSocial Anual',          'rais',   'Relação Anual de Informações Sociais',                    'federal',    ARRAY['simples','presumido','real'],   'anual',  28, 0, 7, true),
  ('DASN-SIMEI (MEI)',              'das',    'Declaração Anual Simplificada do MEI',                    'federal',    ARRAY['mei'],                          'anual',  31, 0, 7, true);
