-- =============================================================
-- SG-02: Tabela certificados (substituição do mock)
-- =============================================================
CREATE TABLE public.certificados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
  empresa TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('A1', 'A3')),
  data_vencimento DATE NOT NULL,
  email_cliente TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.certificados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own certificados" ON public.certificados FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own certificados" ON public.certificados FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own certificados" ON public.certificados FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own certificados" ON public.certificados FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_certificados_user_id ON public.certificados(user_id);
CREATE INDEX idx_certificados_empresa_id ON public.certificados(empresa_id);

CREATE TRIGGER update_certificados_updated_at
  BEFORE UPDATE ON public.certificados
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =============================================================
-- SG-03: Tabela usuarios_perfil para RBAC real
-- =============================================================
CREATE TABLE public.usuarios_perfil (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  escritorio_owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  cpf TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  pode_incluir BOOLEAN NOT NULL DEFAULT true,
  pode_editar BOOLEAN NOT NULL DEFAULT true,
  pode_excluir BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.usuarios_perfil ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages team" ON public.usuarios_perfil
  FOR ALL USING (auth.uid() = escritorio_owner_id);

CREATE INDEX idx_usuarios_perfil_owner ON public.usuarios_perfil(escritorio_owner_id);
CREATE INDEX idx_usuarios_perfil_user_id ON public.usuarios_perfil(user_id);


-- =============================================================
-- SG-07: Trigger para atualização automática do status de certidões
-- =============================================================
CREATE OR REPLACE FUNCTION public.auto_update_certidao_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.data_validade IS NOT NULL THEN
    IF NEW.data_validade < CURRENT_DATE THEN
      NEW.status := 'irregular';
    ELSIF NEW.data_validade <= CURRENT_DATE + INTERVAL '30 days' THEN
      NEW.status := 'vencendo';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_certidao_status
  BEFORE INSERT OR UPDATE OF data_validade ON public.certidoes
  FOR EACH ROW EXECUTE FUNCTION public.auto_update_certidao_status();


-- =============================================================
-- SG-17: Tabela certidoes_historico para auditoria de status
-- =============================================================
CREATE TABLE public.certidoes_historico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  certidao_id UUID NOT NULL REFERENCES public.certidoes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status_anterior certidao_status,
  status_novo certidao_status NOT NULL,
  observacao TEXT,
  alterado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.certidoes_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own historico" ON public.certidoes_historico
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own historico" ON public.certidoes_historico
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_historico_certidao_id ON public.certidoes_historico(certidao_id);
CREATE INDEX idx_historico_user_id ON public.certidoes_historico(user_id);
