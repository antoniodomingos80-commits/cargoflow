-- ===========================================================================
-- Versionar a tabela `shipment_photos`
--
-- Existe em produção desde sempre, com dados, e não tinha `CREATE TABLE` em
-- nenhum ficheiro do repositório — nem nas migrações, nem no documento de
-- referência `04-MODELO-DE-DADOS.sql`. É lida e escrita por três funções de
-- `lib/entrega/actions.ts` (as fotografias de recolha e entrega).
--
-- Extraída do catálogo da produção a 21/08/2026: colunas, tipos, valores por
-- omissão, chaves, restrições, índices, RLS e política. Não tem gatilhos.
--
-- Escrita para ser idempotente: aplicar isto a uma base que já a tem não faz
-- nada. Os dados existentes não são tocados.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.shipment_photos (
  id          UUID        NOT NULL DEFAULT uuid_generate_v4(),
  load_id     UUID        NOT NULL,
  stage       TEXT        NOT NULL,
  uploaded_by UUID        NOT NULL,
  tenant_id   UUID        NOT NULL,
  path        TEXT        NOT NULL,
  caption     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shipment_photos_pkey PRIMARY KEY (id)
);

-- Restrições. Em blocos condicionais porque `ADD CONSTRAINT` não aceita
-- `IF NOT EXISTS` e esta migração tem de poder correr sobre a base actual.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shipment_photos_load_id_fkey') THEN
    ALTER TABLE public.shipment_photos
      ADD CONSTRAINT shipment_photos_load_id_fkey
      FOREIGN KEY (load_id) REFERENCES loads(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shipment_photos_tenant_id_fkey') THEN
    ALTER TABLE public.shipment_photos
      ADD CONSTRAINT shipment_photos_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shipment_photos_uploaded_by_fkey') THEN
    ALTER TABLE public.shipment_photos
      ADD CONSTRAINT shipment_photos_uploaded_by_fkey
      FOREIGN KEY (uploaded_by) REFERENCES users(id);
  END IF;

  -- A fotografia é do momento da recolha ou do momento da entrega. Não há
  -- terceiro estado, e a restrição impede que apareça um.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shipment_photos_stage_check') THEN
    ALTER TABLE public.shipment_photos
      ADD CONSTRAINT shipment_photos_stage_check
      CHECK (stage = ANY (ARRAY['PICKUP'::text, 'DELIVERY'::text]));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_shipment_photos_load
  ON public.shipment_photos USING btree (load_id);

ALTER TABLE public.shipment_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shipment_photos_tenant ON public.shipment_photos;
CREATE POLICY shipment_photos_tenant ON public.shipment_photos
  FOR ALL
  USING      ((tenant_id = current_tenant_id()) OR is_platform_admin())
  WITH CHECK ((tenant_id = current_tenant_id()) OR is_platform_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipment_photos TO authenticated, service_role;

COMMENT ON TABLE public.shipment_photos IS
  'Fotografias da operação, por fase (PICKUP/DELIVERY). Ficheiros no balde privado provas-entrega; aqui guarda-se só o caminho.';


-- ===========================================================================
-- O QUE SE ENCONTROU — documentado, não corrigido
-- ===========================================================================
--
-- 1. NÃO TEM A BARREIRA RESTRICTIVE DO P0
--
--    As 12 tabelas cobertas pela migração `20260819_p0_bloqueio_operacional`
--    têm políticas RESTRICTIVE que exigem `pode_operar()` no insert, update e
--    delete. `shipment_photos` não estava nessa lista — provavelmente porque
--    ninguém sabia que existia, já que não havia SQL dela em lado nenhum.
--
--    Consequência: uma conta bloqueada continua a poder carregar e apagar
--    fotografias da operação. É uma escrita menor e a única via de chamada
--    passa por `exigirParticipante()`, mas é uma inconsistência real com o
--    princípio do P0 — «o bloqueio é enforced no servidor».
--
-- 2. AS FUNÇÕES DA APLICAÇÃO NÃO CHAMAM `garantirContaAtiva`
--
--    `carregarFotoOperacao` e `removerFotoOperacao` verificam participação na
--    carga, mas não o bloqueio da conta. Mesmo tema do ponto anterior, do lado
--    do código.
--
-- 3. OS FICHEIROS VIVEM NO BALDE `provas-entrega`
--
--    A coluna `path` guarda o caminho; o ficheiro está no balde privado, cuja
--    política `provas_ler` já filtra por empresa e permite ao dono da carga
--    ver as provas da sua operação. Essa política está versionada em
--    `20260811_storage_rls.sql` e não é tocada aqui.
