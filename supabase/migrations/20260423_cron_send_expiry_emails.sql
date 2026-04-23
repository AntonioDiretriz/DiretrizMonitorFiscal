-- ═══════════════════════════════════════════════════════════════════
-- Agendamento diário da função send-expiry-emails
-- Executa todos os dias às 08:00 UTC (05:00 horário de Brasília)
-- Execute no Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Habilita extensões necessárias
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove agendamento anterior se existir
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-expiry-emails-daily') THEN
    PERFORM cron.unschedule('send-expiry-emails-daily');
  END IF;
END;
$$;

-- Agenda: todos os dias às 08:00 UTC
SELECT cron.schedule(
  'send-expiry-emails-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://awdfeqxagqplpotjwant.supabase.co/functions/v1/send-expiry-emails',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
