-- ===========================================================================
-- P1 — Blindagem dos campos administrativos
--
-- PORQUÊ
--
-- O RLS destas tabelas isola LINHAS, não COLUNAS. As políticas de UPDATE
-- (`users_update_own`, `documents_tenant`, `vehicles_tenant`, `tenants_update`)
-- deixam o utilizador escrever na sua própria linha — e não havia nada a
-- impedi-lo de escrever nas colunas que decidem o seu papel, o seu estado de
-- verificação, o seu bloqueio ou a sua pontuação de confiança.
--
-- Provado a 21/08/2026 na base de dados real, em transação revertida, com uma
-- conta MERCHANT comum a chamar directamente o PostgREST:
--
--   UPDATE users SET role='PLATFORM_ADMIN' WHERE id = <a própria>;   → aceite
--   UPDATE users SET trust_score=100, verification='APPROVED'        → aceite
--   UPDATE documents SET verification='APPROVED' WHERE tenant_id=…   → aceite
--   UPDATE tenants  SET verification='APPROVED' WHERE id=…           → aceite
--   SELECT is_platform_admin()                                       → true
--
-- A escalada de papel é a chave-mestra: `is_platform_admin()` lê `users.role`,
-- por isso quem se promove ganha as políticas `*_admin_only` e passa a poder
-- apagar o próprio registo em `user_blocklist` — contornando a última defesa
-- do P0.
--
-- COMO
--
-- Um gatilho BEFORE INSERT/UPDATE que compara o antes e o depois e recusa
-- qualquer alteração a uma coluna administrativa vinda de uma escrita não
-- privilegiada. Não mexe no RLS existente, em `pode_operar()`, nas políticas
-- RESTRICTIVE do P0, nas RPCs `cf_*` nem em `garantirContaAtiva()`.
--
-- Escrita privilegiada = `service_role` (chave de servidor), `postgres`
-- (migrações), o dono de qualquer função SECURITY DEFINER (as `cf_*`, o
-- gatilho de registo, o recálculo de avaliações), ou um administrador de
-- plataforma autenticado. Tudo o resto — ou seja, o browser — é recusado.
--
-- Acresce a regra de que ninguém decide sobre si próprio, mesmo sendo
-- administrador.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Quem pode tocar em campos administrativos
--
-- SECURITY INVOKER de propósito: precisamos que `current_user` reflicta quem
-- está mesmo a escrever. Numa função SECURITY DEFINER `current_user` passaria
-- a ser o dono e a verificação daria sempre verdadeira.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.escrita_administrativa_permitida()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT current_user NOT IN ('authenticated', 'anon')
      OR public.is_platform_admin();
$$;

COMMENT ON FUNCTION public.escrita_administrativa_permitida() IS
  'Verdadeiro quando a escrita não vem directamente do browser, ou vem de um administrador de plataforma autenticado.';

-- ---------------------------------------------------------------------------
-- O gatilho
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cf_proteger_campos_administrativos()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_protegidas   TEXT[];
  v_antes        JSONB;
  v_depois       JSONB;
  v_alteradas    TEXT[] := '{}';
  v_privilegiado BOOLEAN := public.escrita_administrativa_permitida();
  c              TEXT;
