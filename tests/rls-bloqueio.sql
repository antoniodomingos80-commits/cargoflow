-- ===========================================================================
-- §8 — Onde é que a base de dados trava uma conta bloqueada, e onde não trava
--
-- O P0 pôs 36 políticas RESTRICTIVE `*_bloqueio_*` que chamam `pode_operar()`.
-- Uma política RESTRICTIVE é a única que faz AND com as outras: sem ela, basta
-- uma permissiva dizer que sim. Onde não existe barreira, quem bloqueia é só a
-- aplicação — e a aplicação pode ser contornada por quem falar directamente com
-- a API.
--
-- Este ficheiro bloqueia mesmo uma conta e tenta as operações uma a uma.
-- Corre depois de `rls-semente.sql`. Reverte tudo o que escreve.
-- ===========================================================================

\set QUIET on
\pset footer off

CREATE TEMP TABLE resultado_bloqueio (
  operacao text,
  tabela   text,
  resultado text,
  barreira text
);

-- Bloquear o utilizador B pelos dois mecanismos que a plataforma tem.
INSERT INTO public.user_blocklist (user_id, tenant_id, blocked_by, reason, is_active)
VALUES ('22222222-2222-2222-2222-22222222bbbb','11111111-1111-1111-1111-11111111bbbb',
        '22222222-2222-2222-2222-2222222000ad','teste de auditoria', true);
UPDATE public.users SET is_blocked = true WHERE id = '22222222-2222-2222-2222-22222222bbbb';

CREATE OR REPLACE FUNCTION pg_temp.tenta(
  p_operacao text, p_tabela text, p_sql text
) RETURNS void LANGUAGE plpgsql AS $t$
DECLARE
  v_res text;
  n int;
  tem_barreira boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename = p_tabela AND permissive='RESTRICTIVE'
      AND policyname LIKE '%bloqueio%'
  ) INTO tem_barreira;

  PERFORM set_config('request.jwt.claims',
    '{"sub":"33333333-3333-3333-3333-33333333bbbb"}', true);
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE p_sql;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE EXCEPTION 'REVERTER:%', n;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'REVERTER:%' THEN
      n := split_part(SQLERRM, ':', 2)::int;
      v_res := CASE WHEN n > 0 THEN 'PASSOU (' || n || ' linha(s))' ELSE 'sem efeito (0 linhas)' END;
    ELSIF SQLERRM LIKE '%row-level security%' OR SQLERRM LIKE '%violates%' THEN
      v_res := 'BLOQUEADO pela BD';
    ELSE
      v_res := 'erro: ' || left(SQLERRM, 45);
    END IF;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{}', true);

  INSERT INTO resultado_bloqueio VALUES (p_operacao, p_tabela, v_res,
    CASE WHEN tem_barreira THEN 'sim' ELSE 'NÃO' END);
END $t$;

