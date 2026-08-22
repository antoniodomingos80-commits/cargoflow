-- ===========================================================================
-- Barreira de conta bloqueada — as quatro tabelas do Lote 3
--
-- Prova por execução, com a conta suspensa a sério (`user_blocklist` +
-- `users.is_blocked`), que:
--
--   · uma conta ACTIVA continua a fazer o que o desenho permite;
--   · a mesma conta, suspensa, não faz nenhuma dessas operações;
--   · outra empresa continua isolada;
--   · o administrador mantém o comportamento previsto.
--
-- Cada sonda mede o alvo antes de agir. Uma sonda cujo alvo não existe é
-- INCONCLUSIVA e conta como falha — um UPDATE que toca 0 linhas porque não há
-- linhas não prova barreira nenhuma.
--
-- Correr depois de `tests/rls-semente.sql`.
-- ===========================================================================

\set QUIET on
\pset footer off

CREATE TEMP TABLE r (
  ord int, tabela text, operacao text, conta text,
  existe int, tocadas int, esperado text, estado text, erro text
);
GRANT ALL ON r TO anon, authenticated;

CREATE OR REPLACE FUNCTION pg_temp.sonda(
  p_ord int, p_tabela text, p_operacao text, p_conta text,
  p_sub text, p_alvo text, p_sql text, p_esperado text
) RETURNS void LANGUAGE plpgsql AS $s$
DECLARE n_existe int; n_tocadas int; v_erro text; v_estado text;
BEGIN
  EXECUTE 'SELECT count(*) FROM (' || p_alvo || ') AS z' INTO n_existe;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_sub)::text, true);
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE p_sql;
    GET DIAGNOSTICS n_tocadas = ROW_COUNT;
    RAISE EXCEPTION 'REVERTER:%', n_tocadas;   -- subtransação: mede sem gravar
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'REVERTER:%' THEN
      n_tocadas := split_part(SQLERRM, ':', 2)::int;
    ELSE
      v_erro := left(SQLERRM, 46); n_tocadas := 0;
    END IF;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{}', true);

  v_estado := CASE
    WHEN n_existe = 0                                THEN 'INCONCLUSIVA'
    WHEN p_esperado = 'permitido' AND n_tocadas > 0  THEN 'PASS'
    WHEN p_esperado = 'bloqueado' AND n_tocadas = 0  THEN 'PASS'
    ELSE 'FAIL' END;

  INSERT INTO r VALUES (p_ord, p_tabela, p_operacao, p_conta,
                        n_existe, n_tocadas, p_esperado, v_estado, v_erro);
END $s$;

-- Alvos existentes na semente:
--   foto  ffff0000-…f2  → empresa B      foto  ffff0000-…f1 → empresa A
--   doc   77777777-…bbbb → empresa B
--   carga 88888888-…b1   → empresa B
DO $activa$
DECLARE
  B    text := '33333333-3333-3333-3333-33333333bbbb';
  C    text := '33333333-3333-3333-3333-33333333cccc';
  ADM  text := '33333333-3333-3333-3333-3333333000ad';
  FOTO_B text := $q$SELECT 1 FROM public.shipment_photos WHERE id='ffff0000-0000-0000-0000-0000000000f2'$q$;
  FOTO_A text := $q$SELECT 1 FROM public.shipment_photos WHERE id='ffff0000-0000-0000-0000-0000000000f1'$q$;
  DOC_B  text := $q$SELECT 1 FROM public.documents WHERE id='77777777-7777-7777-7777-77777777bbbb'$q$;
  UM     text := $q$SELECT 1$q$;
BEGIN
  -- ---------------- conta ACTIVA: o desenho tem de continuar a funcionar
  PERFORM pg_temp.sonda(1,'shipment_photos','INSERT','B activa',B,UM,
    $q$INSERT INTO public.shipment_photos (tenant_id, load_id, uploaded_by, path, stage)
       VALUES ('11111111-1111-1111-1111-11111111bbbb','88888888-0000-0000-0000-0000000000b1',
               '22222222-2222-2222-2222-22222222bbbb','b/nova.jpg','PICKUP')$q$,'permitido');
  PERFORM pg_temp.sonda(2,'shipment_photos','UPDATE','B activa',B,FOTO_B,
    $q$UPDATE public.shipment_photos SET caption='legenda' WHERE id='ffff0000-0000-0000-0000-0000000000f2'$q$,'permitido');
  PERFORM pg_temp.sonda(3,'shipment_photos','DELETE','B activa',B,FOTO_B,
    $q$DELETE FROM public.shipment_photos WHERE id='ffff0000-0000-0000-0000-0000000000f2'$q$,'permitido');
  PERFORM pg_temp.sonda(4,'documents','INSERT','B activa',B,UM,
    $q$INSERT INTO public.documents (tenant_id, user_id, type, file_url)
       VALUES ('11111111-1111-1111-1111-11111111bbbb','22222222-2222-2222-2222-22222222bbbb','OTHER','b/novo.pdf')$q$,'permitido');
  PERFORM pg_temp.sonda(5,'tracking_events','INSERT','B activa',B,UM,
    $q$INSERT INTO public.tracking_events (load_id, event_type, description, created_by)
       VALUES ('88888888-0000-0000-0000-0000000000b1','IN_TRANSIT','activa','22222222-2222-2222-2222-22222222bbbb')$q$,'permitido');
  PERFORM pg_temp.sonda(6,'locations','INSERT','B activa',B,UM,
    $q$INSERT INTO public.locations (name, city, province, coordinates)
       VALUES ('Lobito','Lobito','Benguela', ST_SetSRID(ST_MakePoint(13.54,-12.36),4326)::geography)$q$,'permitido');

  -- ---------------- outra empresa: isolamento não pode ceder
  PERFORM pg_temp.sonda(7,'shipment_photos','DELETE alheia','C activa',C,FOTO_B,
    $q$DELETE FROM public.shipment_photos WHERE id='ffff0000-0000-0000-0000-0000000000f2'$q$,'bloqueado');
  PERFORM pg_temp.sonda(8,'documents','UPDATE alheio','C activa',C,DOC_B,
    $q$UPDATE public.documents SET document_number='X' WHERE id='77777777-7777-7777-7777-77777777bbbb'$q$,'bloqueado');

  -- ---------------- administrador
  PERFORM pg_temp.sonda(9,'shipment_photos','UPDATE','ADMIN',ADM,FOTO_A,
    $q$UPDATE public.shipment_photos SET caption='visto pelo admin' WHERE id='ffff0000-0000-0000-0000-0000000000f1'$q$,'permitido');
