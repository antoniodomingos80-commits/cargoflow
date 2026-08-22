-- ===========================================================================
-- As decisões de 21/08/2026, provadas por execução
--
-- tenants        UPDATE só de administrador; suspenso não altera
-- notifications  lê e marca como lida; suspenso não apaga
-- payments       suspenso PAGA (INSERT livre); alterar é acto administrativo
-- mercado        vista pública com lista branca; `loads` fechada ao público
--
-- Cada sonda mede o alvo antes de agir. Alvo vazio → INCONCLUSIVA, que conta
-- como falha: um UPDATE que toca 0 linhas porque não há linhas não prova nada.
--
-- Correr depois de `tests/rls-semente.sql`.
-- ===========================================================================

\set QUIET on
\pset footer off

CREATE TEMP TABLE r (
  ord int, area text, cenario text, actor text,
  existe int, obtido int, esperado text, estado text, erro text
);
GRANT ALL ON r TO anon, authenticated;

CREATE OR REPLACE FUNCTION pg_temp.sonda(
  p_ord int, p_area text, p_cenario text, p_actor text,
  p_papel text, p_sub text, p_alvo text, p_sql text,
  p_esperado text, p_escrita boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql AS $s$
DECLARE n_existe int; n_obtido int; v_erro text; v_estado text;
BEGIN
  EXECUTE 'SELECT count(*) FROM (' || p_alvo || ') AS z' INTO n_existe;

  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_sub IS NULL THEN '{}' ELSE json_build_object('sub', p_sub)::text END, true);
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', p_papel);
    IF p_escrita THEN
      EXECUTE p_sql;
      GET DIAGNOSTICS n_obtido = ROW_COUNT;
      RAISE EXCEPTION 'REVERTER:%', n_obtido;
    ELSE
      EXECUTE 'SELECT count(*) FROM (' || p_sql || ') AS z' INTO n_obtido;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'REVERTER:%' THEN n_obtido := split_part(SQLERRM, ':', 2)::int;
    ELSE v_erro := left(SQLERRM, 44); n_obtido := 0; END IF;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{}', true);

  v_estado := CASE
    WHEN n_existe = 0                                 THEN 'INCONCLUSIVA'
    WHEN p_esperado = 'permitido' AND n_obtido > 0    THEN 'PASS'
    WHEN p_esperado = 'bloqueado' AND n_obtido = 0    THEN 'PASS'
    ELSE 'FAIL' END;

  INSERT INTO r VALUES (p_ord, p_area, p_cenario, p_actor,
                        n_existe, n_obtido, p_esperado, v_estado, v_erro);
END $s$;

DO $d$
DECLARE
  A   text := '33333333-3333-3333-3333-33333333aaaa';  -- membro comum, empresa A
  B   text := '33333333-3333-3333-3333-33333333bbbb';  -- empresa B
  C   text := '33333333-3333-3333-3333-33333333cccc';  -- empresa C
  ADM text := '33333333-3333-3333-3333-3333333000ad';
  EMPRESA_A text := $q$SELECT 1 FROM public.tenants WHERE id='11111111-1111-1111-1111-11111111aaaa'$q$;
  UM  text := $q$SELECT 1$q$;
