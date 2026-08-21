-- ===========================================================================
-- Funções auxiliares partilhadas
--
-- Dez funções que quase tudo o resto chama: resolução de identidade, geração
-- de referências, cálculo de distâncias, criação de partições e os gatilhos de
-- preparação de cargas e viagens.
--
-- Extraídas da produção com `pg_get_functiondef(oid)` e coladas aqui
-- LITERALMENTE, como as irmãs de `20260821_versionar_funcoes_rastreio.sql`.
-- Nada foi corrigido nem reformatado.
--
-- PORQUE ESTÃO NUM FICHEIRO PRÓPRIO, E CEDO
--
-- Estavam dentro da migração de rastreio, que ordena depois de
-- `20260821_p1_trust_compliance.sql` — e essa precisa de
-- `current_app_user_id()`. Numa base vazia rebentava com
--
--   ERROR: function public.current_app_user_id() does not exist
--
-- O prefixo de data não resolve sozinho: dentro do mesmo dia a ordem é
-- alfabética, e "p1" vem antes de "versionar". A solução não é renomear ao
-- acaso — é reconhecer que estas dez são fundação e pô-las onde a fundação
-- pertence.
--
-- Todas usam `CREATE OR REPLACE`: sem efeito numa base que já as tenha.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.unaccent_simples(texto text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT translate(
    texto,
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.gerar_referencia(prefixo text, seq_nome text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  proximo BIGINT;
BEGIN
  EXECUTE format('SELECT nextval(%L)', seq_nome) INTO proximo;
  RETURN prefixo || '-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' ||
         lpad(proximo::TEXT, 6, '0');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.current_app_user_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id FROM users WHERE auth_user_id = auth.uid() LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.is_verified_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_user_id = auth.uid() AND is_active AND verification = 'APPROVED'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.calcular_distancia_km(origem uuid, destino uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  metros NUMERIC;
BEGIN
  SELECT ST_Distance(o.coordinates, d.coordinates)
    INTO metros
    FROM locations o, locations d
   WHERE o.id = origem AND d.id = destino;

  IF metros IS NULL THEN RETURN NULL; END IF;
  RETURN ROUND((metros / 1000 * 1.25)::numeric, 1);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.criar_particao_tracking(ano integer, mes integer)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  nome   TEXT := format('tracking_points_%s_%s', ano, lpad(mes::text, 2, '0'));
  inicio DATE := make_date(ano, mes, 1);
  fim    DATE := (make_date(ano, mes, 1) + INTERVAL '1 month')::date;
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF tracking_points FOR VALUES FROM (%L) TO (%L)',
    nome, inicio, fim);
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', nome);
  EXECUTE format($f$
    CREATE POLICY %I ON %I FOR SELECT USING (
      EXISTS (SELECT 1 FROM trips t WHERE t.id = trip_id AND t.tenant_id = current_tenant_id())
      OR EXISTS (SELECT 1 FROM loads l WHERE l.assigned_trip_id = trip_id AND l.tenant_id = current_tenant_id())
      OR is_platform_admin()
    )$f$, nome || '_read', nome);
  EXECUTE format($f$
    CREATE POLICY %I ON %I FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM trips t WHERE t.id = trip_id AND t.tenant_id = current_tenant_id())
    )$f$, nome || '_insert', nome);
END $function$
;

CREATE OR REPLACE FUNCTION public.recalculate_user_rating()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE users SET
    rating_average = (SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews WHERE reviewed_id = NEW.reviewed_id),
    rating_count   = (SELECT COUNT(*) FROM reviews WHERE reviewed_id = NEW.reviewed_id)
  WHERE id = NEW.reviewed_id;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.preparar_carga()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.reference IS NULL OR NEW.reference = '' THEN
    NEW.reference := gerar_referencia('CF', 'seq_load_reference');
  END IF;

  IF NEW.distance_km IS NULL
     OR TG_OP = 'INSERT'
     OR NEW.origin_id IS DISTINCT FROM OLD.origin_id
     OR NEW.destination_id IS DISTINCT FROM OLD.destination_id THEN
    NEW.distance_km := calcular_distancia_km(NEW.origin_id, NEW.destination_id);
  END IF;

  -- Marca o momento da publicação na transição para PUBLISHED
  IF NEW.status = 'PUBLISHED' AND NEW.published_at IS NULL THEN
    NEW.published_at := NOW();
    -- Cargas expiram automaticamente após a janela de recolha
    IF NEW.expires_at IS NULL THEN
      NEW.expires_at := NEW.pickup_until + INTERVAL '2 days';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.preparar_viagem()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.reference IS NULL OR NEW.reference = '' THEN
    NEW.reference := gerar_referencia('VG', 'seq_trip_reference');
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_meta        JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_full_name   TEXT  := NULLIF(TRIM(v_meta->>'full_name'), '');
  v_role_txt    TEXT  := COALESCE(NULLIF(v_meta->>'role', ''), 'MERCHANT');
  v_role        user_role;
  v_company     TEXT  := NULLIF(TRIM(v_meta->>'company_name'), '');
  v_tax_id      TEXT  := NULLIF(TRIM(v_meta->>'tax_id'), '');
  v_phone       TEXT  := NULLIF(TRIM(v_meta->>'phone'), '');
  v_is_company  BOOLEAN;
  v_tenant_name TEXT;
  v_slug        TEXT;
  v_tenant_id   UUID;
BEGIN
  -- Papel: só se aceitam os três de auto-registo. PLATFORM_ADMIN e
  -- COMPANY_STAFF são atribuídos manualmente — nunca por escolha do próprio.
  IF v_role_txt NOT IN ('MERCHANT', 'CARRIER', 'COMPANY_ADMIN') THEN
    v_role_txt := 'MERCHANT';
  END IF;
  v_role := v_role_txt::user_role;

  v_full_name  := COALESCE(v_full_name, split_part(NEW.email, '@', 1));
  v_is_company := (v_role = 'COMPANY_ADMIN');
  v_tenant_name := COALESCE(v_company, v_full_name);

  -- Slug único e legível
  v_slug := regexp_replace(
              lower(unaccent_simples(v_tenant_name)),
              '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  v_slug := left(NULLIF(v_slug, ''), 40);
  v_slug := COALESCE(v_slug, 'conta') || '-' || substr(replace(NEW.id::text, '-', ''), 1, 8);

  INSERT INTO tenants (name, slug, tax_id, type, country_code, default_currency, verification)
  VALUES (
    v_tenant_name, v_slug, v_tax_id,
    CASE WHEN v_is_company THEN 'COMPANY' ELSE 'INDIVIDUAL' END,
    'AO', 'AOA', 'PENDING'
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO users (tenant_id, auth_user_id, email, phone, full_name, role, verification)
  VALUES (v_tenant_id, NEW.id, NEW.email, v_phone, v_full_name, v_role, 'PENDING');

  RETURN NEW;
END;
$function$
;
