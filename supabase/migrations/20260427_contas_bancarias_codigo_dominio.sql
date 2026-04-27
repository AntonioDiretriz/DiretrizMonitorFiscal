-- Código da conta bancária no sistema Domínio (necessário para exportação TXT)
ALTER TABLE public.contas_bancarias
  ADD COLUMN IF NOT EXISTS codigo_dominio TEXT;
