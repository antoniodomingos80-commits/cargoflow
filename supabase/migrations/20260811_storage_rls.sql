-- =============================================================================
-- CargoFlow · RLS no Storage
-- Protege documentos, provas de entrega e anexos por tenant.
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

CREATE OR REPLACE FUNCTION public.storage_object_belongs_to_current_tenant(object_name text)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT split_part(object_name, '/', 1) = public.current_tenant_id()::text;
$$;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS storage_objects_select_private_buckets ON storage.objects;
CREATE POLICY storage_objects_select_private_buckets
ON storage.objects FOR SELECT
USING (
  bucket_id IN ('documentos', 'provas-entrega', 'cargas')
  AND (
    public.storage_object_belongs_to_current_tenant(name)
    OR public.is_platform_admin()
  )
);

DROP POLICY IF EXISTS storage_objects_insert_private_buckets ON storage.objects;
CREATE POLICY storage_objects_insert_private_buckets
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id IN ('documentos', 'provas-entrega', 'cargas')
  AND (
    public.storage_object_belongs_to_current_tenant(name)
    OR public.is_platform_admin()
  )
);

DROP POLICY IF EXISTS storage_objects_delete_private_buckets ON storage.objects;
CREATE POLICY storage_objects_delete_private_buckets
ON storage.objects FOR DELETE
USING (
  bucket_id IN ('documentos', 'provas-entrega', 'cargas')
  AND (
    public.storage_object_belongs_to_current_tenant(name)
    OR public.is_platform_admin()
  )
);