-- ═══════════════════════════════════════════════════════════════════
-- Departamentos dinâmicos + vínculo com usuarios_perfil
-- Execute no Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- 1. Tabela de departamentos do escritório
CREATE TABLE IF NOT EXISTS public.departamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  modulos_padrao TEXT[] NOT NULL DEFAULT '{}',
  cor TEXT NOT NULL DEFAULT '#6366f1',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, nome)
);

ALTER TABLE public.departamentos ENABLE ROW LEVEL SECURITY;

-- Owner pode tudo
CREATE POLICY "departamentos_owner_select"
  ON public.departamentos FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "departamentos_owner_insert"
  ON public.departamentos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "departamentos_owner_update"
  ON public.departamentos FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "departamentos_owner_delete"
  ON public.departamentos FOR DELETE
  USING (auth.uid() = user_id);

-- Membros da equipe podem ver os departamentos do seu escritório
CREATE POLICY "departamentos_equipe_select"
  ON public.departamentos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios_perfil up
       WHERE up.user_id = auth.uid()
         AND up.escritorio_owner_id = departamentos.user_id
    )
  );

-- Trigger updated_at
CREATE TRIGGER update_departamentos_updated_at
  BEFORE UPDATE ON public.departamentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Vínculo: departamento principal do membro da equipe
ALTER TABLE public.usuarios_perfil
  ADD COLUMN IF NOT EXISTS departamento_id UUID REFERENCES public.departamentos(id) ON DELETE SET NULL;

-- 3. Seed dos departamentos iniciais (serão criados pelo owner ao usar a plataforma)
-- Nota: Os departamentos são criados por cada owner individualmente.
-- Abaixo é apenas um exemplo de como ficam. O seed real acontece pela interface.
-- Se quiser popular automaticamente para um owner_id específico, descomente e substitua <OWNER_ID>:
--
-- INSERT INTO public.departamentos (user_id, nome, descricao, cor, modulos_padrao) VALUES
--   ('<OWNER_ID>', 'Contábil',     'Departamento Contábil',          '#3b82f6', '{}'),
--   ('<OWNER_ID>', 'Fiscal',       'Departamento Fiscal',            '#10b981', '{}'),
--   ('<OWNER_ID>', 'Pessoal',      'Departamento Pessoal',           '#f59e0b', '{}'),
--   ('<OWNER_ID>', 'Gestão',       'Gestão e Administração',         '#8b5cf6', '{}'),
--   ('<OWNER_ID>', 'Legalização',  'Legalização e Abertura',         '#ef4444', '{}'),
--   ('<OWNER_ID>', 'Financeiro',   'Departamento Financeiro',        '#06b6d4', '{}')
-- ON CONFLICT (user_id, nome) DO NOTHING;
