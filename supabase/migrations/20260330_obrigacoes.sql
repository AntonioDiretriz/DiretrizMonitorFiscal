-- ── Obrigações Fiscais / Trabalhistas ─────────────────────────────────────────

CREATE TABLE public.obrigacoes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id        UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo              TEXT NOT NULL,
  -- Ex: 'das' | 'fgts' | 'inss' | 'iss' | 'irpj' | 'csll' | 'pis' | 'cofins'
  --     'dctf' | 'sped' | 'ecf' | 'ecd' | 'dirf' | 'rais' | 'caged' | 'outro'
  competencia       DATE NOT NULL,  -- primeiro dia do mês de competência
  data_vencimento   DATE NOT NULL,
  data_cumprimento  DATE,
  valor             NUMERIC(14,2),
  status            TEXT NOT NULL DEFAULT 'pendente',
  -- pendente | cumprida | vencida
  observacao        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.obrigacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own obrigacoes"   ON public.obrigacoes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own obrigacoes" ON public.obrigacoes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own obrigacoes" ON public.obrigacoes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own obrigacoes" ON public.obrigacoes FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_obrigacoes_user_id        ON public.obrigacoes(user_id);
CREATE INDEX idx_obrigacoes_empresa_id     ON public.obrigacoes(empresa_id);
CREATE INDEX idx_obrigacoes_data_vencimento ON public.obrigacoes(data_vencimento);
CREATE INDEX idx_obrigacoes_status         ON public.obrigacoes(status);
CREATE INDEX idx_obrigacoes_competencia    ON public.obrigacoes(competencia);

-- Auto updated_at
CREATE OR REPLACE FUNCTION public.update_obrigacoes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_obrigacoes_updated_at
  BEFORE UPDATE ON public.obrigacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_obrigacoes_updated_at();
