-- Execute este script no editor SQL do Supabase para criar as tabelas do módulo de Confronto XML

-- 1. Criar tabela de XMLs Armazenados
CREATE TABLE IF NOT EXISTS public.xmls_armazenados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  ch_nfe TEXT NOT NULL,
  n_nf TEXT,
  serie TEXT,
  dh_emi TIMESTAMPTZ,
  cnpj_emitente TEXT,
  x_nome TEXT,
  v_nf NUMERIC,
  v_ipi NUMERIC,
  cancelada BOOLEAN DEFAULT false NOT NULL,
  xml_data JSONB NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(empresa_id, ch_nfe)
);

-- Ativar RLS para xmls_armazenados
ALTER TABLE public.xmls_armazenados ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para xmls_armazenados
CREATE POLICY "Permitir leitura de XMLs para usuários autenticados" 
ON public.xmls_armazenados FOR SELECT TO authenticated USING (true);

CREATE POLICY "Permitir inserção de XMLs para usuários autenticados" 
ON public.xmls_armazenados FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Permitir atualização de XMLs para usuários autenticados" 
ON public.xmls_armazenados FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Permitir deleção de XMLs para usuários autenticados" 
ON public.xmls_armazenados FOR DELETE TO authenticated USING (true);


-- 2. Criar tabela de Fechamentos Mensais
CREATE TABLE IF NOT EXISTS public.fechamentos_mensais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  competencia TEXT NOT NULL,
  titulo TEXT,
  fechado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  fechado_em TIMESTAMPTZ DEFAULT now() NOT NULL,
  resumo JSONB NOT NULL,
  resultados JSONB NOT NULL
);

-- Ativar RLS para fechamentos_mensais
ALTER TABLE public.fechamentos_mensais ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para fechamentos_mensais
CREATE POLICY "Permitir leitura de fechamentos para usuários autenticados" 
ON public.fechamentos_mensais FOR SELECT TO authenticated USING (true);

CREATE POLICY "Permitir inserção de fechamentos para usuários autenticados" 
ON public.fechamentos_mensais FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Permitir atualização de fechamentos para usuários autenticados" 
ON public.fechamentos_mensais FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Permitir deleção de fechamentos para usuários autenticados" 
ON public.fechamentos_mensais FOR DELETE TO authenticated USING (true);


-- Notificar PostgREST para recarregar o cache do schema
NOTIFY pgrst, 'reload schema';
