-- Corrige RLS de certificados para membros da equipe verem os dados do escritório
DROP POLICY IF EXISTS "Users can view own certificados"   ON public.certificados;
DROP POLICY IF EXISTS "Users can update own certificados" ON public.certificados;
DROP POLICY IF EXISTS "Users can delete own certificados" ON public.certificados;
DROP POLICY IF EXISTS "Users can insert own certificados" ON public.certificados;

-- Membro da equipe vê todos os certificados do escritório ao qual pertence
CREATE POLICY "Equipe acessa certificados do escritório" ON public.certificados
  FOR SELECT USING (
    auth.uid() = user_id
    OR (SELECT escritorio_owner_id FROM public.usuarios_perfil WHERE user_id = auth.uid() LIMIT 1) = user_id
  );

CREATE POLICY "Equipe insere certificados do escritório" ON public.certificados
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    OR (SELECT escritorio_owner_id FROM public.usuarios_perfil WHERE user_id = auth.uid() LIMIT 1) = user_id
  );

CREATE POLICY "Equipe atualiza certificados do escritório" ON public.certificados
  FOR UPDATE USING (
    auth.uid() = user_id
    OR (SELECT escritorio_owner_id FROM public.usuarios_perfil WHERE user_id = auth.uid() LIMIT 1) = user_id
  );

CREATE POLICY "Equipe deleta certificados do escritório" ON public.certificados
  FOR DELETE USING (
    auth.uid() = user_id
    OR (SELECT escritorio_owner_id FROM public.usuarios_perfil WHERE user_id = auth.uid() LIMIT 1) = user_id
  );
