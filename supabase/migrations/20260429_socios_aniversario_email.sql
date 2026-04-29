-- Registra o ano em que o email de aniversário foi enviado (evita reenvio no mesmo ano)
ALTER TABLE public.socios
  ADD COLUMN IF NOT EXISTS ultimo_email_aniversario DATE;
