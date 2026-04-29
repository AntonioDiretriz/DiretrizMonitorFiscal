-- Tabela de auditoria: registra INSERT, UPDATE e DELETE nas tabelas principais
CREATE TABLE IF NOT EXISTS public.audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela       TEXT NOT NULL,
  operacao     TEXT NOT NULL,  -- INSERT | UPDATE | DELETE
  registro_id  UUID,
  dados_antes  JSONB,          -- valores antes da alteração (UPDATE/DELETE)
  dados_depois JSONB,          -- valores após a alteração (INSERT/UPDATE)
  user_id      UUID,           -- auth.uid() no momento da operação
  executado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para consulta rápida
CREATE INDEX IF NOT EXISTS audit_log_tabela_idx      ON public.audit_log (tabela);
CREATE INDEX IF NOT EXISTS audit_log_registro_id_idx ON public.audit_log (registro_id);
CREATE INDEX IF NOT EXISTS audit_log_executado_em_idx ON public.audit_log (executado_em DESC);

-- RLS: apenas leitura para usuários autenticados
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_select" ON public.audit_log
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Função genérica de auditoria
CREATE OR REPLACE FUNCTION public.fn_audit_log()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (tabela, operacao, registro_id, dados_depois, user_id)
    VALUES (TG_TABLE_NAME, 'INSERT', (NEW.id)::UUID, to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log (tabela, operacao, registro_id, dados_antes, dados_depois, user_id)
    VALUES (TG_TABLE_NAME, 'UPDATE', (NEW.id)::UUID, to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (tabela, operacao, registro_id, dados_antes, user_id)
    VALUES (TG_TABLE_NAME, 'DELETE', (OLD.id)::UUID, to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Triggers nas tabelas principais
CREATE OR REPLACE TRIGGER audit_caixas_postais
  AFTER INSERT OR UPDATE OR DELETE ON public.caixas_postais
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE OR REPLACE TRIGGER audit_certificados
  AFTER INSERT OR UPDATE OR DELETE ON public.certificados
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE OR REPLACE TRIGGER audit_empresas
  AFTER INSERT OR UPDATE OR DELETE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE OR REPLACE TRIGGER audit_certidoes
  AFTER INSERT OR UPDATE OR DELETE ON public.certidoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE OR REPLACE TRIGGER audit_socios
  AFTER INSERT OR UPDATE OR DELETE ON public.socios
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE OR REPLACE TRIGGER audit_contas_pagar
  AFTER INSERT OR UPDATE OR DELETE ON public.contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();
