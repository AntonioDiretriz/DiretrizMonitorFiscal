-- Adiciona campos de rastreamento de abertura
ALTER TABLE public.email_notificacoes
  ADD COLUMN IF NOT EXISTS ip_abertura      TEXT,
  ADD COLUMN IF NOT EXISTS dispositivo      TEXT,
  ADD COLUMN IF NOT EXISTS user_agent       TEXT;
