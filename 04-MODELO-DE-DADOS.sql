-- =============================================================================
-- CargoFlow — Modelo de dados PostgreSQL (Fase 1 / MVP)
-- =============================================================================
-- Âmbito: tabelas necessárias para o núcleo — contas, cargas, viagens,
-- correspondência, negociação, rastreamento, prova de entrega e avaliações.
--
-- Tabelas de fases posteriores (pagamentos, faturação, manutenção de frota,
-- telemetria IoT) estão indicadas em comentário no fim do ficheiro.
--
-- Convenções:
--   · Todas as tabelas de negócio têm tenant_id (multi-empresa)
--   · Chaves primárias UUID
--   · created_at / updated_at em todas as tabelas
--   · RLS ativado em todas as tabelas de negócio
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;      -- consultas geoespaciais
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- pesquisa de texto

-- =============================================================================
-- ENUMERAÇÕES
-- =============================================================================

CREATE TYPE user_role AS ENUM (
  'MERCHANT',      -- comerciante: publica cargas
  'CARRIER',       -- camionista independente
  'COMPANY_ADMIN', -- gestor de empresa transportadora
  'COMPANY_STAFF', -- operacional de empresa
  'PLATFORM_ADMIN' -- administrador CargoFlow
);

CREATE TYPE verification_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

CREATE TYPE load_status AS ENUM (
  'DRAFT', 'PUBLISHED', 'NEGOTIATING', 'ASSIGNED', 'PICKED_UP',
  'IN_TRANSIT', 'DELIVERED', 'CONFIRMED', 'CANCELLED', 'EXPIRED'
);

