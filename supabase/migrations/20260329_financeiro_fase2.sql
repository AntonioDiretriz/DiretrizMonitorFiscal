-- ── Fase 2: Conciliação Bancária e Importação ─────────────────────────────────

-- ── Contas Bancárias ─────────────────────────────────────────────────────────
CREATE TABLE public.contas_bancarias (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id    UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
  banco         TEXT NOT NULL,
  agencia       TEXT,
  conta         TEXT,
  tipo          TEXT NOT NULL DEFAULT 'corrente', -- corrente | poupanca | pagamento
  descricao     TEXT,
  saldo_inicial NUMERIC(14,2) NOT NULL DEFAULT 0,
  ativo         BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contas_bancarias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own contas_bancarias"   ON public.contas_bancarias FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own contas_bancarias" ON public.contas_bancarias FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own contas_bancarias" ON public.contas_bancarias FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own contas_bancarias" ON public.contas_bancarias FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_contas_bancarias_user_id   ON public.contas_bancarias(user_id);
CREATE INDEX idx_contas_bancarias_empresa_id ON public.contas_bancarias(empresa_id);

-- ── Importações Bancárias ─────────────────────────────────────────────────────
CREATE TABLE public.importacoes_bancarias (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conta_bancaria_id   UUID NOT NULL REFERENCES public.contas_bancarias(id) ON DELETE CASCADE,
  formato             TEXT NOT NULL DEFAULT 'ofx', -- ofx | csv | pdf
  arquivo_nome        TEXT,
  status              TEXT NOT NULL DEFAULT 'processando', -- processando | concluido | erro
  total_transacoes    INTEGER DEFAULT 0,
  erro_mensagem       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.importacoes_bancarias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own importacoes"   ON public.importacoes_bancarias FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own importacoes" ON public.importacoes_bancarias FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own importacoes" ON public.importacoes_bancarias FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own importacoes" ON public.importacoes_bancarias FOR DELETE USING (auth.uid() = user_id);

-- ── Transações Bancárias ──────────────────────────────────────────────────────
CREATE TABLE public.transacoes_bancarias (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conta_bancaria_id   UUID NOT NULL REFERENCES public.contas_bancarias(id) ON DELETE CASCADE,
  importacao_id       UUID REFERENCES public.importacoes_bancarias(id) ON DELETE SET NULL,
  data                DATE NOT NULL,
  descricao           TEXT NOT NULL,
  valor               NUMERIC(14,2) NOT NULL, -- negativo = débito, positivo = crédito
  tipo                TEXT NOT NULL DEFAULT 'debito', -- debito | credito
  status              TEXT NOT NULL DEFAULT 'pendente', -- pendente | conciliado | ignorado
  hash_dedup          TEXT, -- para evitar importação duplicada
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transacoes_bancarias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own transacoes"   ON public.transacoes_bancarias FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transacoes" ON public.transacoes_bancarias FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own transacoes" ON public.transacoes_bancarias FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own transacoes" ON public.transacoes_bancarias FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_transacoes_user_id          ON public.transacoes_bancarias(user_id);
CREATE INDEX idx_transacoes_conta_id         ON public.transacoes_bancarias(conta_bancaria_id);
CREATE INDEX idx_transacoes_data             ON public.transacoes_bancarias(data);
CREATE INDEX idx_transacoes_status           ON public.transacoes_bancarias(status);
CREATE UNIQUE INDEX idx_transacoes_hash      ON public.transacoes_bancarias(user_id, conta_bancaria_id, hash_dedup)
  WHERE hash_dedup IS NOT NULL;

-- ── Conciliações ──────────────────────────────────────────────────────────────
CREATE TABLE public.conciliacoes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transacao_id        UUID NOT NULL REFERENCES public.transacoes_bancarias(id) ON DELETE CASCADE,
  conta_pagar_id      UUID REFERENCES public.contas_pagar(id) ON DELETE SET NULL,
  confianca           INTEGER DEFAULT 100 CHECK (confianca BETWEEN 0 AND 100),
  tipo                TEXT NOT NULL DEFAULT 'manual', -- automatica | semi | manual
  criado_por          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  observacao          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.conciliacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own conciliacoes"   ON public.conciliacoes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own conciliacoes" ON public.conciliacoes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own conciliacoes" ON public.conciliacoes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own conciliacoes" ON public.conciliacoes FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_conciliacoes_transacao_id   ON public.conciliacoes(transacao_id);
CREATE INDEX idx_conciliacoes_conta_pagar_id ON public.conciliacoes(conta_pagar_id);