BEGIN
  -- ============================================================ TENANTS
  PERFORM pg_temp.sonda(1,'tenants','membro comum altera a própria empresa','A',
    'authenticated',A,EMPRESA_A,
    $q$UPDATE public.tenants SET name='Renomeada por membro' WHERE id='11111111-1111-1111-1111-11111111aaaa'$q$,
    'bloqueado', true);
  PERFORM pg_temp.sonda(2,'tenants','outra empresa altera a empresa A','C',
    'authenticated',C,EMPRESA_A,
    $q$UPDATE public.tenants SET name='Invadida' WHERE id='11111111-1111-1111-1111-11111111aaaa'$q$,
    'bloqueado', true);
  PERFORM pg_temp.sonda(3,'tenants','administrador altera a empresa A','ADMIN',
    'authenticated',ADM,EMPRESA_A,
    $q$UPDATE public.tenants SET name='Renomeada pelo admin' WHERE id='11111111-1111-1111-1111-11111111aaaa'$q$,
    'permitido', true);
  PERFORM pg_temp.sonda(4,'tenants','membro comum continua a VER a própria empresa','A',
    'authenticated',A,EMPRESA_A,EMPRESA_A,'permitido');
  PERFORM pg_temp.sonda(5,'tenants','anónimo vê empresas','ANON',
    'anon',NULL,EMPRESA_A,EMPRESA_A,'bloqueado');

  -- ============================================================ NOTIFICATIONS
  -- Criar uma notificação para A, como dono, para as sondas terem alvo.
  INSERT INTO public.notifications (id, user_id, type, title, body)
  VALUES ('babe0000-0000-0000-0000-00000000ba01',
          '22222222-2222-2222-2222-22222222aaaa','SYSTEM','Aviso','corpo')
  ON CONFLICT (id) DO NOTHING;

  PERFORM pg_temp.sonda(6,'notifications','dono lê a própria','A','authenticated',A,
    $q$SELECT 1 FROM public.notifications WHERE id='babe0000-0000-0000-0000-00000000ba01'$q$,
    $q$SELECT 1 FROM public.notifications WHERE id='babe0000-0000-0000-0000-00000000ba01'$q$,'permitido');
  PERFORM pg_temp.sonda(7,'notifications','outro utilizador lê a de A','B','authenticated',B,
    $q$SELECT 1 FROM public.notifications WHERE id='babe0000-0000-0000-0000-00000000ba01'$q$,
    $q$SELECT 1 FROM public.notifications WHERE id='babe0000-0000-0000-0000-00000000ba01'$q$,'bloqueado');
  PERFORM pg_temp.sonda(8,'notifications','dono marca como lida','A','authenticated',A,
    $q$SELECT 1 FROM public.notifications WHERE id='babe0000-0000-0000-0000-00000000ba01'$q$,
    $q$UPDATE public.notifications SET read_at=now() WHERE id='babe0000-0000-0000-0000-00000000ba01'$q$,
    'permitido', true);
  PERFORM pg_temp.sonda(9,'notifications','dono apaga a própria (conta activa)','A','authenticated',A,
    $q$SELECT 1 FROM public.notifications WHERE id='babe0000-0000-0000-0000-00000000ba01'$q$,
    $q$DELETE FROM public.notifications WHERE id='babe0000-0000-0000-0000-00000000ba01'$q$,
    'permitido', true);

  -- ============================================================ PAYMENTS
  PERFORM pg_temp.sonda(10,'payments','membro da empresa cria pagamento','A','authenticated',A,UM,
    $q$INSERT INTO public.payments (tenant_id, agreement_id, amount, currency, provider, status)
       VALUES ('11111111-1111-1111-1111-11111111aaaa','a9999999-0000-0000-0000-00000000ac01', 1000, 'AOA', 'MULTICAIXA', 'PENDING')$q$,
    'permitido', true);
  PERFORM pg_temp.sonda(11,'payments','outra empresa cria pagamento em nome de A','C','authenticated',C,UM,
    $q$INSERT INTO public.payments (tenant_id, agreement_id, amount, currency, provider, status)
       VALUES ('11111111-1111-1111-1111-11111111aaaa','a9999999-0000-0000-0000-00000000ac01', 1000, 'AOA', 'MULTICAIXA', 'PENDING')$q$,
    'bloqueado', true);

  -- ============================================================ MERCADO
  PERFORM pg_temp.sonda(12,'mercado','anónimo vê a vista pública','ANON','anon',NULL,
    $q$SELECT 1 FROM public.mercado_publico$q$,
    $q$SELECT 1 FROM public.mercado_publico$q$,'permitido');
  PERFORM pg_temp.sonda(13,'mercado','anónimo lê a tabela loads','ANON','anon',NULL,
    $q$SELECT 1 FROM public.loads$q$,
    $q$SELECT 1 FROM public.loads$q$,'bloqueado');
  PERFORM pg_temp.sonda(14,'mercado','autenticado de outra empresa vê a vista','C','authenticated',C,
    $q$SELECT 1 FROM public.mercado_publico$q$,
    $q$SELECT 1 FROM public.mercado_publico$q$,'permitido');
  PERFORM pg_temp.sonda(15,'mercado','vista mostra cargas DRAFT','ANON','anon',NULL,
    $q$SELECT 1 FROM public.loads WHERE status='DRAFT'$q$,
    $q$SELECT 1 FROM public.mercado_publico m JOIN public.loads l ON l.id=m.id WHERE l.status='DRAFT'$q$,
    'bloqueado');
  PERFORM pg_temp.sonda(16,'mercado','vista mostra cargas já atribuídas','ANON','anon',NULL,
    $q$SELECT 1 FROM public.loads WHERE assigned_trip_id IS NOT NULL$q$,
    $q$SELECT 1 FROM public.mercado_publico m JOIN public.loads l ON l.id=m.id WHERE l.assigned_trip_id IS NOT NULL$q$,
    'bloqueado');
END $d$;

-- --------------------------------------------------------------------------
-- A mesma conta, suspensa.
-- --------------------------------------------------------------------------
INSERT INTO public.user_blocklist (user_id, tenant_id, blocked_by, reason, is_active)
VALUES ('22222222-2222-2222-2222-2222222000ad','11111111-1111-1111-1111-11111111aaaa',
        '22222222-2222-2222-2222-2222222000ad','sonda decisoes admin', true),
       ('22222222-2222-2222-2222-22222222aaaa','11111111-1111-1111-1111-11111111aaaa',
        '22222222-2222-2222-2222-2222222000ad','sonda decisoes membro', true);