CREATE TYPE trip_status AS ENUM ('PUBLISHED', 'PARTIALLY_BOOKED', 'FULL', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

CREATE TYPE vehicle_type AS ENUM (
  'LIGHT_TRUCK', 'MEDIUM_TRUCK', 'HEAVY_TRUCK', 'TRAILER',
  'REFRIGERATED', 'TANKER', 'FLATBED', 'CONTAINER'
);

CREATE TYPE cargo_type AS ENUM (
  'GENERAL', 'PERISHABLE', 'REFRIGERATED', 'FRAGILE',
  'HAZARDOUS', 'BULK', 'LIQUID', 'CONTAINER', 'LIVESTOCK'
);

CREATE TYPE offer_status AS ENUM ('PENDING', 'COUNTERED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED');

CREATE TYPE document_type AS ENUM (
  'NATIONAL_ID', 'DRIVING_LICENSE', 'VEHICLE_REGISTRATION', 'INSURANCE',
  'INSPECTION', 'COMPANY_REGISTRATION', 'TAX_ID', 'OTHER'
);

-- =============================================================================
-- ORGANIZAÇÃO E CONTAS
-- =============================================================================

-- Cada empresa/entidade é um tenant. Comerciantes e camionistas independentes
-- também têm tenant próprio (de um só utilizador) — uniformiza o modelo.
CREATE TABLE tenants (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              TEXT NOT NULL,
  slug              TEXT UNIQUE NOT NULL,
  tax_id            TEXT,                    -- NIF
  type              TEXT NOT NULL,           -- 'INDIVIDUAL' | 'COMPANY'
  country_code      CHAR(2) NOT NULL DEFAULT 'AO',
  default_currency  CHAR(3) NOT NULL DEFAULT 'AOA',
  verification      verification_status NOT NULL DEFAULT 'PENDING',
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  auth_user_id      UUID UNIQUE,             -- ligação ao Supabase Auth
  email             TEXT,
  phone             TEXT,
  full_name         TEXT NOT NULL,
  role              user_role NOT NULL,
  avatar_url        TEXT,
  verification      verification_status NOT NULL DEFAULT 'PENDING',
  mfa_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  -- Reputação agregada (denormalizada por desempenho; recalculada por trigger)
  rating_average    NUMERIC(3,2) DEFAULT NULL,
  rating_count      INTEGER NOT NULL DEFAULT 0,
  completion_rate   NUMERIC(5,2) DEFAULT NULL,  -- % operações concluídas
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_contact_required CHECK (email IS NOT NULL OR phone IS NOT NULL),
  UNIQUE (tenant_id, email),
  UNIQUE (tenant_id, phone)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_role ON users(role) WHERE is_active;

-- =============================================================================
-- FROTA
-- =============================================================================

CREATE TABLE vehicles (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plate             TEXT NOT NULL,
  type              vehicle_type NOT NULL,
  brand             TEXT,
  model             TEXT,
  year              INTEGER,
  -- Capacidades
  max_weight_kg     NUMERIC(10,2) NOT NULL,
  max_volume_m3     NUMERIC(10,2),
  -- Características que afetam a correspondência
  has_refrigeration BOOLEAN NOT NULL DEFAULT FALSE,
  has_tail_lift     BOOLEAN NOT NULL DEFAULT FALSE,
  verification      verification_status NOT NULL DEFAULT 'PENDING',
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, plate)
);

CREATE INDEX idx_vehicles_tenant ON vehicles(tenant_id) WHERE is_active;

-- Motoristas (um utilizador CARRIER ou COMPANY_STAFF associado a veículos)
CREATE TABLE drivers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  license_number    TEXT,
  license_expiry    DATE,
  verification      verification_status NOT NULL DEFAULT 'PENDING',
  -- Pontuação de confiança (fase 3: calculada por modelo)
  trust_score       NUMERIC(5,2),
  is_available      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

-- =============================================================================
-- LOCALIZAÇÕES
-- =============================================================================

CREATE TABLE locations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              TEXT NOT NULL,           -- "Armazém Central, Benguela"
  address           TEXT,
  city              TEXT NOT NULL,
  province          TEXT NOT NULL,
  country_code      CHAR(2) NOT NULL DEFAULT 'AO',
  coordinates       GEOGRAPHY(POINT, 4326) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_locations_coords ON locations USING GIST(coordinates);
CREATE INDEX idx_locations_city ON locations(city);

-- =============================================================================
-- MARKETPLACE — CARGAS
-- =============================================================================

CREATE TABLE loads (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  reference           TEXT UNIQUE NOT NULL,  -- CF-2026-000001
  created_by          UUID NOT NULL REFERENCES users(id),

  -- Trajeto
  origin_id           UUID NOT NULL REFERENCES locations(id),
  destination_id      UUID NOT NULL REFERENCES locations(id),
  distance_km         NUMERIC(10,2),         -- calculado na criação

  -- Carga
  title               TEXT NOT NULL,
  description         TEXT,
  cargo_type          cargo_type NOT NULL DEFAULT 'GENERAL',
  weight_kg           NUMERIC(10,2) NOT NULL,
  volume_m3           NUMERIC(10,2),
  requires_refrigeration BOOLEAN NOT NULL DEFAULT FALSE,
  required_vehicle_type  vehicle_type,       -- NULL = qualquer um serve

  -- Datas
  pickup_from         TIMESTAMPTZ NOT NULL,
  pickup_until        TIMESTAMPTZ NOT NULL,
  delivery_deadline   TIMESTAMPTZ,
  is_urgent           BOOLEAN NOT NULL DEFAULT FALSE,

  -- Preço
  budget_amount       NUMERIC(14,2),         -- orçamento indicativo
  currency            CHAR(3) NOT NULL DEFAULT 'AOA',
  suggested_price     NUMERIC(14,2),         -- calculado pelo motor de preços

  -- Estado
  status              load_status NOT NULL DEFAULT 'DRAFT',
  assigned_trip_id    UUID,                  -- FK definida adiante
  published_at        TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT loads_pickup_window CHECK (pickup_until >= pickup_from),
  CONSTRAINT loads_weight_positive CHECK (weight_kg > 0)
);

CREATE INDEX idx_loads_status_published ON loads(status, published_at DESC)
  WHERE status = 'PUBLISHED';
CREATE INDEX idx_loads_tenant ON loads(tenant_id);
CREATE INDEX idx_loads_route ON loads(origin_id, destination_id);
CREATE INDEX idx_loads_pickup ON loads(pickup_from) WHERE status = 'PUBLISHED';

-- Fotografias e documentos da carga
CREATE TABLE load_attachments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  load_id           UUID NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
  file_url          TEXT NOT NULL,
  file_type         TEXT NOT NULL,
  caption           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- MARKETPLACE — VIAGENS
-- =============================================================================

CREATE TABLE trips (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  reference           TEXT UNIQUE NOT NULL,
  created_by          UUID NOT NULL REFERENCES users(id),
  vehicle_id          UUID NOT NULL REFERENCES vehicles(id),
  driver_id           UUID REFERENCES drivers(id),

  -- Trajeto
  origin_id           UUID NOT NULL REFERENCES locations(id),
  destination_id      UUID NOT NULL REFERENCES locations(id),
  -- Paragens intermédias onde aceita carga adicional
  waypoints           JSONB DEFAULT '[]'::jsonb,

  -- Capacidade disponível (diminui conforme aceita cargas)
  available_weight_kg NUMERIC(10,2) NOT NULL,
  available_volume_m3 NUMERIC(10,2),

  -- Datas
  departure_at        TIMESTAMPTZ NOT NULL,
  estimated_arrival   TIMESTAMPTZ,

  -- Preço
  price_per_kg        NUMERIC(14,4),
  minimum_price       NUMERIC(14,2),
  currency            CHAR(3) NOT NULL DEFAULT 'AOA',

  status              trip_status NOT NULL DEFAULT 'PUBLISHED',
  -- Indica viagem de retorno — prioritária no matching (combate viagens em vazio)
  is_return_trip      BOOLEAN NOT NULL DEFAULT FALSE,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT trips_capacity_positive CHECK (available_weight_kg >= 0)
);

CREATE INDEX idx_trips_status_departure ON trips(status, departure_at)
  WHERE status IN ('PUBLISHED', 'PARTIALLY_BOOKED');
CREATE INDEX idx_trips_route ON trips(origin_id, destination_id);
CREATE INDEX idx_trips_tenant ON trips(tenant_id);

ALTER TABLE loads ADD CONSTRAINT fk_loads_assigned_trip
  FOREIGN KEY (assigned_trip_id) REFERENCES trips(id) ON DELETE SET NULL;

-- =============================================================================
-- CORRESPONDÊNCIA E NEGOCIAÇÃO
-- =============================================================================

-- Resultado do motor de matching: pares carga↔viagem com pontuação
CREATE TABLE matches (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  load_id           UUID NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
  trip_id           UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  score             NUMERIC(5,2) NOT NULL,   -- 0–100
  -- Decomposição da pontuação (transparência e afinação do algoritmo)
  score_breakdown   JSONB NOT NULL,
  algorithm_version TEXT NOT NULL DEFAULT 'rules-v1',
  notified_at       TIMESTAMPTZ,
  viewed_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (load_id, trip_id)
);

CREATE INDEX idx_matches_load_score ON matches(load_id, score DESC);
CREATE INDEX idx_matches_trip ON matches(trip_id);

-- Propostas e contrapropostas
CREATE TABLE offers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  load_id           UUID NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
  trip_id           UUID REFERENCES trips(id) ON DELETE SET NULL,
  offered_by        UUID NOT NULL REFERENCES users(id),
  amount            NUMERIC(14,2) NOT NULL,
  currency          CHAR(3) NOT NULL DEFAULT 'AOA',
  message           TEXT,
  status            offer_status NOT NULL DEFAULT 'PENDING',
  -- Encadeamento de contrapropostas
  parent_offer_id   UUID REFERENCES offers(id) ON DELETE SET NULL,
  expires_at        TIMESTAMPTZ,
  responded_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT offers_amount_positive CHECK (amount > 0)
);

