CREATE TABLE public.belvo_connections (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conta_bancaria_id    UUID REFERENCES public.contas_bancarias(id) ON DELETE SET NULL,
  link_id              TEXT NOT NULL,
  banco_nome           TEXT,
  status               TEXT NOT NULL DEFAULT 'connected',
  ultima_sincronizacao TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, link_id)
);

ALTER TABLE public.belvo_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own belvo_connections"
  ON public.belvo_connections USING (auth.uid() = user_id);
