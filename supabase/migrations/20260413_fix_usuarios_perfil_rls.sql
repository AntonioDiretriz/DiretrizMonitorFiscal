-- ═══════════════════════════════════════════════════════════════════
-- Fix RLS: usuarios_perfil — membros da equipe precisam ler o próprio perfil
-- Execute no Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Política existente: "Owner manages team" (FOR ALL, USING: auth.uid() = escritorio_owner_id)
-- Problema: membros da equipe (auth.uid() = user_id, mas NOT = escritorio_owner_id)
--   não conseguem ler o próprio registro → AuthContext retorna null → aparece como Owner

-- Adiciona política de leitura para o próprio membro
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'usuarios_perfil'
      AND policyname = 'Team member reads own profile'
  ) THEN
    CREATE POLICY "Team member reads own profile"
      ON public.usuarios_perfil
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END;
$$;

-- Adiciona coluna papel_rotinas se ainda não existir
ALTER TABLE public.usuarios_perfil
  ADD COLUMN IF NOT EXISTS papel_rotinas TEXT NOT NULL DEFAULT 'nenhum';
