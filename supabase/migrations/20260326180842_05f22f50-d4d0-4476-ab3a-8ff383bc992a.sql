
-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_escritorio TEXT,
  responsavel TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Create empresas table
CREATE TABLE public.empresas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cnpj TEXT NOT NULL,
  razao_social TEXT NOT NULL,
  municipio TEXT,
  uf TEXT,
  regime_tributario TEXT,
  responsavel TEXT,
  email_responsavel TEXT,
  inscricao_municipal TEXT,
  inscricao_estadual TEXT,
  ativa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own empresas" ON public.empresas FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own empresas" ON public.empresas FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own empresas" ON public.empresas FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own empresas" ON public.empresas FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_empresas_user_id ON public.empresas(user_id);
CREATE INDEX idx_empresas_cnpj ON public.empresas(cnpj);

-- Create certidoes table
CREATE TYPE public.certidao_tipo AS ENUM ('federal_rfb', 'federal_pgfn', 'estadual_sefaz', 'municipal_iss', 'municipal_recife', 'cnd_fgts', 'cnd_trabalhista');
CREATE TYPE public.certidao_status AS ENUM ('regular', 'vencendo', 'irregular', 'indisponivel');

CREATE TABLE public.certidoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo certidao_tipo NOT NULL,
  status certidao_status NOT NULL DEFAULT 'indisponivel',
  data_emissao DATE,
  data_validade DATE,
  observacao TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.certidoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own certidoes" ON public.certidoes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own certidoes" ON public.certidoes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own certidoes" ON public.certidoes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own certidoes" ON public.certidoes FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_certidoes_empresa_id ON public.certidoes(empresa_id);
CREATE INDEX idx_certidoes_user_id ON public.certidoes(user_id);

-- Create alertas table
CREATE TYPE public.alerta_nivel AS ENUM ('critico', 'aviso', 'info');

CREATE TABLE public.alertas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
  certidao_id UUID REFERENCES public.certidoes(id) ON DELETE SET NULL,
  nivel alerta_nivel NOT NULL DEFAULT 'info',
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  lida BOOLEAN NOT NULL DEFAULT false,
  resolvida BOOLEAN NOT NULL DEFAULT false,
  acao_recomendada TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.alertas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own alertas" ON public.alertas FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own alertas" ON public.alertas FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own alertas" ON public.alertas FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own alertas" ON public.alertas FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_alertas_user_id ON public.alertas(user_id);
CREATE INDEX idx_alertas_empresa_id ON public.alertas(empresa_id);

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_empresas_updated_at BEFORE UPDATE ON public.empresas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_certidoes_updated_at BEFORE UPDATE ON public.certidoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
