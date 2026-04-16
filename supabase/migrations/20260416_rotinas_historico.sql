-- Histórico de execução de obrigações/rotinas
CREATE TABLE IF NOT EXISTS public.rotinas_historico (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  obrigacao_id    UUID REFERENCES public.obrigacoes(id) ON DELETE SET NULL,
  empresa_id      UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
  tipo            TEXT NOT NULL,
  competencia     TEXT,                    -- "MM/YYYY"
  data_vencimento DATE,
  data_execucao   TIMESTAMPTZ NOT NULL DEFAULT now(),
  executado_por   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  executado_por_nome TEXT,
  no_prazo        BOOLEAN NOT NULL DEFAULT true,
  dias_atraso     INTEGER DEFAULT 0,
  forma           TEXT NOT NULL DEFAULT 'manual',  -- manual | automatica | sistema
  status_anterior TEXT,
  status_novo     TEXT,
  observacao      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.rotinas_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios autenticados veem rotinas_historico"
  ON public.rotinas_historico FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "usuarios autenticados inserem rotinas_historico"
  ON public.rotinas_historico FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Index para busca por obrigacao_id
CREATE INDEX IF NOT EXISTS idx_rotinas_historico_obrigacao
  ON public.rotinas_historico(obrigacao_id);

CREATE INDEX IF NOT EXISTS idx_rotinas_historico_user
  ON public.rotinas_historico(user_id);
