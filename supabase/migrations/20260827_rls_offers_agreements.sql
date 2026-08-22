-- ===========================================================================
-- `offers` e `agreements`: dar-lhes as políticas PERMISSIVE que faltavam
--
-- O QUE ESTAVA ERRADO
--
-- As duas tabelas tinham RLS activada e **só** políticas RESTRICTIVE — as três
-- `*_bloqueio_*` do P0. Em PostgreSQL, RESTRICTIVE combina com AND e PERMISSIVE
-- com OR. Sem uma única PERMISSIVE não há nada com que fazer OR, e o resultado
-- é negar tudo a toda a gente.
--
-- Medido na FASE 9, com dados reais: o utilizador B via **0 das suas 3 próprias
-- propostas**. Não é uma falha de segurança — é o contrário. Uma base
-- reconstruída a partir do repositório teria o mercado inteiro invisível,
-- inclusive aos donos das propostas.
--
-- O QUE ESTA MIGRAÇÃO FAZ
--
-- Acrescenta as quatro políticas PERMISSIVE que a produção tem, copiadas do
-- catálogo a 21/08/2026. Não toca nas RESTRICTIVE: são barreiras válidas e
-- continuam a valer, agora com efeito, porque passam a ter com que fazer AND.
--
-- O QUE A PRODUÇÃO NÃO TEM, E ESTA MIGRAÇÃO TAMBÉM NÃO
--
-- Não há PERMISSIVE de DELETE em `offers`, nem de INSERT/UPDATE/DELETE em
-- `agreements`. Não é esquecimento:
--
--   · uma proposta retira-se mudando o `status` para WITHDRAWN, não apagando —
--     o histórico de negociação tem de ficar;
--   · um acordo nasce dentro de `cf_aceitar_proposta()`, que é SECURITY DEFINER
--     e por isso não passa por RLS. Nenhum cliente cria um acordo directamente,
--     e é assim que deve ser.
--
-- Acrescentar essas políticas «para ficar completo» abriria caminhos que hoje
-- não existem. Ficam de fora.
--
-- DEPENDÊNCIAS, VERIFICADAS
--
-- As expressões referem `loads`, `trips`, `current_app_user_id()`,
-- `current_tenant_id()` e `is_platform_admin()`. Todos existem na reconstrução
-- e são criados por migrações anteriores a esta.
--
-- EFEITO EM PRODUÇÃO: NENHUM. As quatro já lá estão com esta definição exacta.
-- ===========================================================================

DO $rls$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT * FROM (VALUES
      -- Quem pode ver uma proposta: quem a fez, o dono da carga, o dono da
      -- viagem, e o administrador. As duas empresas envolvidas, e mais ninguém.
      ('offers', 'offers_parties', 'SELECT',
       '(offered_by = current_app_user_id())
        OR (EXISTS (SELECT 1 FROM loads l
                     WHERE l.id = offers.load_id AND l.tenant_id = current_tenant_id()))
        OR (EXISTS (SELECT 1 FROM trips t
                     WHERE t.id = offers.trip_id AND t.tenant_id = current_tenant_id()))
        OR is_platform_admin()', NULL),

      -- Só se cria uma proposta em nome próprio.
      ('offers', 'offers_insert', 'INSERT',
       NULL, 'offered_by = current_app_user_id()'),

      -- Alterar: o autor, ou o dono da carga (que aceita, rejeita, contrapropõe).
      -- Note-se que o dono da VIAGEM não entra aqui, ao contrário do SELECT —
      -- é assim em produção e não é alterado.
      ('offers', 'offers_update', 'UPDATE',
       '(offered_by = current_app_user_id())
        OR (EXISTS (SELECT 1 FROM loads l
                     WHERE l.id = offers.load_id AND l.tenant_id = current_tenant_id()))
        OR is_platform_admin()', NULL),

      -- Um acordo é visível às duas pessoas nomeadas e às duas empresas.
      ('agreements', 'agreements_parties', 'SELECT',
       '(merchant_user_id = current_app_user_id())
        OR (carrier_user_id = current_app_user_id())
        OR (EXISTS (SELECT 1 FROM loads l
                     WHERE l.id = agreements.load_id AND l.tenant_id = current_tenant_id()))
        OR (EXISTS (SELECT 1 FROM trips t
                     WHERE t.id = agreements.trip_id AND t.tenant_id = current_tenant_id()))
        OR is_platform_admin()', NULL)
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
-- Verificação estrutural, agora sem excepções: nenhuma tabela de `public` pode
-- ficar com RLS activa e só políticas RESTRICTIVE. `offers` e `agreements`
-- eram as duas últimas — a lista de excepções de 20260826 deixa de fazer falta.
-- --------------------------------------------------------------------------
DO $verificar$
DECLARE v_nega_tudo text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_nega_tudo
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
    AND EXISTS (SELECT 1 FROM pg_policies q
                WHERE q.schemaname = 'public' AND q.tablename = c.relname)
    AND NOT EXISTS (SELECT 1 FROM pg_policies q
                    WHERE q.schemaname = 'public' AND q.tablename = c.relname
                      AND q.permissive = 'PERMISSIVE');

  IF v_nega_tudo IS NOT NULL THEN
    RAISE EXCEPTION 'Tabelas com RLS e só políticas RESTRICTIVE (negam tudo): %', v_nega_tudo;
  END IF;

  RAISE NOTICE 'Nenhuma tabela nega tudo por falta de política permissiva.';
END $verificar$;
