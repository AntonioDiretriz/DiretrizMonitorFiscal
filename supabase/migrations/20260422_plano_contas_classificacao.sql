-- Add hierarchical accounting fields to plano_contas
ALTER TABLE public.plano_contas
  ADD COLUMN IF NOT EXISTS classificacao TEXT,
  ADD COLUMN IF NOT EXISTS natureza      TEXT DEFAULT 'A',
  ADD COLUMN IF NOT EXISTS grau          INTEGER;

-- Index for fast prefix-based tree queries
CREATE INDEX IF NOT EXISTS idx_plano_contas_classificacao
  ON public.plano_contas (user_id, empresa_id, classificacao);

-- Expand tipo check to include all accounting groups
ALTER TABLE public.plano_contas
  DROP CONSTRAINT IF EXISTS plano_contas_tipo_check;
