-- Confronto XML v2: base histórica de planilhas + novos campos dos XMLs.
-- Idempotente: também cria as tabelas da v1 (criar_confronto_xml.sql) caso ainda não existam.

-- 1. XMLs armazenados (v1)
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

-- Novos campos: CNPJ do destinatário (notas emitidas pela própria empresa / garantia)
-- e valor escriturado no padrão Dealernet.
ALTER TABLE public.xmls_armazenados ADD COLUMN IF NOT EXISTS cnpj_dest TEXT;
ALTER TABLE public.xmls_armazenados ADD COLUMN IF NOT EXISTS v_escriturado NUMERIC;

UPDATE public.xmls_armazenados
SET cnpj_dest = NULLIF(regexp_replace(COALESCE(xml_data->>'cnpjDest', ''), '[^0-9]', '', 'g'), '')
WHERE cnpj_dest IS NULL;

CREATE INDEX IF NOT EXISTS idx_xmls_armazenados_empresa ON public.xmls_armazenados(empresa_id);
CREATE INDEX IF NOT EXISTS idx_xmls_armazenados_n_nf ON public.xmls_armazenados(n_nf);

ALTER TABLE public.xmls_armazenados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura de XMLs para usuários autenticados" ON public.xmls_armazenados;
CREATE POLICY "Permitir leitura de XMLs para usuários autenticados"
ON public.xmls_armazenados FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir inserção de XMLs para usuários autenticados" ON public.xmls_armazenados;
CREATE POLICY "Permitir inserção de XMLs para usuários autenticados"
ON public.xmls_armazenados FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir atualização de XMLs para usuários autenticados" ON public.xmls_armazenados;
CREATE POLICY "Permitir atualização de XMLs para usuários autenticados"
ON public.xmls_armazenados FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir deleção de XMLs para usuários autenticados" ON public.xmls_armazenados;
CREATE POLICY "Permitir deleção de XMLs para usuários autenticados"
ON public.xmls_armazenados FOR DELETE TO authenticated USING (true);


-- 2. Fechamentos mensais (v1)
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

ALTER TABLE public.fechamentos_mensais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura de fechamentos para usuários autenticados" ON public.fechamentos_mensais;
CREATE POLICY "Permitir leitura de fechamentos para usuários autenticados"
ON public.fechamentos_mensais FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir inserção de fechamentos para usuários autenticados" ON public.fechamentos_mensais;
CREATE POLICY "Permitir inserção de fechamentos para usuários autenticados"
ON public.fechamentos_mensais FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir atualização de fechamentos para usuários autenticados" ON public.fechamentos_mensais;
CREATE POLICY "Permitir atualização de fechamentos para usuários autenticados"
ON public.fechamentos_mensais FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir deleção de fechamentos para usuários autenticados" ON public.fechamentos_mensais;
CREATE POLICY "Permitir deleção de fechamentos para usuários autenticados"
ON public.fechamentos_mensais FOR DELETE TO authenticated USING (true);


-- 3. Base histórica de linhas do Registro de Entrada (Excel)
CREATE TABLE IF NOT EXISTS public.excel_linhas_armazenadas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  n_nf TEXT NOT NULL,
  serie TEXT NOT NULL DEFAULT '',
  cnpj_emitente TEXT NOT NULL DEFAULT '',
  nome_emitente TEXT,
  ch_nfe TEXT,
  data_entrada TEXT,
  data_documento TEXT NOT NULL DEFAULT '',
  competencia TEXT,
  valor_contabil NUMERIC,
  v_bc NUMERIC,
  v_icms NUMERIC,
  v_st NUMERIC,
  cfop TEXT,
  sheet_name TEXT,
  row_data JSONB NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT excel_linhas_unique UNIQUE (empresa_id, n_nf, serie, cnpj_emitente, data_documento)
);

CREATE INDEX IF NOT EXISTS idx_excel_linhas_empresa ON public.excel_linhas_armazenadas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_excel_linhas_competencia ON public.excel_linhas_armazenadas(empresa_id, competencia);

ALTER TABLE public.excel_linhas_armazenadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view excel linhas" ON public.excel_linhas_armazenadas;
CREATE POLICY "Authenticated can view excel linhas"
ON public.excel_linhas_armazenadas FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can insert excel linhas" ON public.excel_linhas_armazenadas;
CREATE POLICY "Authenticated can insert excel linhas"
ON public.excel_linhas_armazenadas FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploaded_by);

DROP POLICY IF EXISTS "Authenticated can update excel linhas" ON public.excel_linhas_armazenadas;
CREATE POLICY "Authenticated can update excel linhas"
ON public.excel_linhas_armazenadas FOR UPDATE TO authenticated
USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can delete excel linhas" ON public.excel_linhas_armazenadas;
CREATE POLICY "Authenticated can delete excel linhas"
ON public.excel_linhas_armazenadas FOR DELETE TO authenticated USING (true);

DROP TRIGGER IF EXISTS update_excel_linhas_updated_at ON public.excel_linhas_armazenadas;
CREATE TRIGGER update_excel_linhas_updated_at
BEFORE UPDATE ON public.excel_linhas_armazenadas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

NOTIFY pgrst, 'reload schema';
