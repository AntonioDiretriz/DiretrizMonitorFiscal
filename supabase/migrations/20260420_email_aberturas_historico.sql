-- Histórico completo de aberturas de email (cada abertura = 1 linha)
CREATE TABLE IF NOT EXISTS public.email_aberturas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notificacao_id UUID NOT NULL REFERENCES public.email_notificacoes(id) ON DELETE CASCADE,
  aberto_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_abertura    TEXT,
  dispositivo    TEXT,
  user_agent     TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_aberturas_notificacao ON public.email_aberturas(notificacao_id);

ALTER TABLE public.email_aberturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem aberturas" ON public.email_aberturas
  FOR SELECT TO authenticated USING (true);
