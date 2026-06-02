-- Parcelamento de caixas postais
ALTER TABLE public.caixas_postais
  ADD COLUMN IF NOT EXISTS parcelado      BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS num_parcelas   INTEGER,
  ADD COLUMN IF NOT EXISTS parcelas_pagas INTEGER  NOT NULL DEFAULT 0;
