-- Associa regras de conciliação a uma conta bancária específica (NULL = aplica a todas)
ALTER TABLE public.regras_conciliacao
  ADD COLUMN IF NOT EXISTS conta_bancaria_id UUID REFERENCES public.contas_bancarias(id) ON DELETE CASCADE;