-- `request.jwt.claims` fica como cadeia vazia depois dos blocos acima, e o
-- gatilho de blindagem administrativa faz `current_setting(...)::json` — que
-- rebenta com ''. Repõe-se um JSON válido antes de tocar em `users`. Sem isto o
-- UPDATE falhava em silêncio e o teste passava à mesma, apoiado só em
-- `user_blocklist` — que é a fonte de verdade, mas não era o que se queria
-- provar.
SELECT set_config('request.jwt.claims', '{}', false);
UPDATE public.users SET is_blocked = true
 WHERE id IN ('22222222-2222-2222-2222-2222222000ad','22222222-2222-2222-2222-22222222aaaa');

DO $sus$
DECLARE
  A   text := '33333333-3333-3333-3333-33333333aaaa';
  ADM text := '33333333-3333-3333-3333-3333333000ad';
  EMPRESA_A text := $q$SELECT 1 FROM public.tenants WHERE id='11111111-1111-1111-1111-11111111aaaa'$q$;
  UM  text := $q$SELECT 1$q$;
BEGIN
  INSERT INTO public.notifications (id, user_id, type, title, body)
  VALUES ('babe0000-0000-0000-0000-00000000ba02',
          '22222222-2222-2222-2222-22222222aaaa','SYSTEM','Aviso de suspensão','corpo')
  ON CONFLICT (id) DO NOTHING;

  PERFORM pg_temp.sonda(17,'tenants','ADMIN SUSPENSO altera a empresa','ADMIN suspenso',
    'authenticated',ADM,EMPRESA_A,
    $q$UPDATE public.tenants SET name='Alterada por admin suspenso' WHERE id='11111111-1111-1111-1111-11111111aaaa'$q$,
    'bloqueado', true);

  PERFORM pg_temp.sonda(18,'notifications','SUSPENSO marca como lida (deve poder)','A suspenso',
    'authenticated',A,
    $q$SELECT 1 FROM public.notifications WHERE id='babe0000-0000-0000-0000-00000000ba02'$q$,
    $q$UPDATE public.notifications SET read_at=now() WHERE id='babe0000-0000-0000-0000-00000000ba02'$q$,
    'permitido', true);
  PERFORM pg_temp.sonda(19,'notifications','SUSPENSO apaga a própria','A suspenso',
    'authenticated',A,
    $q$SELECT 1 FROM public.notifications WHERE id='babe0000-0000-0000-0000-00000000ba02'$q$,
    $q$DELETE FROM public.notifications WHERE id='babe0000-0000-0000-0000-00000000ba02'$q$,
    'bloqueado', true);

  PERFORM pg_temp.sonda(20,'payments','SUSPENSO LIQUIDA (tem de poder)','A suspenso',
    'authenticated',A,UM,
    $q$INSERT INTO public.payments (tenant_id, agreement_id, amount, currency, provider, status)
       VALUES ('11111111-1111-1111-1111-11111111aaaa','a9999999-0000-0000-0000-00000000ac01', 2000, 'AOA', 'MULTICAIXA', 'PENDING')$q$,
    'permitido', true);
  PERFORM pg_temp.sonda(21,'payments','ADMIN SUSPENSO altera pagamento','ADMIN suspenso',
    'authenticated',ADM,
    $q$SELECT 1 FROM public.payments$q$,
    $q$UPDATE public.payments SET status='PAID' WHERE tenant_id='11111111-1111-1111-1111-11111111aaaa'$q$,
    'bloqueado', true);
END $sus$;

DELETE FROM public.user_blocklist WHERE reason LIKE 'sonda decisoes%';
SELECT set_config('request.jwt.claims', '{}', false);
UPDATE public.users SET is_blocked = false
 WHERE id IN ('22222222-2222-2222-2222-2222222000ad','22222222-2222-2222-2222-22222222aaaa');
DELETE FROM public.notifications WHERE id IN
  ('babe0000-0000-0000-0000-00000000ba01','babe0000-0000-0000-0000-00000000ba02');

\set QUIET off
\echo ''
\echo '=== decisões de segurança, por actor ==='
SELECT lpad(ord::text,2) || '  ' || rpad(estado,12) || ' ' || rpad(area,14) || ' ' ||
       rpad(cenario,48) || ' ' || rpad(actor,16) ||
       ' existe=' || existe || ' obtido=' || obtido ||
       coalesce('  [' || erro || ']','') AS sonda
FROM r ORDER BY ord;

\echo ''
\echo '--- colunas realmente publicadas pela vista ---'
SELECT string_agg(column_name, ', ' ORDER BY ordinal_position) AS lista_branca
FROM information_schema.columns
WHERE table_schema='public' AND table_name='mercado_publico';

\echo ''
SELECT count(*) FILTER (WHERE estado='PASS') || ' PASS, ' ||
       count(*) FILTER (WHERE estado='FAIL') || ' FAIL, ' ||
       count(*) FILTER (WHERE estado='INCONCLUSIVA') || ' INCONCLUSIVAS de ' ||
       count(*) || ' sondas' AS total
FROM r;
