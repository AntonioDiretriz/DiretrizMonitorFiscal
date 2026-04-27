-- Conexões Open Finance via Pluggy (multi-banco)
CREATE TABLE public.pluggy_connections (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conta_bancaria_id    UUID REFERENCES public.contas_bancarias(id) ON DELETE SET NULL,
  item_id              TEXT NOT NULL,
  account_id           TEXT,
  banco_nome           TEXT,
  status               TEXT NOT NULL DEFAULT 'connected', -- connected | disconnected | error
  ultima_sincronizacao TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, item_id)
);

ALTER TABLE public.pluggy_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own pluggy_connections"
  ON public.pluggy_connections USING (auth.uid() = user_id);

CREATE INDEX idx_pluggy_connections_user  ON public.pluggy_connections(user_id);
CREATE INDEX idx_pluggy_connections_conta ON public.pluggy_connections(conta_bancaria_id);
