-- ===========================================================================
-- `offers` e `agreements` por actor
--
-- Antes de 20260827, estas duas tabelas tinham RLS e só políticas RESTRICTIVE.
-- RESTRICTIVE combina com AND, PERMISSIVE com OR: sem uma única permissiva não
-- há com que fazer OR e nega-se tudo. O dono via zero das suas propostas.
--
-- Seis actores, cada um com uma expectativa declarada:
--   A       comerciante da empresa A, dono da carga
--   B       transportador da empresa B, autor da proposta e parte do acordo
--   C       empresa sem relação nenhuma com o negócio
--   ADMIN   administrador de plataforma
--   BLOQ    o utilizador B, com a conta suspensa
--   ANON    sem sessão
--
-- Cada sonda mede o que existe (como dono, sem RLS) e o que o actor vê. Uma
-- sonda cujo alvo não existe é INCONCLUSIVA e conta como falha — nunca como
-- prova de isolamento.
--
-- Correr depois de `tests/rls-semente.sql`.
-- ===========================================================================

\set QUIET on
\pset footer off

CREATE TEMP TABLE r (
  ord int, alvo text, actor text, operacao text,
  existe int, obtido int, esperado text, estado text, erro text
);
GRANT ALL ON r TO anon, authenticated;

CREATE OR REPLACE FUNCTION pg_temp.sonda(
  p_ord int, p_alvo text, p_actor text, p_operacao text,
  p_papel text, p_sub text, p_sql text, p_esperado text, p_escrita boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql AS $s$
DECLARE n_existe int; n_obtido int; v_erro text; v_estado text;
BEGIN
  -- Quantas linhas o alvo tem de facto, sem RLS.
  EXECUTE 'SELECT count(*) FROM (' || p_alvo || ') AS z' INTO n_existe;

  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_sub IS NULL THEN '{}' ELSE json_build_object('sub', p_sub)::text END, true);
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', p_papel);
    IF p_escrita THEN
      EXECUTE p_sql;
      GET DIAGNOSTICS n_obtido = ROW_COUNT;
      RAISE EXCEPTION 'REVERTER:%', n_obtido;   -- subtransação: mede sem gravar
    ELSE
      EXECUTE 'SELECT count(*) FROM (' || p_sql || ') AS z' INTO n_obtido;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'REVERTER:%' THEN
      n_obtido := split_part(SQLERRM, ':', 2)::int;
    ELSE
      v_erro := left(SQLERRM, 50); n_obtido := 0;
    END IF;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{}', true);

  v_estado := CASE
    WHEN n_existe = 0                                    THEN 'INCONCLUSIVA'
    WHEN p_esperado = 've'      AND n_obtido = n_existe   THEN 'PASS'
    WHEN p_esperado = 'bloqueado' AND n_obtido = 0        THEN 'PASS'
    ELSE 'FAIL' END;

  INSERT INTO r VALUES (p_ord, p_alvo, p_actor, p_operacao,
                        n_existe, n_obtido, p_esperado, v_estado, v_erro);
END $s$;

DO $t$
DECLARE
  A     text := '33333333-3333-3333-3333-33333333aaaa';
  B     text := '33333333-3333-3333-3333-33333333bbbb';
  C     text := '33333333-3333-3333-3333-33333333cccc';
  ADM   text := '33333333-3333-3333-3333-3333333000ad';
  -- proposta f1: carga da empresa A, viagem da empresa B, feita por B
  OFERTA text := $q$SELECT 1 FROM public.offers WHERE id='aaaa0000-0000-0000-0000-0000000000f1'$q$;
  ACORDO text := $q$SELECT 1 FROM public.agreements WHERE id='a9999999-0000-0000-0000-00000000ac01'$q$;
