-- Adiciona coluna de módulos ao perfil de usuários da equipe
ALTER TABLE public.usuarios_perfil
  ADD COLUMN IF NOT EXISTS modulos TEXT[] NOT NULL DEFAULT '{}';

-- Comentário: array de IDs de módulos permitidos
-- Ex: '{"certidoes","certificados","caixas"}' = acesso a tudo
-- Ex: '{"certidoes"}' = apenas certidões
-- Ex: '{}' = nenhum módulo (sem is_admin)
-- is_admin=true ignora esta coluna e libera tudo
