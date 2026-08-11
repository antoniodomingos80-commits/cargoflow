-- =============================================================================
-- CargoFlow · Ativar/normalizar RLS (núcleo + pagamentos)
-- Esta versão evita referências a colunas inexistentes.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT u.tenant_id
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
    AND u.is_active = TRUE
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT u.id
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
    AND u.is_active = TRUE
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.role = 'PLATFORM_ADMIN'
      AND u.is_active = TRUE
  );
$$;

ALTER TABLE IF EXISTS public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payments ENABLE ROW LEVEL SECURITY;

-- Tenants
DROP POLICY IF EXISTS tenants_select_own_or_admin ON public.tenants;
CREATE POLICY tenants_select_own_or_admin
ON public.tenants FOR SELECT
USING (id = public.current_tenant_id() OR public.is_platform_admin());

DROP POLICY IF EXISTS tenants_update_own_or_admin ON public.tenants;
CREATE POLICY tenants_update_own_or_admin
ON public.tenants FOR UPDATE
USING (id = public.current_tenant_id() OR public.is_platform_admin())
WITH CHECK (id = public.current_tenant_id() OR public.is_platform_admin());

-- Users
DROP POLICY IF EXISTS users_select_tenant_or_self_or_admin ON public.users;
CREATE POLICY users_select_tenant_or_self_or_admin
ON public.users FOR SELECT
USING (
  id = public.current_user_id()
  OR tenant_id = public.current_tenant_id()
  OR public.is_platform_admin()
);

DROP POLICY IF EXISTS users_update_self_or_admin ON public.users;
CREATE POLICY users_update_self_or_admin
ON public.users FOR UPDATE
USING (
  id = public.current_user_id()
  OR public.is_platform_admin()
)
WITH CHECK (
  id = public.current_user_id()
  OR public.is_platform_admin()
);

-- Vehicles
DROP POLICY IF EXISTS vehicles_tenant_isolation ON public.vehicles;
CREATE POLICY vehicles_tenant_isolation
ON public.vehicles FOR ALL
USING (tenant_id = public.current_tenant_id() OR public.is_platform_admin())
WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_platform_admin());

-- Drivers
DROP POLICY IF EXISTS drivers_tenant_isolation ON public.drivers;
CREATE POLICY drivers_tenant_isolation
ON public.drivers FOR ALL
USING (tenant_id = public.current_tenant_id() OR public.is_platform_admin())
WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_platform_admin());

-- Loads
DROP POLICY IF EXISTS loads_marketplace_read ON public.loads;
CREATE POLICY loads_marketplace_read
ON public.loads FOR SELECT
USING (
  status = 'PUBLISHED'
  OR tenant_id = public.current_tenant_id()
  OR public.is_platform_admin()
);

DROP POLICY IF EXISTS loads_owner_write ON public.loads;
CREATE POLICY loads_owner_write
ON public.loads FOR ALL
USING (tenant_id = public.current_tenant_id() OR public.is_platform_admin())
WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_platform_admin());

-- Trips
DROP POLICY IF EXISTS trips_marketplace_read ON public.trips;
CREATE POLICY trips_marketplace_read
ON public.trips FOR SELECT
USING (
  status IN ('PUBLISHED', 'PARTIALLY_BOOKED')
  OR tenant_id = public.current_tenant_id()
  OR public.is_platform_admin()
);

DROP POLICY IF EXISTS trips_owner_write ON public.trips;
CREATE POLICY trips_owner_write
ON public.trips FOR ALL
USING (tenant_id = public.current_tenant_id() OR public.is_platform_admin())
WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_platform_admin());

-- Documents
DROP POLICY IF EXISTS documents_tenant_isolation ON public.documents;
CREATE POLICY documents_tenant_isolation
ON public.documents FOR ALL
USING (tenant_id = public.current_tenant_id() OR public.is_platform_admin())
WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_platform_admin());

-- Messages (participantes da conversa)
DROP POLICY IF EXISTS messages_participants_only ON public.messages;
CREATE POLICY messages_participants_only
ON public.messages FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    JOIN public.users u ON u.id = cp.user_id
    WHERE cp.conversation_id = messages.conversation_id
      AND u.auth_user_id = auth.uid()
  )
  OR public.is_platform_admin()
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    JOIN public.users u ON u.id = cp.user_id
    WHERE cp.conversation_id = messages.conversation_id
      AND u.auth_user_id = auth.uid()
  )
  OR public.is_platform_admin()
);

-- Notifications
DROP POLICY IF EXISTS notifications_own_only ON public.notifications;
CREATE POLICY notifications_own_only
ON public.notifications FOR ALL
USING (
  user_id = public.current_user_id()
  OR public.is_platform_admin()
)
WITH CHECK (
  user_id = public.current_user_id()
  OR public.is_platform_admin()
);

-- Payments
DROP POLICY IF EXISTS payments_select_own_tenant ON public.payments;
CREATE POLICY payments_select_own_tenant
ON public.payments FOR SELECT
USING (
  tenant_id = public.current_tenant_id()
  OR public.is_platform_admin()
);

DROP POLICY IF EXISTS payments_insert_own_tenant ON public.payments;
CREATE POLICY payments_insert_own_tenant
ON public.payments FOR INSERT
WITH CHECK (
  tenant_id = public.current_tenant_id()
  OR public.is_platform_admin()
);

DROP POLICY IF EXISTS payments_update_platform_admin ON public.payments;
CREATE POLICY payments_update_platform_admin
ON public.payments FOR UPDATE
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());