BEGIN
  -- ---------------------------------------------------------------- OFFERS
  PERFORM pg_temp.sonda(1,OFERTA,'A · dono da carga','SELECT','authenticated',A,OFERTA,'ve');
  PERFORM pg_temp.sonda(2,OFERTA,'B · autor da proposta','SELECT','authenticated',B,OFERTA,'ve');
  PERFORM pg_temp.sonda(3,OFERTA,'C · empresa sem relação','SELECT','authenticated',C,OFERTA,'bloqueado');
  PERFORM pg_temp.sonda(4,OFERTA,'ADMIN','SELECT','authenticated',ADM,OFERTA,'ve');
  PERFORM pg_temp.sonda(5,OFERTA,'ANON','SELECT','anon',NULL,OFERTA,'bloqueado');

  -- operação legítima do dono da carga: responder à proposta
  PERFORM pg_temp.sonda(6,OFERTA,'A · dono da carga','UPDATE status','authenticated',A,
    $q$UPDATE public.offers SET status='REJECTED' WHERE id='aaaa0000-0000-0000-0000-0000000000f1'$q$,
    've', true);
  PERFORM pg_temp.sonda(7,OFERTA,'C · empresa sem relação','UPDATE status','authenticated',C,
    $q$UPDATE public.offers SET status='REJECTED' WHERE id='aaaa0000-0000-0000-0000-0000000000f1'$q$,
    'bloqueado', true);

  -- criar proposta em nome próprio vs. em nome de outro
  PERFORM pg_temp.sonda(8,$q$SELECT 1$q$,'B · em nome próprio','INSERT','authenticated',B,
    $q$INSERT INTO public.offers (load_id, trip_id, offered_by, amount)
       VALUES ('88888888-0000-0000-0000-0000000000a5','99999999-0000-0000-0000-0000000000b1',
               '22222222-2222-2222-2222-22222222bbbb', 111111)$q$, 've', true);
  PERFORM pg_temp.sonda(9,$q$SELECT 1$q$,'C · em nome de B','INSERT','authenticated',C,
    $q$INSERT INTO public.offers (load_id, trip_id, offered_by, amount)
       VALUES ('88888888-0000-0000-0000-0000000000a5','99999999-0000-0000-0000-0000000000b1',
               '22222222-2222-2222-2222-22222222bbbb', 222222)$q$, 'bloqueado', true);

  -- --------------------------------------------------------------- AGREEMENTS
  PERFORM pg_temp.sonda(10,ACORDO,'A · comerciante do acordo','SELECT','authenticated',A,ACORDO,'ve');
  PERFORM pg_temp.sonda(11,ACORDO,'B · transportador do acordo','SELECT','authenticated',B,ACORDO,'ve');
  PERFORM pg_temp.sonda(12,ACORDO,'C · empresa sem relação','SELECT','authenticated',C,ACORDO,'bloqueado');
  PERFORM pg_temp.sonda(13,ACORDO,'ADMIN','SELECT','authenticated',ADM,ACORDO,'ve');
  PERFORM pg_temp.sonda(14,ACORDO,'ANON','SELECT','anon',NULL,ACORDO,'bloqueado');
END $t$;

-- --------------------------------------------------------------------------
-- Conta bloqueada: as RESTRICTIVE têm de continuar a travar, agora que existem
-- permissivas com que fazer AND.
-- --------------------------------------------------------------------------
INSERT INTO public.user_blocklist (user_id, tenant_id, blocked_by, reason, is_active)
VALUES ('22222222-2222-2222-2222-22222222bbbb','11111111-1111-1111-1111-11111111bbbb',
        '22222222-2222-2222-2222-2222222000ad','sonda p1-1', true);

DO $b$
DECLARE B text := '33333333-3333-3333-3333-33333333bbbb';
  OFERTA text := $q$SELECT 1 FROM public.offers WHERE id='aaaa0000-0000-0000-0000-0000000000f1'$q$;
  ACORDO text := $q$SELECT 1 FROM public.agreements WHERE id='a9999999-0000-0000-0000-00000000ac01'$q$;
BEGIN
  -- Ler continua a ser possível: a barreira é de escrita, não de leitura.
  PERFORM pg_temp.sonda(15,OFERTA,'BLOQ · lê a própria proposta','SELECT','authenticated',B,OFERTA,'ve');
  PERFORM pg_temp.sonda(16,OFERTA,'BLOQ · altera proposta','UPDATE','authenticated',B,
    $q$UPDATE public.offers SET amount=1 WHERE id='aaaa0000-0000-0000-0000-0000000000f1'$q$,
    'bloqueado', true);
  PERFORM pg_temp.sonda(17,$q$SELECT 1$q$,'BLOQ · cria proposta','INSERT','authenticated',B,
    $q$INSERT INTO public.offers (load_id, trip_id, offered_by, amount)
       VALUES ('88888888-0000-0000-0000-0000000000a5','99999999-0000-0000-0000-0000000000b1',
               '22222222-2222-2222-2222-22222222bbbb', 333333)$q$, 'bloqueado', true);
  PERFORM pg_temp.sonda(18,ACORDO,'BLOQ · altera acordo','UPDATE','authenticated',B,
    $q$UPDATE public.agreements SET agreed_amount=1 WHERE id='a9999999-0000-0000-0000-00000000ac01'$q$,
    'bloqueado', true);
END $b$;

DELETE FROM public.user_blocklist WHERE reason = 'sonda p1-1';

\set QUIET off
\echo ''
\echo '=== offers / agreements por actor ==='
SELECT lpad(ord::text,2) || '  ' || rpad(estado,12) || ' ' ||
       rpad(actor,30) || ' ' || rpad(operacao,14) ||
       ' existe=' || existe || ' obtido=' || obtido ||
       ' esperado=' || esperado || coalesce('  [' || erro || ']', '') AS sonda
FROM r ORDER BY ord;

\echo ''
SELECT count(*) FILTER (WHERE estado='PASS') || ' PASS, ' ||
       count(*) FILTER (WHERE estado='FAIL') || ' FAIL, ' ||
       count(*) FILTER (WHERE estado='INCONCLUSIVA') || ' INCONCLUSIVAS de ' ||
       count(*) || ' sondas' AS total
FROM r;
