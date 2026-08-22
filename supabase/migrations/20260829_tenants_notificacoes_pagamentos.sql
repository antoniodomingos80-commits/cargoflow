-- ===========================================================================
-- Decisões de segurança tomadas a 21/08/2026 — tenants, notifications, payments
--
-- Estas três tabelas ficaram em aberto no Lote 3 porque a decisão não era
-- técnica. Foram decididas; isto executa o que foi decidido, e nada mais.
-- `user_blocklist` não aparece aqui de propósito — ver o fim do ficheiro.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. `tenants` — alterar a empresa passa a ser acto de administração
--
-- Estava assim: `(id = current_tenant_id()) OR is_platform_admin()`. Qualquer
-- utilizador autenticado da empresa — não só quem a administra — podia mudar
-- nome, `slug`, `tax_id`, moeda, país e `is_active`.
--
-- Decidido: o UPDATE fica restrito a administrador de plataforma, e uma conta
-- suspensa não o executa. O SELECT não muda: continua a ver-se a própria
-- empresa.
--
-- Usa-se `ALTER POLICY` e não DROP+CREATE: numa base em serviço, largar a
-- política deixaria a tabela sem regra de UPDATE durante um instante, e o que
-- ficaria a valer nesse intervalo seriam os GRANT.
--
-- A produção tem uma política a mais nesta tabela (`tenants_update`, do modelo
-- antigo) que a reconstrução não cria. Se existir, é apertada da mesma forma —
-- senão bastaria ela para contornar tudo isto, porque as permissivas somam-se
-- por OR.
-- ---------------------------------------------------------------------------
DO $tenants$
DECLARE p text;
BEGIN
  FOREACH p IN ARRAY ARRAY['tenants_update_own_or_admin', 'tenants_update'] LOOP
    IF EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname='public' AND tablename='tenants' AND policyname=p) THEN
      EXECUTE format(
        'ALTER POLICY %I ON public.tenants USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin())', p);
      RAISE NOTICE 'tenants.% passou a exigir is_platform_admin()', p;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname='public' AND tablename='tenants'
                   AND policyname='tenants_bloqueio_update') THEN
    CREATE POLICY tenants_bloqueio_update ON public.tenants
      AS RESTRICTIVE FOR UPDATE TO authenticated
      USING (public.pode_operar()) WITH CHECK (public.pode_operar());
    RAISE NOTICE 'criada barreira tenants_bloqueio_update';
  END IF;
END $tenants$;


-- ---------------------------------------------------------------------------
-- 2. `notifications` — apagar deixa de ser possível a uma conta suspensa
--
-- `notifications_own_only` é `FOR ALL`: o dono lê, marca como lida, cria e
-- apaga as suas. A justificação antiga só cobria «marcar como lida».
--
-- Decidido: ler e marcar como lida continuam livres — são inofensivos e são o
-- uso normal. Apagar não: uma conta suspensa apagaria o rasto do que lhe foi
-- comunicado, incluindo o aviso da própria suspensão.
--
-- Só DELETE leva barreira. O INSERT fica de fora de propósito: as notificações
-- nascem em `cf_notificar_mensagem()` e companhia, que são SECURITY DEFINER e
-- não passam por RLS — mas o sistema não precisa de ninguém a apagá-las.
-- Bloquear o INSERT não protegeria nada e podia partir um caminho legítimo.
-- ---------------------------------------------------------------------------
DO $notif$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname='public' AND tablename='notifications'
                   AND policyname='notifications_bloqueio_delete') THEN
    CREATE POLICY notifications_bloqueio_delete ON public.notifications
      AS RESTRICTIVE FOR DELETE TO authenticated
      USING (public.pode_operar());
    RAISE NOTICE 'criada barreira notifications_bloqueio_delete';
  END IF;
END $notif$;


