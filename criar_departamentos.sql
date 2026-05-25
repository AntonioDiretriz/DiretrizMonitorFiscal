-- Crie a tabela de departamentos no Supabase rodando o script abaixo no SQL Editor

CREATE TABLE public.departamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  cor TEXT NOT NULL DEFAULT '#6366f1',
  modulos_padrao JSONB NOT NULL DEFAULT '[]',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, nome)
);

-- Ativar RLS
ALTER TABLE public.departamentos ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
CREATE POLICY "Donos leem seus departamentos" 
ON public.departamentos FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "Donos inserem seus departamentos" 
ON public.departamentos FOR INSERT 
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Donos atualizam seus departamentos" 
ON public.departamentos FOR UPDATE 
USING (user_id = auth.uid());

CREATE POLICY "Donos deletam seus departamentos" 
ON public.departamentos FOR DELETE 
USING (user_id = auth.uid());
