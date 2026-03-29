-- ── Fase 1: Módulo Financeiro ────────────────────────────────────────────────

-- Enums
CREATE TYPE public.conta_pagar_status AS ENUM ('pendente', 'aprovado', 'pago', 'vencido', 'cancelado');
CREATE TYPE public.conta_pagar_origem AS ENUM ('manual', 'nfe', 'recorrente');
CREATE TYPE public.plano_conta_tipo   AS ENUM ('receita', 'despesa', 'investimento', 'imposto');

-- ── Fornecedores ─────────────────────────────────────────────────────────────
CREATE TABLE public.fornecedores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  cnpj_cpf    TEXT,
  email       TEXT,
  telefone    TEXT,
  categoria   TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own fornecedores"   ON public.fornecedores FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own fornecedores"  ON public.fornecedores FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own fornecedores"  ON public.fornecedores FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own fornecedores"  ON public.fornecedores FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_fornecedores_user_id ON public.fornecedores(user_id);

-- ── Plano de Contas ───────────────────────────────────────────────────────────
CREATE TABLE public.plano_contas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  codigo      TEXT NOT NULL,
  nome        TEXT NOT NULL,
  tipo        public.plano_conta_tipo NOT NULL,
  parent_id   UUID REFERENCES public.plano_contas(id) ON DELETE SET NULL,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.plano_contas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own plano_contas"   ON public.plano_contas FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own plano_contas"  ON public.plano_contas FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own plano_contas"  ON public.plano_contas FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own plano_contas"  ON public.plano_contas FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_plano_contas_user_id ON public.plano_contas(user_id);

-- ── Contas a Pagar ────────────────────────────────────────────────────────────
CREATE TABLE public.contas_pagar (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id        UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
  fornecedor_id     UUID REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  fornecedor        TEXT NOT NULL,
  cnpj_fornecedor   TEXT,
  valor             NUMERIC(12,2) NOT NULL,
  data_emissao      DATE,
  data_vencimento   DATE NOT NULL,
  data_pagamento    DATE,
  categoria         TEXT,
  plano_conta_id    UUID REFERENCES public.plano_contas(id) ON DELETE SET NULL,
  centro_custo      TEXT,
  forma_pagamento   TEXT,
  status            public.conta_pagar_status NOT NULL DEFAULT 'pendente',
  origem            public.conta_pagar_origem NOT NULL DEFAULT 'manual',
  descricao         TEXT,
  observacao        TEXT,
  comprovante_url   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contas_pagar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own contas_pagar"   ON public.contas_pagar FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own contas_pagar"  ON public.contas_pagar FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own contas_pagar"  ON public.contas_pagar FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own contas_pagar"  ON public.contas_pagar FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_contas_pagar_user_id        ON public.contas_pagar(user_id);
CREATE INDEX idx_contas_pagar_empresa_id     ON public.contas_pagar(empresa_id);
CREATE INDEX idx_contas_pagar_data_vencimento ON public.contas_pagar(data_vencimento);
CREATE INDEX idx_contas_pagar_status         ON public.contas_pagar(status);

-- Auto-updated_at
CREATE OR REPLACE FUNCTION public.update_contas_pagar_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_contas_pagar_updated_at
  BEFORE UPDATE ON public.contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.update_contas_pagar_updated_at();

-- Auto-marcar como vencido
CREATE OR REPLACE FUNCTION public.atualizar_status_contas_vencidas()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.contas_pagar
  SET status = 'vencido'
  WHERE status = 'pendente'
    AND data_vencimento < CURRENT_DATE;
END;
$$;
