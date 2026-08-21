-- ===========================================================================
-- Activar RLS nas 9 tabelas que o repositório reconstruía abertas
--
-- O QUE ESTA MIGRAÇÃO CORRIGE
--
-- Produção tem RLS nas 31 tabelas. O repositório activava-a em 20 de 29. As
-- nove abaixo reconstruíam-se **sem Row Level Security**, e numa tabela sem RLS
-- as políticas são decorativas: mandam os GRANT, e os GRANT dão tudo a
-- `anon`, `authenticated` e `service_role`.
--
-- Cinco delas — conversations, conversation_participants, load_attachments,
-- proof_of_delivery, reviews — já tinham as três políticas RESTRICTIVE
-- `*_bloqueio_*` criadas pelo P0. Com a RLS desligada, essas barreiras não
-- faziam nada. Lê-se o catálogo, vê-se a barreira, e ela não existe. É pior do
-- que não a ter, porque induz confiança.
--
-- Medido na FASE 9, com dados reais dos dois lados: a empresa A lia o rastreio
-- da empresa B, e um chamador anónimo lia avaliações, localidades e eventos de
-- rastreio.
--
-- EFEITO EM PRODUÇÃO: NENHUM
--
-- As nove tabelas já têm RLS activa e estas políticas já existem lá, com esta
-- definição exacta. Esta migração é para o repositório passar a reconstruir o
-- que a produção tem. Aplicá-la à produção é uma operação vazia — e é assim
-- que deve ser.
--
-- AS POLÍTICAS NÃO FORAM INVENTADAS
--
-- Cada `USING` e cada `WITH CHECK` abaixo é cópia literal do catálogo da
-- produção, extraída a 21/08/2026. Onde a produção tem uma regra que a
-- auditoria considerou fraca, ela é reproduzida como está e assinalada em
-- comentário — corrigir é uma decisão separada, e misturá-la com esta tornaria
-- impossível dizer o que mudou.
--
-- ORDEM: políticas primeiro, RLS depois
--
-- Activar RLS numa tabela sem política permissiva tranca-a por completo. Como
-- a migração corre em transação, não há janela visível; mesmo assim a ordem
-- está escrita à prova de quem venha a executar isto por partes.
--
-- IDEMPOTÊNCIA sem janela aberta
--
-- Não se usa `DROP POLICY IF EXISTS` + `CREATE`: numa base em serviço isso
-- remove momentaneamente uma protecção activa. Usa-se uma guarda que só cria
-- quando não existe. O PostgreSQL não tem `CREATE OR REPLACE POLICY`.
-- ===========================================================================

