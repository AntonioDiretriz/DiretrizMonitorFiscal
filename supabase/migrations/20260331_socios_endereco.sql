-- ─────────────────────────────────────────────────────────────
-- Campos de endereço na tabela empresas
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS cep          TEXT,
  ADD COLUMN IF NOT EXISTS logradouro   TEXT,
  ADD COLUMN IF NOT EXISTS numero       TEXT,
  ADD COLUMN IF NOT EXISTS complemento  TEXT,
  ADD COLUMN IF NOT EXISTS bairro       TEXT;

-- ─────────────────────────────────────────────────────────────
-- Tabela de sócios
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.socios (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id                 UUID NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  nome                    TEXT NOT NULL,
  cpf                     TEXT,
  data_nascimento         DATE,
  email                   TEXT,
  cargo                   TEXT,
  percentual_participacao NUMERIC(5,2),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.socios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "socios_owner_all" ON public.socios
  FOR ALL USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_socios_empresa_id ON public.socios(empresa_id);
CREATE INDEX IF NOT EXISTS idx_socios_user_id    ON public.socios(user_id);

-- Índice para consulta rápida de aniversariantes (mês e dia)
CREATE INDEX IF NOT EXISTS idx_socios_nascimento_md
  ON public.socios (EXTRACT(MONTH FROM data_nascimento), EXTRACT(DAY FROM data_nascimento))
  WHERE data_nascimento IS NOT NULL;
