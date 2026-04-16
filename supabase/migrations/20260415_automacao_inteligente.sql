-- ═══════════════════════════════════════════════════════════════════
-- Automação inteligente: leitura de PDF + fila de pendentes
-- Execute no Supabase → SQL Editor (em 2 partes se necessário)
-- ═══════════════════════════════════════════════════════════════════

-- 1. Palavras-chave para identificação automática do tipo de obrigação
ALTER TABLE public.rotina_modelo
  ADD COLUMN IF NOT EXISTS palavras_chave TEXT[] DEFAULT '{}';

-- Preenche palavras-chave padrão para obrigações já cadastradas
UPDATE public.rotina_modelo SET palavras_chave = ARRAY['PGDAS-D','Simples Nacional','Programa Gerador','PGDAS']
  WHERE lower(tipo_rotina) = 'pgdas' AND (palavras_chave IS NULL OR palavras_chave = '{}');

UPDATE public.rotina_modelo SET palavras_chave = ARRAY['Documento de Arrecadação','DAS ','DAS-MEI','Guia DAS']
  WHERE lower(tipo_rotina) = 'das' AND (palavras_chave IS NULL OR palavras_chave = '{}');

UPDATE public.rotina_modelo SET palavras_chave = ARRAY['FGTS','SEFIP','Fundo de Garantia','GRRF','DARF FGTS']
  WHERE lower(tipo_rotina) = 'fgts' AND (palavras_chave IS NULL OR palavras_chave = '{}');

UPDATE public.rotina_modelo SET palavras_chave = ARRAY['INSS','GPS','Guia Previdência','Instituto Nacional']
  WHERE lower(tipo_rotina) = 'inss' AND (palavras_chave IS NULL OR palavras_chave = '{}');

UPDATE public.rotina_modelo SET palavras_chave = ARRAY['PIS','COFINS','PIS/COFINS','Contribuição Social']
  WHERE lower(tipo_rotina) = 'pis' AND (palavras_chave IS NULL OR palavras_chave = '{}');

UPDATE public.rotina_modelo SET palavras_chave = ARRAY['IRPJ','CSLL','Imposto de Renda','DARF IRPJ']
  WHERE lower(tipo_rotina) = 'irpj' AND (palavras_chave IS NULL OR palavras_chave = '{}');

UPDATE public.rotina_modelo SET palavras_chave = ARRAY['ISS','Imposto Sobre Serviços','Nota Fiscal Serviço','NFS-e']
  WHERE lower(tipo_rotina) = 'iss' AND (palavras_chave IS NULL OR palavras_chave = '{}');

UPDATE public.rotina_modelo SET palavras_chave = ARRAY['DCTF','Declaração de Débitos','Créditos Tributários Federais']
  WHERE lower(tipo_rotina) = 'dctf' AND (palavras_chave IS NULL OR palavras_chave = '{}');

UPDATE public.rotina_modelo SET palavras_chave = ARRAY['ECF','Escrituração Contábil Fiscal','IRPJ/CSL']
  WHERE lower(tipo_rotina) = 'ecf' AND (palavras_chave IS NULL OR palavras_chave = '{}');

UPDATE public.rotina_modelo SET palavras_chave = ARRAY['ECD','Escrituração Contábil Digital','SPED Contábil']
  WHERE lower(tipo_rotina) = 'ecd' AND (palavras_chave IS NULL OR palavras_chave = '{}');

-- 2. Fila de documentos pendentes (upload sem rotina identificada)
CREATE TABLE IF NOT EXISTS public.documentos_pendentes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  arquivo_path         TEXT NOT NULL,
  arquivo_url          TEXT,
  arquivo_nome         TEXT,
  cnpj_detectado       TEXT,
  competencia_detectada DATE,
  tipo_detectado       TEXT,
  confianca            INTEGER DEFAULT 0,   -- 0-100
  status               TEXT NOT NULL DEFAULT 'pendente',  -- pendente | vinculado | ignorado
  rotina_id            UUID REFERENCES public.rotinas(id) ON DELETE SET NULL,
  observacao           TEXT,
  resolvido_por        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolvido_em         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.documentos_pendentes ENABLE ROW LEVEL SECURITY;

DO $body$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'documentos_pendentes' AND policyname = 'owner_all_docs_pendentes'
  ) THEN
    CREATE POLICY "owner_all_docs_pendentes" ON public.documentos_pendentes
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END; $body$;
