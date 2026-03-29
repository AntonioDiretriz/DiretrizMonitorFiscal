-- Adiciona coluna caixa_postal_id na tabela alertas
ALTER TABLE public.alertas
  ADD COLUMN IF NOT EXISTS caixa_postal_id UUID REFERENCES public.caixas_postais(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_alertas_caixa_postal_id ON public.alertas(caixa_postal_id);
