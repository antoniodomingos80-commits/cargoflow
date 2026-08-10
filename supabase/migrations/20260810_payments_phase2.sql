-- =============================================================================
-- CargoFlow · Fase 2 Pagamentos
-- Persistencia e reconciliacao de pagamentos (Stripe/Multicaixa)
-- =============================================================================

CREATE TYPE payment_provider AS ENUM ('STRIPE', 'MULTICAIXA');
CREATE TYPE payment_status AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED');

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agreement_id UUID NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider payment_provider NOT NULL,
  status payment_status NOT NULL DEFAULT 'PENDING',
  amount NUMERIC(14,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'AOA',
  external_id TEXT,
  external_reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payments_amount_positive CHECK (amount > 0)
);

CREATE INDEX idx_payments_tenant_created ON payments(tenant_id, created_at DESC);
CREATE INDEX idx_payments_agreement ON payments(agreement_id);
CREATE INDEX idx_payments_provider_status ON payments(provider, status);
CREATE UNIQUE INDEX idx_payments_provider_reference_unique
  ON payments(provider, external_reference)
  WHERE external_reference IS NOT NULL;

CREATE OR REPLACE FUNCTION set_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION set_payments_updated_at();

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Cada empresa ve apenas os seus pagamentos
CREATE POLICY "payments_select_own_tenant"
ON payments FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM users u
    WHERE u.auth_user_id = auth.uid()
      AND u.tenant_id = payments.tenant_id
      AND u.is_active = TRUE
  )
);

-- Insercao pela propria empresa (checkout iniciado na app)
CREATE POLICY "payments_insert_own_tenant"
ON payments FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM users u
    WHERE u.auth_user_id = auth.uid()
      AND u.tenant_id = payments.tenant_id
      AND u.is_active = TRUE
  )
);

-- Atualizacao reservada a administradores de plataforma
CREATE POLICY "payments_update_platform_admin"
ON payments FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM users u
    WHERE u.auth_user_id = auth.uid()
      AND u.role = 'PLATFORM_ADMIN'
      AND u.is_active = TRUE
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM users u
    WHERE u.auth_user_id = auth.uid()
      AND u.role = 'PLATFORM_ADMIN'
      AND u.is_active = TRUE
  )
);