DO $rls$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT * FROM (VALUES
      -- tabela, política, comando, USING, WITH CHECK
      ('audit_logs', 'audit_admin_read', 'SELECT',
       'is_platform_admin()', NULL),

      ('conversations', 'conversations_participants', 'SELECT',
       '(EXISTS (SELECT 1 FROM conversation_participants cp
                  WHERE cp.conversation_id = conversations.id
                    AND cp.user_id = current_app_user_id())) OR is_platform_admin()', NULL),

      ('conversation_participants', 'conv_participants_own', 'ALL',
       '(user_id = current_app_user_id()) OR is_platform_admin()', NULL),

      -- NOTA: a condição é apenas «a carga existe». Não menciona empresa
      -- nenhuma, e fica dependente da RLS de `loads` aplicada à subconsulta.
      -- É a regra que está em produção. Assinalada como P2-4 em
      -- SECURITY-MODEL-TARGET.md; não é corrigida aqui.
      ('load_attachments', 'load_attachments_follow_load', 'ALL',
       'EXISTS (SELECT 1 FROM loads l WHERE l.id = load_attachments.load_id)', NULL),

      ('locations', 'locations_read', 'SELECT',
       'auth.uid() IS NOT NULL', NULL),
      -- NOTA: qualquer autenticado insere localidades (P2-5). Como em produção.
      ('locations', 'locations_insert', 'INSERT',
       NULL, 'auth.uid() IS NOT NULL'),

      ('matches', 'matches_parties', 'SELECT',
       '(EXISTS (SELECT 1 FROM loads l
                  WHERE l.id = matches.load_id AND l.tenant_id = current_tenant_id()))
        OR (EXISTS (SELECT 1 FROM trips t
                     WHERE t.id = matches.trip_id AND t.tenant_id = current_tenant_id()))
        OR is_platform_admin()', NULL),

      ('proof_of_delivery', 'pod_parties', 'ALL',
       '(delivered_by = current_app_user_id())
        OR (EXISTS (SELECT 1 FROM loads l
                     WHERE l.id = proof_of_delivery.load_id
                       AND l.tenant_id = current_tenant_id()))
        OR (EXISTS (SELECT 1 FROM loads l JOIN trips t ON t.id = l.assigned_trip_id
                     WHERE l.id = proof_of_delivery.load_id
                       AND t.tenant_id = current_tenant_id()))
        OR is_platform_admin()', NULL),

      -- NOTA: reputação legível por qualquer autenticado. Desenho da produção;
      -- confirmar (P3) que é intencional.
      ('reviews', 'reviews_read', 'SELECT',
       'auth.uid() IS NOT NULL', NULL),
      ('reviews', 'reviews_insert', 'INSERT',
       NULL, 'reviewer_id = current_app_user_id()'),

      ('tracking_events', 'tracking_events_parties', 'SELECT',
       '(EXISTS (SELECT 1 FROM loads l
                  WHERE l.id = tracking_events.load_id
                    AND l.tenant_id = current_tenant_id()))
        OR (EXISTS (SELECT 1 FROM loads l JOIN trips t ON t.id = l.assigned_trip_id
                     WHERE l.id = tracking_events.load_id
                       AND t.tenant_id = current_tenant_id()))
        OR is_platform_admin()', NULL),
      ('tracking_events', 'tracking_events_insert', 'INSERT',
       NULL, 'created_by = current_app_user_id()')
    ) AS v(tabela, politica, cmd, usar, verificar)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = p.tabela AND policyname = p.politica
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR %s TO public %s %s',
        p.politica, p.tabela, p.cmd,
        CASE WHEN p.usar      IS NULL THEN '' ELSE 'USING (' || p.usar || ')' END,
        CASE WHEN p.verificar IS NULL THEN '' ELSE 'WITH CHECK (' || p.verificar || ')' END
      );
      RAISE NOTICE 'criada política %.%', p.tabela, p.politica;
    END IF;
  END LOOP;
END $rls$;

-- --------------------------------------------------------------------------
-- Só agora se liga a RLS. `ENABLE ROW LEVEL SECURITY` é idempotente.
-- --------------------------------------------------------------------------
ALTER TABLE public.audit_logs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.load_attachments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proof_of_delivery         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_events           ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- Verificação estrutural, sem lista de nomes.
--
-- Duas condições, e as duas têm de valer para todas as tabelas de `public`:
--   · RLS activada;
--   · nenhuma tabela com RLS fica só com políticas RESTRICTIVE, porque
--     RESTRICTIVE faz AND e sozinha nega tudo.
--
-- A segunda ainda não vale para `offers` e `agreements` — é o P1-1, tratado
-- noutra migração. Por isso a verificação nomeia-as como excepção conhecida:
-- se aparecer uma terceira, a migração falha.
-- --------------------------------------------------------------------------
DO $verificar$
DECLARE v_sem_rls text; v_nega_tudo text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_sem_rls
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND NOT c.relrowsecurity AND c.relname <> 'spatial_ref_sys';

  IF v_sem_rls IS NOT NULL THEN
    RAISE EXCEPTION 'Tabelas sem RLS depois desta migração: %', v_sem_rls;
  END IF;

  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_nega_tudo
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
    AND c.relname NOT IN ('offers', 'agreements')
    AND EXISTS (SELECT 1 FROM pg_policies q
                WHERE q.schemaname = 'public' AND q.tablename = c.relname)
    AND NOT EXISTS (SELECT 1 FROM pg_policies q
                    WHERE q.schemaname = 'public' AND q.tablename = c.relname
                      AND q.permissive = 'PERMISSIVE');

  IF v_nega_tudo IS NOT NULL THEN
    RAISE EXCEPTION 'Tabelas com RLS e só políticas RESTRICTIVE (negam tudo): %', v_nega_tudo;
  END IF;

  RAISE NOTICE 'RLS activa em todas as tabelas de public.';
END $verificar$;
