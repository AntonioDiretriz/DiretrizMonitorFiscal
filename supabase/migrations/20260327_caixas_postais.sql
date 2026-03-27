-- Tabela principal de caixas postais
CREATE TABLE IF NOT EXISTS public.caixas_postais (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  numero           INTEGER     NOT NULL,
  cnpj             TEXT        NOT NULL,
  empresa          TEXT        NOT NULL,
  empresa_id       UUID        REFERENCES public.empresas(id) ON DELETE SET NULL,
  nome_responsavel TEXT        NOT NULL,
  telefone         TEXT,
  email_responsavel TEXT,
  data_inicio      DATE        NOT NULL,
  data_vencimento  DATE        NOT NULL,
  valor_atual      NUMERIC(10,2),
  contrato_status  TEXT        NOT NULL DEFAULT 'ativo'
                               CHECK (contrato_status IN ('ativo','rescindido')),
  data_rescisao    DATE,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- Índice único: apenas 1 registro ativo por número por usuário
CREATE UNIQUE INDEX IF NOT EXISTS idx_caixas_postais_ativo_unique
  ON public.caixas_postais (user_id, numero)
  WHERE contrato_status = 'ativo';

ALTER TABLE public.caixas_postais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user owns caixas_postais"
  ON public.caixas_postais FOR ALL
  USING (auth.uid() = user_id);

-- Histórico de renovações
CREATE TABLE IF NOT EXISTS public.caixas_postais_historico (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  caixa_postal_id  UUID        NOT NULL REFERENCES public.caixas_postais(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES auth.users(id),
  data_renovacao   DATE        NOT NULL,
  valor_pago       NUMERIC(10,2),
  observacao       TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.caixas_postais_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user owns historico"
  ON public.caixas_postais_historico FOR ALL
  USING (auth.uid() = user_id);

-- Trigger para updated_at (reutiliza função existente)
CREATE TRIGGER update_caixas_postais_updated_at
  BEFORE UPDATE ON public.caixas_postais
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