CREATE INDEX idx_offers_load ON offers(load_id, created_at DESC);
CREATE INDEX idx_offers_status ON offers(status) WHERE status = 'PENDING';

-- Acordo fechado — o contrato da operação
CREATE TABLE agreements (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  load_id           UUID NOT NULL UNIQUE REFERENCES loads(id) ON DELETE RESTRICT,
  trip_id           UUID NOT NULL REFERENCES trips(id) ON DELETE RESTRICT,
  accepted_offer_id UUID NOT NULL REFERENCES offers(id),
  merchant_user_id  UUID NOT NULL REFERENCES users(id),
  carrier_user_id   UUID NOT NULL REFERENCES users(id),
  agreed_amount     NUMERIC(14,2) NOT NULL,
  currency          CHAR(3) NOT NULL DEFAULT 'AOA',
  platform_fee      NUMERIC(14,2) NOT NULL DEFAULT 0,
  terms_snapshot    JSONB NOT NULL,          -- condições no momento do acordo
  -- Fase 2: assinatura eletrónica
  merchant_signed_at TIMESTAMPTZ,
  carrier_signed_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- RASTREAMENTO
-- =============================================================================

-- Posições GPS. Tabela de alto volume — particionada por mês.
CREATE TABLE tracking_points (
  id                BIGSERIAL,
  trip_id           UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  driver_id         UUID REFERENCES drivers(id),
  coordinates       GEOGRAPHY(POINT, 4326) NOT NULL,
  speed_kmh         NUMERIC(6,2),
  heading           NUMERIC(5,2),
  accuracy_m        NUMERIC(8,2),
  -- Distingue registo em tempo real de sincronização offline
  recorded_at       TIMESTAMPTZ NOT NULL,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);

CREATE INDEX idx_tracking_trip_time ON tracking_points(trip_id, recorded_at DESC);

-- Eventos do ciclo de vida (linha temporal da operação)
CREATE TABLE tracking_events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  load_id           UUID NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
  event_type        TEXT NOT NULL,   -- PICKED_UP, IN_TRANSIT, ARRIVED, DELIVERED...
  description       TEXT,
  coordinates       GEOGRAPHY(POINT, 4326),
  location_name     TEXT,
  created_by        UUID REFERENCES users(id),
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tracking_events_load ON tracking_events(load_id, occurred_at DESC);

-- =============================================================================
-- PROVA DE ENTREGA
-- =============================================================================

CREATE TABLE proof_of_delivery (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  load_id           UUID NOT NULL UNIQUE REFERENCES loads(id) ON DELETE CASCADE,
  delivered_by      UUID NOT NULL REFERENCES users(id),
  received_by_name  TEXT NOT NULL,
  signature_url     TEXT,                    -- assinatura capturada
  photo_urls        TEXT[] NOT NULL DEFAULT '{}',
  coordinates       GEOGRAPHY(POINT, 4326),
  notes             TEXT,
  has_damage        BOOLEAN NOT NULL DEFAULT FALSE,
  damage_description TEXT,
  delivered_at      TIMESTAMPTZ NOT NULL,
  confirmed_by      UUID REFERENCES users(id),   -- comerciante confirma
  confirmed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- COMUNICAÇÃO
-- =============================================================================

CREATE TABLE conversations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  load_id           UUID REFERENCES loads(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE conversation_participants (
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at      TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE messages (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id         UUID NOT NULL REFERENCES users(id),
  content           TEXT,
  attachment_url    TEXT,
  attachment_type   TEXT,                    -- image | document | location
  coordinates       GEOGRAPHY(POINT, 4326),  -- partilha de localização
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT messages_has_content CHECK (content IS NOT NULL OR attachment_url IS NOT NULL)
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);

-- =============================================================================
-- AVALIAÇÕES
-- =============================================================================

CREATE TABLE reviews (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  load_id           UUID NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
  reviewer_id       UUID NOT NULL REFERENCES users(id),
  reviewed_id       UUID NOT NULL REFERENCES users(id),
  rating            SMALLINT NOT NULL,
  -- Critérios detalhados
  punctuality       SMALLINT,
  communication     SMALLINT,
  cargo_condition   SMALLINT,
  professionalism   SMALLINT,
  comment           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reviews_rating_range CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT reviews_no_self CHECK (reviewer_id <> reviewed_id),
  UNIQUE (load_id, reviewer_id)
);

CREATE INDEX idx_reviews_reviewed ON reviews(reviewed_id, created_at DESC);

-- =============================================================================
-- DOCUMENTOS
-- =============================================================================

CREATE TABLE documents (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Documento pode pertencer a utilizador, veículo ou empresa
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id        UUID REFERENCES vehicles(id) ON DELETE CASCADE,
  type              document_type NOT NULL,
  file_url          TEXT NOT NULL,
  document_number   TEXT,
  issued_at         DATE,
  expires_at        DATE,
  verification      verification_status NOT NULL DEFAULT 'PENDING',
  verified_by       UUID REFERENCES users(id),
  verified_at       TIMESTAMPTZ,
  rejection_reason  TEXT,
  -- Fase 2: dados extraídos por OCR
  ocr_data          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_pending ON documents(verification) WHERE verification = 'PENDING';
CREATE INDEX idx_documents_expiring ON documents(expires_at) WHERE expires_at IS NOT NULL;

-- =============================================================================
-- NOTIFICAÇÕES
-- =============================================================================

CREATE TABLE notifications (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type              TEXT NOT NULL,
  title             TEXT NOT NULL,
  body              TEXT,
  action_url        TEXT,
  metadata          JSONB,
  read_at           TIMESTAMPTZ,
  -- Canais por onde foi enviada
  sent_push         BOOLEAN NOT NULL DEFAULT FALSE,
  sent_email        BOOLEAN NOT NULL DEFAULT FALSE,
  sent_sms          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

-- =============================================================================
-- AUDITORIA
-- =============================================================================

CREATE TABLE audit_logs (
  id                BIGSERIAL PRIMARY KEY,
  tenant_id         UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  action            TEXT NOT NULL,
  entity_type       TEXT NOT NULL,
  entity_id         UUID,
  before_state      JSONB,
  after_state       JSONB,
  ip_address        INET,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
-- Princípio: o isolamento entre empresas é garantido pela base de dados, não
-- pelo código da aplicação. Se uma consulta esquecer o filtro, a BD filtra.

ALTER TABLE tenants   ENABLE ROW LEVEL SECURITY;
ALTER TABLE users     ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE loads     ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips     ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Função auxiliar: tenant do utilizador autenticado
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
  SELECT tenant_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_platform_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_user_id = auth.uid() AND role = 'PLATFORM_ADMIN'
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Dados operacionais: isolados por empresa
CREATE POLICY vehicles_tenant_isolation ON vehicles
  FOR ALL USING (tenant_id = current_tenant_id() OR is_platform_admin());

CREATE POLICY documents_tenant_isolation ON documents
  FOR ALL USING (tenant_id = current_tenant_id() OR is_platform_admin());

-- Marketplace: cargas publicadas são visíveis a todos os utilizadores
-- verificados (é essa a finalidade); alterações só pelo dono.
CREATE POLICY loads_marketplace_read ON loads
  FOR SELECT USING (
    status = 'PUBLISHED'
    OR tenant_id = current_tenant_id()
    OR is_platform_admin()
  );

CREATE POLICY loads_owner_write ON loads
  FOR ALL USING (tenant_id = current_tenant_id() OR is_platform_admin());

CREATE POLICY trips_marketplace_read ON trips
  FOR SELECT USING (
    status IN ('PUBLISHED', 'PARTIALLY_BOOKED')
    OR tenant_id = current_tenant_id()
    OR is_platform_admin()
  );

CREATE POLICY trips_owner_write ON trips
  FOR ALL USING (tenant_id = current_tenant_id() OR is_platform_admin());

-- Mensagens: só participantes da conversa
CREATE POLICY messages_participants_only ON messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      JOIN users u ON u.id = cp.user_id
      WHERE cp.conversation_id = messages.conversation_id
        AND u.auth_user_id = auth.uid()
    )
    OR is_platform_admin()
  );

-- Notificações: só o próprio
CREATE POLICY notifications_own_only ON notifications
  FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- =============================================================================
-- GATILHOS
-- =============================================================================

-- updated_at automático
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_loads_updated BEFORE UPDATE ON loads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_trips_updated BEFORE UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Recalcular reputação após nova avaliação
CREATE OR REPLACE FUNCTION recalculate_user_rating() RETURNS TRIGGER AS $$
BEGIN
  UPDATE users SET
    rating_average = (SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews WHERE reviewed_id = NEW.reviewed_id),
    rating_count   = (SELECT COUNT(*) FROM reviews WHERE reviewed_id = NEW.reviewed_id)
  WHERE id = NEW.reviewed_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reviews_recalculate AFTER INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION recalculate_user_rating();

-- =============================================================================
-- TABELAS DE FASES POSTERIORES (não criadas agora)
-- =============================================================================
-- FASE 2 — Pagamentos e faturação:
--   wallets, wallet_transactions, payments, payment_methods, escrow_holds,
--   invoices, invoice_lines, credit_notes, refunds, platform_fees
--
-- FASE 2 — Compliance:
--   kyc_verifications, kyb_verifications, sanction_screenings, disputes
--
-- FASE 3 — Gestão de frota:
--   maintenance_records, fuel_logs, tyre_records, vehicle_costs, incidents
--
-- FASE 3 — Inteligência:
--   price_history, demand_forecasts, route_optimizations, fraud_signals
--
-- FASE 4 — IoT e telemática:
--   devices, telemetry_readings (série temporal), temperature_alerts,
--   tachograph_records, obd_diagnostics
-- =============================================================================
