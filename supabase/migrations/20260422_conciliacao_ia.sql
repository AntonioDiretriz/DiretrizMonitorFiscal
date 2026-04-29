-- ── Conciliação IA: plano de contas + regras + hash de arquivo ────────────────

-- 1. Vincula transação ao plano de contas
ALTER TABLE public.transacoes_bancarias
  ADD COLUMN IF NOT EXISTS plano_contas_id UUID REFERENCES public.plano_contas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS categorizado_por TEXT DEFAULT 'manual'; -- manual | ia | regra

-- 2. Hash do arquivo para evitar reimportação duplicada
ALTER TABLE public.importacoes_bancarias
  ADD COLUMN IF NOT EXISTS arquivo_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_importacoes_hash
  ON public.importacoes_bancarias(user_id, conta_bancaria_id, arquivo_hash)
  WHERE arquivo_hash IS NOT NULL;

-- 3. Regras de conciliação (aprendizado por descrição)
CREATE TABLE IF NOT EXISTS public.regras_conciliacao (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  padrao          TEXT NOT NULL,        -- trecho da descrição (case-insensitive)
  plano_contas_id UUID REFERENCES public.plano_contas(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL DEFAULT 'debito', -- debito | credito | ambos
  uso_count       INTEGER NOT NULL DEFAULT 1,
  automatica      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, padrao, tipo)
);

ALTER TABLE public.regras_conciliacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "regras_select" ON public.regras_conciliacao FOR SELECT USING (auth.uid() = user_id OR public.get_escritorio_owner_id() = user_id);
CREATE POLICY "regras_insert" ON public.regras_conciliacao FOR INSERT WITH CHECK (auth.uid() = user_id OR public.get_escritorio_owner_id() = user_id);
CREATE POLICY "regras_update" ON public.regras_conciliacao FOR UPDATE USING (auth.uid() = user_id OR public.get_escritorio_owner_id() = user_id);
CREATE POLICY "regras_delete" ON public.regras_conciliacao FOR DELETE USING (auth.uid() = user_id OR public.get_escritorio_owner_id() = user_id);

CREATE INDEX IF NOT EXISTS idx_regras_user_id ON public.regras_conciliacao(user_id);
