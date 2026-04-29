-- Marca transações bancárias aguardando resposta do cliente
ALTER TABLE public.transacoes_bancarias
  ADD COLUMN IF NOT EXISTS aguardando_cliente boolean NOT NULL DEFAULT false;