BEGIN
  IF TG_TABLE_NAME = 'users' THEN
    v_protegidas := ARRAY[
      'role', 'tenant_id', 'auth_user_id',
      'verification', 'verification_status', 'verified_at', 'verified_by',
      'verification_date', 'rejected_at', 'rejection_reason',
      'trust_score', 'rating_average', 'rating_count', 'completion_rate',
      'is_blocked', 'blocked_at', 'blocked_reason',
      'banned', 'ban_reason', 'banned_at',
      'is_active', 'deleted_at'
    ];
  ELSIF TG_TABLE_NAME = 'documents' THEN
    v_protegidas := ARRAY['tenant_id', 'verification', 'verified_by', 'verified_at', 'rejection_reason'];
  ELSIF TG_TABLE_NAME = 'vehicles' THEN
    v_protegidas := ARRAY['tenant_id', 'verification'];
  ELSIF TG_TABLE_NAME = 'tenants' THEN
    v_protegidas := ARRAY['verification', 'is_active'];
  ELSIF TG_TABLE_NAME = 'drivers' THEN
    v_protegidas := ARRAY['tenant_id', 'verification', 'trust_score'];
  ELSE
    RETURN NEW;
  END IF;

  v_depois := to_jsonb(NEW);

  -- Numa criação só interessa o estado inicial: nada nasce aprovado.
  IF TG_OP = 'INSERT' THEN
    IF NOT v_privilegiado
       AND jsonb_exists(v_depois, 'verification')
       AND COALESCE(v_depois->>'verification', 'PENDING') <> 'PENDING' THEN
      RAISE EXCEPTION
        'Um registo novo em % não pode ser criado já verificado.', TG_TABLE_NAME
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  v_antes := to_jsonb(OLD);

  FOREACH c IN ARRAY v_protegidas LOOP
    IF v_antes -> c IS DISTINCT FROM v_depois -> c THEN
      v_alteradas := v_alteradas || c;
    END IF;
  END LOOP;

  IF array_length(v_alteradas, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT v_privilegiado THEN
    RAISE EXCEPTION
      'Campo administrativo protegido em %: %. Só a plataforma pode alterar este estado.',
      TG_TABLE_NAME, array_to_string(v_alteradas, ', ')
      USING ERRCODE = '42501';
  END IF;

  -- Mesmo com privilégio: ninguém decide sobre si próprio.
  IF TG_TABLE_NAME = 'users'
     AND NEW.id = public.current_app_user_id()
     AND v_alteradas && ARRAY['role', 'verification', 'trust_score', 'is_blocked', 'banned', 'is_active'] THEN
    RAISE EXCEPTION
      'Um administrador não pode alterar o seu próprio papel, verificação, bloqueio ou pontuação.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_TABLE_NAME IN ('documents', 'vehicles')
     AND NEW.tenant_id = public.current_tenant_id()
     AND 'verification' = ANY (v_alteradas) THEN
    RAISE EXCEPTION
      'Não é permitido decidir sobre documentos ou veículos da própria empresa.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_TABLE_NAME = 'tenants'
     AND NEW.id = public.current_tenant_id()
     AND 'verification' = ANY (v_alteradas) THEN
    RAISE EXCEPTION
      'Não é permitido verificar a própria empresa.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.cf_proteger_campos_administrativos() IS
  'Recusa alterações a colunas administrativas vindas do browser, e impede qualquer actor de decidir sobre si próprio.';

-- ---------------------------------------------------------------------------
-- Ligar às tabelas
--
-- Nome com prefixo `zz_` para correr depois de `trg_*_updated` (a ordem dos
-- gatilhos é alfabética): assim o `updated_at` já está posto quando comparamos.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS zz_proteger_campos_admin ON public.users;
CREATE TRIGGER zz_proteger_campos_admin
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.cf_proteger_campos_administrativos();

DROP TRIGGER IF EXISTS zz_proteger_campos_admin ON public.documents;
CREATE TRIGGER zz_proteger_campos_admin
  BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.cf_proteger_campos_administrativos();

DROP TRIGGER IF EXISTS zz_proteger_campos_admin ON public.vehicles;
CREATE TRIGGER zz_proteger_campos_admin
  BEFORE INSERT OR UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.cf_proteger_campos_administrativos();

DROP TRIGGER IF EXISTS zz_proteger_campos_admin ON public.tenants;
CREATE TRIGGER zz_proteger_campos_admin
  BEFORE INSERT OR UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.cf_proteger_campos_administrativos();

DROP TRIGGER IF EXISTS zz_proteger_campos_admin ON public.drivers;
CREATE TRIGGER zz_proteger_campos_admin
  BEFORE INSERT OR UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.cf_proteger_campos_administrativos();

-- ---------------------------------------------------------------------------
-- Isolamento do balde `cargas`
--
-- A política de leitura era `bucket_id = 'cargas'` e mais nada: qualquer conta
-- autenticada podia assinar um URL de uma fotografia de outra empresa. As
-- políticas irmãs (`documentos_ler`, `provas_ler`) já filtravam por empresa;
-- esta ficou para trás.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS cargas_ler ON storage.objects;
CREATE POLICY cargas_ler ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'cargas'
    AND (
      (storage.foldername(name))[1] = (public.current_tenant_id())::text
      OR public.is_platform_admin()
    )
  );
