-- ═══════════════════════════════════════════════════════════════════
-- Automação de rotinas: pasta de destino por tipo de obrigação
-- Execute no Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- 1. Pasta de destino configurável por tipo de rotina
--    Padrão de path: {tipo}/{empresa_cnpj}/{competencia_yyyymm}/
--    Exemplo: pgdas/44389529000114/202604/
ALTER TABLE public.rotinas
  ADD COLUMN IF NOT EXISTS pasta_destino   TEXT,    -- bucket path onde o arquivo deve ser salvo
  ADD COLUMN IF NOT EXISTS arquivo_url     TEXT,    -- URL do arquivo após upload
  ADD COLUMN IF NOT EXISTS auto_concluida  BOOLEAN NOT NULL DEFAULT false;  -- concluída pelo robô

-- 2. Tabela de configuração de automação por tipo de obrigação
CREATE TABLE IF NOT EXISTS public.rotina_automacao_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo_rotina   TEXT NOT NULL,          -- ex: 'pgdas', 'das', 'fgts', 'inss'
  pasta_modelo  TEXT NOT NULL,          -- template do path: '{tipo}/{cnpj}/{competencia}/'
  extensoes     TEXT[] DEFAULT ARRAY['pdf'],  -- extensões aceitas
  auto_concluir BOOLEAN NOT NULL DEFAULT true,
  ativo         BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, tipo_rotina)
);

ALTER TABLE public.rotina_automacao_config ENABLE ROW LEVEL SECURITY;

DO $body$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'rotina_automacao_config'
      AND policyname = 'owner_all_automacao'
  ) THEN
    CREATE POLICY "owner_all_automacao" ON public.rotina_automacao_config
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END; $body$;

-- 3. Log de arquivos detectados / baixados pelo robô
CREATE TABLE IF NOT EXISTS public.rotina_automacao_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rotina_id     UUID REFERENCES public.rotinas(id) ON DELETE SET NULL,
  arquivo_path  TEXT NOT NULL,
  arquivo_nome  TEXT,
  tamanho_bytes BIGINT,
  status        TEXT NOT NULL DEFAULT 'detectado',  -- detectado | processado | erro
  erro_msg      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rotina_automacao_log ENABLE ROW LEVEL SECURITY;

DO $body$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'rotina_automacao_log'
      AND policyname = 'owner_all_automacao_log'
  ) THEN
    CREATE POLICY "owner_all_automacao_log" ON public.rotina_automacao_log
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END; $body$;

-- 4. Função chamada pelo robô: recebe path do arquivo e conclui a rotina
CREATE OR REPLACE FUNCTION public.processar_arquivo_rotina(
  p_user_id      UUID,
  p_arquivo_path TEXT,    -- ex: 'pgdas/44389529000114/202604/pgdas_abr2026.pdf'
  p_arquivo_url  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_partes       TEXT[];
  v_tipo         TEXT;
  v_cnpj         TEXT;
  v_competencia  DATE;
  v_rotina_id    UUID;
  v_config       RECORD;
BEGIN
  -- Extrai partes do path: tipo / cnpj / yyyymm / arquivo.pdf
  v_partes := string_to_array(p_arquivo_path, '/');
  IF array_length(v_partes, 1) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Formato de path inválido');
  END IF;

  v_tipo  := lower(v_partes[1]);
  v_cnpj  := v_partes[2];
  -- converte yyyymm para primeiro dia do mês
  BEGIN
    v_competencia := to_date(v_partes[3], 'YYYYMM');
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Competência inválida no path: ' || v_partes[3]);
  END;

  -- Verifica configuração de automação
  SELECT * INTO v_config
    FROM public.rotina_automacao_config
   WHERE user_id = p_user_id
     AND tipo_rotina = v_tipo
     AND ativo = true;

  IF NOT FOUND OR NOT v_config.auto_concluir THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Sem config de automação ativa para: ' || v_tipo);
  END IF;

  -- Busca a rotina correspondente pela empresa (CNPJ) + tipo + competência
  SELECT r.id INTO v_rotina_id
    FROM public.rotinas r
    JOIN public.empresas e ON e.id = r.empresa_id
   WHERE r.user_id        = p_user_id
     AND lower(r.tipo)    = v_tipo
     AND r.competencia    = v_competencia
     AND replace(replace(replace(e.cnpj, '.',''), '/',''), '-','') = v_cnpj
     AND r.status NOT IN ('concluida', 'cancelada', 'nao_aplicavel')
   ORDER BY r.created_at DESC
   LIMIT 1;

  IF v_rotina_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Rotina não encontrada para cnpj=' || v_cnpj || ' tipo=' || v_tipo || ' comp=' || v_competencia);
  END IF;

  -- Conclui a rotina + salva URL do arquivo
  UPDATE public.rotinas
     SET status         = 'concluida',
         etapa          = 'concluido',
         arquivo_url    = p_arquivo_url,
         auto_concluida = true,
         pasta_destino  = p_arquivo_path,
         updated_at     = now()
   WHERE id = v_rotina_id;

  -- Cria evidência automática
  INSERT INTO public.rotinas_evidencias (rotina_id, user_id, tipo, arquivo_url, observacao)
  VALUES (v_rotina_id, p_user_id, 'comprovante', p_arquivo_url, 'Arquivo detectado automaticamente pelo robô');

  -- Cria comentário de log
  INSERT INTO public.rotinas_comentarios (rotina_id, user_id, mensagem, tipo)
  VALUES (v_rotina_id, p_user_id, 'Concluída automaticamente — arquivo: ' || p_arquivo_path, 'status_change');

  -- Registra no log
  UPDATE public.rotina_automacao_log
     SET status = 'processado', rotina_id = v_rotina_id
   WHERE user_id = p_user_id AND arquivo_path = p_arquivo_path AND status = 'detectado';

  RETURN jsonb_build_object('ok', true, 'rotina_id', v_rotina_id);
END; $$;

GRANT EXECUTE ON FUNCTION public.processar_arquivo_rotina(UUID, TEXT, TEXT) TO authenticated;