-- ---------------------------------------------------------------------------
-- 3. `payments` — pagar continua livre; mexer no pagamento é que não
--
-- Decidido: uma conta suspensa **pode** liquidar uma obrigação que já contraiu.
-- Suspender uma conta não deve deixar um acordo em curso por pagar.
--
-- Por isso **não há barreira no INSERT** — e isso é uma decisão escrita, não um
-- esquecimento. Quem vier depois e vir `payments` sem `payments_bloqueio_insert`
-- deve encontrar esta linha antes de a acrescentar.
--
-- O que leva barreira é o UPDATE, que já era só de administrador
-- (`payments_update_platform_admin`): alterar um pagamento é acto
-- administrativo, e um administrador suspenso não o faz. É esta a separação
-- entre liquidação e alteração administrativa.
--
-- Não há política de DELETE, e continua a não haver: um pagamento não se apaga.
-- ---------------------------------------------------------------------------
DO $pag$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname='public' AND tablename='payments'
                   AND policyname='payments_bloqueio_update') THEN
    CREATE POLICY payments_bloqueio_update ON public.payments
      AS RESTRICTIVE FOR UPDATE TO authenticated
      USING (public.pode_operar()) WITH CHECK (public.pode_operar());
    RAISE NOTICE 'criada barreira payments_bloqueio_update';
  END IF;
END $pag$;


-- ---------------------------------------------------------------------------
-- 4. `user_blocklist` — decidido NÃO criar barreira
--
-- Não há aqui nenhum comando por lapso. A decisão é não pôr barreira, e as
-- razões estão medidas:
--
--   · seria redundante — um utilizador comum suspenso já não escreve nesta
--     tabela, por não ser administrador nem autor do bloqueio;
--   · a produção tem UM administrador de plataforma activo. Com barreira, se
--     essa conta for bloqueada, `pode_operar()` fica falso e ninguém desbloqueia
--     pela aplicação — restaria `service_role` ou acesso directo à base.
--
-- Ganho nulo, risco de trancar a porta por dentro. Fica em COMMENT para quem
-- ler o catálogo em vez do repositório.
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.user_blocklist IS
  'Fonte de verdade dos bloqueios de conta. DELIBERADAMENTE sem barreira RESTRICTIVE pode_operar(): seria redundante (só admin ou o autor do bloqueio escrevem) e um administrador bloqueado deixaria de poder desbloquear seja quem for. Ver SECURITY-MODEL-TARGET.md §5.4.';


-- ---------------------------------------------------------------------------
-- Verificação do que foi decidido
-- ---------------------------------------------------------------------------
DO $verificar$
DECLARE v_erro text;
BEGIN
  -- tenants: nenhuma permissiva de UPDATE pode aceitar quem não é admin
  SELECT string_agg(policyname, ', ') INTO v_erro FROM pg_policies
  WHERE schemaname='public' AND tablename='tenants' AND permissive='PERMISSIVE'
    AND cmd IN ('UPDATE','ALL')
    AND coalesce(qual,'')||coalesce(with_check,'') ~ 'current_tenant_id';
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'tenants: política de UPDATE ainda aceita membro comum: %', v_erro;
  END IF;

  -- as três barreiras decididas existem; a de payments INSERT NÃO pode existir
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND policyname IN ('tenants_bloqueio_update')) THEN
    RAISE EXCEPTION 'falta tenants_bloqueio_update';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND policyname IN ('notifications_bloqueio_delete')) THEN
    RAISE EXCEPTION 'falta notifications_bloqueio_delete';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND policyname IN ('payments_bloqueio_update')) THEN
    RAISE EXCEPTION 'falta payments_bloqueio_update';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
             AND policyname = 'payments_bloqueio_insert') THEN
    RAISE EXCEPTION 'payments_bloqueio_insert existe e não devia: foi decidido que uma conta suspensa pode liquidar';
  END IF;

  RAISE NOTICE 'tenants, notifications e payments conforme o decidido.';
END $verificar$;
