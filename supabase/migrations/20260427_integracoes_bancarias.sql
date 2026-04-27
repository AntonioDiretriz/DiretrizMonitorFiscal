-- Credenciais de integração automática por conta bancária
CREATE TABLE public.integracoes_bancarias (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conta_bancaria_id     UUID NOT NULL REFERENCES public.contas_bancarias(id) ON DELETE CASCADE,
  banco                 TEXT NOT NULL DEFAULT 'inter',  -- inter | bradesco | itau | etc
  client_id             TEXT NOT NULL,
  client_secret         TEXT NOT NULL,
  certificado_pem       TEXT NOT NULL,   -- conteúdo do certificado .pem/.crt
  chave_pem             TEXT NOT NULL,   -- conteúdo da chave privada .key/.pem
  ativo                 BOOLEAN NOT NULL DEFAULT true,
  ultima_sincronizacao  TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(conta_bancaria_id)
);

ALTER TABLE public.integracoes_bancarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own integracoes_bancarias"
  ON public.integracoes_bancarias
  USING (auth.uid() = user_id);

CREATE INDEX idx_integracoes_bancarias_user ON public.integracoes_bancarias(user_id);
CREATE INDEX idx_integracoes_bancarias_conta ON public.integracoes_bancarias(conta_bancaria_id);