END $activa$;

-- --------------------------------------------------------------------------
-- Agora a mesma conta, suspensa.
-- --------------------------------------------------------------------------
INSERT INTO public.user_blocklist (user_id, tenant_id, blocked_by, reason, is_active)
VALUES ('22222222-2222-2222-2222-22222222bbbb','11111111-1111-1111-1111-11111111bbbb',
        '22222222-2222-2222-2222-2222222000ad','sonda lote 3', true);
UPDATE public.users SET is_blocked = true WHERE id = '22222222-2222-2222-2222-22222222bbbb';

DO $bloqueada$
DECLARE
  B text := '33333333-3333-3333-3333-33333333bbbb';
  FOTO_B text := $q$SELECT 1 FROM public.shipment_photos WHERE id='ffff0000-0000-0000-0000-0000000000f2'$q$;
  DOC_B  text := $q$SELECT 1 FROM public.documents WHERE id='77777777-7777-7777-7777-77777777bbbb'$q$;
  UM     text := $q$SELECT 1$q$;
BEGIN
  PERFORM pg_temp.sonda(10,'shipment_photos','INSERT','B BLOQUEADA',B,UM,
    $q$INSERT INTO public.shipment_photos (tenant_id, load_id, uploaded_by, path, stage)
       VALUES ('11111111-1111-1111-1111-11111111bbbb','88888888-0000-0000-0000-0000000000b1',
               '22222222-2222-2222-2222-22222222bbbb','b/bloq.jpg','PICKUP')$q$,'bloqueado');
  PERFORM pg_temp.sonda(11,'shipment_photos','UPDATE','B BLOQUEADA',B,FOTO_B,
    $q$UPDATE public.shipment_photos SET caption='bloq' WHERE id='ffff0000-0000-0000-0000-0000000000f2'$q$,'bloqueado');
  PERFORM pg_temp.sonda(12,'shipment_photos','DELETE','B BLOQUEADA',B,FOTO_B,
    $q$DELETE FROM public.shipment_photos WHERE id='ffff0000-0000-0000-0000-0000000000f2'$q$,'bloqueado');
  PERFORM pg_temp.sonda(13,'documents','INSERT','B BLOQUEADA',B,UM,
    $q$INSERT INTO public.documents (tenant_id, user_id, type, file_url)
       VALUES ('11111111-1111-1111-1111-11111111bbbb','22222222-2222-2222-2222-22222222bbbb','OTHER','b/bloq.pdf')$q$,'bloqueado');
  PERFORM pg_temp.sonda(14,'documents','UPDATE','B BLOQUEADA',B,DOC_B,
    $q$UPDATE public.documents SET document_number='BLOQ' WHERE id='77777777-7777-7777-7777-77777777bbbb'$q$,'bloqueado');
  PERFORM pg_temp.sonda(15,'documents','DELETE','B BLOQUEADA',B,DOC_B,
    $q$DELETE FROM public.documents WHERE id='77777777-7777-7777-7777-77777777bbbb'$q$,'bloqueado');
  PERFORM pg_temp.sonda(16,'tracking_events','INSERT','B BLOQUEADA',B,UM,
    $q$INSERT INTO public.tracking_events (load_id, event_type, description, created_by)
       VALUES ('88888888-0000-0000-0000-0000000000b1','IN_TRANSIT','bloq','22222222-2222-2222-2222-22222222bbbb')$q$,'bloqueado');
  PERFORM pg_temp.sonda(17,'locations','INSERT','B BLOQUEADA',B,UM,
    $q$INSERT INTO public.locations (name, city, province, coordinates)
       VALUES ('Namibe','Namibe','Namibe', ST_SetSRID(ST_MakePoint(12.15,-15.19),4326)::geography)$q$,'bloqueado');
END $bloqueada$;

DELETE FROM public.user_blocklist WHERE reason = 'sonda lote 3';
UPDATE public.users SET is_blocked = false WHERE id = '22222222-2222-2222-2222-22222222bbbb';

\set QUIET off
\echo ''
\echo '=== barreira de conta bloqueada — Lote 3 ==='
SELECT lpad(ord::text,2) || '  ' || rpad(estado,12) || ' ' || rpad(tabela,16) || ' ' ||
       rpad(operacao,14) || ' ' || rpad(conta,12) ||
       ' existe=' || existe || ' tocadas=' || tocadas || ' esperado=' || esperado ||
       coalesce('  [' || erro || ']', '') AS sonda
FROM r ORDER BY ord;

\echo ''
SELECT count(*) FILTER (WHERE estado='PASS') || ' PASS, ' ||
       count(*) FILTER (WHERE estado='FAIL') || ' FAIL, ' ||
       count(*) FILTER (WHERE estado='INCONCLUSIVA') || ' INCONCLUSIVAS de ' ||
       count(*) || ' sondas' AS total
FROM r;
