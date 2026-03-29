-- Adiciona coluna telefone à tabela empresas
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS telefone TEXT;