DO $b$
BEGIN
  PERFORM pg_temp.tenta('criar carga','loads',
    $q$INSERT INTO public.loads (tenant_id, created_by, origin_id, destination_id, title, cargo_type, weight_kg, pickup_from, pickup_until)
       VALUES ('11111111-1111-1111-1111-11111111bbbb','22222222-2222-2222-2222-22222222bbbb',
               '44444444-4444-4444-4444-444444440001','44444444-4444-4444-4444-444444440002',
               'carga de conta bloqueada','GENERAL',100, now()+interval '1 day', now()+interval '2 days')$q$);
  PERFORM pg_temp.tenta('editar carga própria','loads',
    $q$UPDATE public.loads SET title='editada por conta bloqueada' WHERE id='88888888-0000-0000-0000-0000000000b2'$q$);
  PERFORM pg_temp.tenta('publicar carga própria','loads',
    $q$UPDATE public.loads SET status='PUBLISHED' WHERE id='88888888-0000-0000-0000-0000000000b2'$q$);
  PERFORM pg_temp.tenta('apagar carga própria','loads',
    $q$DELETE FROM public.loads WHERE id='88888888-0000-0000-0000-0000000000b2'$q$);
  PERFORM pg_temp.tenta('criar viagem','trips',
    $q$INSERT INTO public.trips (tenant_id, created_by, vehicle_id, origin_id, destination_id, available_weight_kg, departure_at)
       VALUES ('11111111-1111-1111-1111-11111111bbbb','22222222-2222-2222-2222-22222222bbbb',
               '55555555-5555-5555-5555-55555555bbbb','44444444-4444-4444-4444-444444440001',
               '44444444-4444-4444-4444-444444440002', 100, now()+interval '2 days')$q$);
  PERFORM pg_temp.tenta('publicar viagem','trips',
    $q$UPDATE public.trips SET status='PUBLISHED' WHERE id='99999999-0000-0000-0000-0000000000b3'$q$);
  PERFORM pg_temp.tenta('criar proposta','offers',
    $q$INSERT INTO public.offers (load_id, trip_id, offered_by, amount)
       VALUES ('88888888-0000-0000-0000-0000000000a5','99999999-0000-0000-0000-0000000000b1',
               '22222222-2222-2222-2222-22222222bbbb', 123456)$q$);
  PERFORM pg_temp.tenta('enviar mensagem','messages',
    $q$INSERT INTO public.messages (conversation_id, sender_id, content)
       VALUES ('bbbb0000-0000-0000-0000-0000000000c2','22222222-2222-2222-2222-22222222bbbb','mensagem de conta bloqueada')$q$);
  PERFORM pg_temp.tenta('registar evento de rastreio','tracking_events',
    $q$INSERT INTO public.tracking_events (load_id, event_type, description, created_by)
       VALUES ('88888888-0000-0000-0000-0000000000b1','IN_TRANSIT','de conta bloqueada','22222222-2222-2222-2222-22222222bbbb')$q$);
  PERFORM pg_temp.tenta('carregar documento','documents',
    $q$INSERT INTO public.documents (tenant_id, user_id, type, file_url)
       VALUES ('11111111-1111-1111-1111-11111111bbbb','22222222-2222-2222-2222-22222222bbbb','OTHER','doc/bloqueado.pdf')$q$);
  PERFORM pg_temp.tenta('carregar foto de expedição','shipment_photos',
    $q$INSERT INTO public.shipment_photos (tenant_id, load_id, uploaded_by, path, stage)
       VALUES ('11111111-1111-1111-1111-11111111bbbb','88888888-0000-0000-0000-0000000000b1',
               '22222222-2222-2222-2222-22222222bbbb','b/bloqueado.jpg','PICKUP')$q$);
  PERFORM pg_temp.tenta('apagar foto de expedição','shipment_photos',
    $q$DELETE FROM public.shipment_photos WHERE id='ffff0000-0000-0000-0000-0000000000f2'$q$);
  PERFORM pg_temp.tenta('alterar o próprio veículo','vehicles',
    $q$UPDATE public.vehicles SET plate='XX-99-99-XX' WHERE id='55555555-5555-5555-5555-55555555bbbb'$q$);
  PERFORM pg_temp.tenta('alterar o próprio perfil','users',
    $q$UPDATE public.users SET full_name='renomeado' WHERE id='22222222-2222-2222-2222-22222222bbbb'$q$);
  PERFORM pg_temp.tenta('escrever avaliação','reviews',
    $q$INSERT INTO public.reviews (load_id, reviewer_id, reviewed_id, rating)
       VALUES ('88888888-0000-0000-0000-0000000000b1','22222222-2222-2222-2222-22222222bbbb',
               '22222222-2222-2222-2222-22222222aaaa',1)$q$);
END $b$;

-- Desfazer o bloqueio.
DELETE FROM public.user_blocklist WHERE reason = 'teste de auditoria';
UPDATE public.users SET is_blocked = false WHERE id = '22222222-2222-2222-2222-22222222bbbb';

\set QUIET off
\echo ''
\echo '=== CONTA BLOQUEADA — o que a BASE DE DADOS trava ==='
SELECT rpad(operacao, 32) || ' ' || rpad(tabela, 18) ||
       ' barreira RESTRICTIVE: ' || rpad(barreira, 4) || '  → ' || resultado AS resultado
FROM resultado_bloqueio;

\echo ''
\echo '--- operações que passam apesar da conta estar bloqueada ---'
SELECT operacao || ' em ' || tabela ||
       CASE WHEN barreira = 'NÃO' THEN '  (não existe barreira nesta tabela)' ELSE '  (a barreira existe e não travou)' END AS achado
FROM resultado_bloqueio WHERE resultado LIKE 'PASSOU%';
