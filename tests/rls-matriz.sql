-- ===========================================================================
-- Matriz de visibilidade RLS
--
-- Corre contra uma base já semeada por `tests/rls-semente.sql`. Pode ser usada
-- contra qualquer base isolada — em particular contra as duas que interessam:
-- uma com as políticas do repositório e outra com as da produção.
--
-- A REGRA QUE GOVERNA ESTE FICHEIRO
--
-- Um "0 linhas" não prova isolamento nenhum. Pode ser a política a bloquear ou
-- a tabela a estar vazia. Por isso cada sonda mede DUAS coisas:
--
--   existe   → quantas linhas existem de facto (contadas como dono, sem RLS)
--   visivel  → quantas o papel consegue ver
--
-- Um resultado só conta como bloqueio quando `existe > 0` e `visivel = 0`.
-- Quando `existe = 0` a sonda declara-se INCONCLUSIVA, e isso é uma falha do
-- teste, não uma prova de segurança.
--
-- Correr: psql -d <base> -f tests/rls-matriz.sql
-- ===========================================================================

\set QUIET on
\pset footer off

CREATE TEMP TABLE resultado_rls (
  seccao   text,
  cenario  text,
  papel    text,
  existe   int,
  visivel  int,
  esperado text,
  erro     text
);
GRANT ALL ON resultado_rls TO anon, authenticated;

-- auth uid de cada personagem
--   A     33333333-3333-3333-3333-33333333aaaa   (MERCHANT, empresa A)
--   B     33333333-3333-3333-3333-33333333bbbb   (CARRIER,  empresa B)
--   admin 33333333-3333-3333-3333-3333333000ad   (PLATFORM_ADMIN)

CREATE OR REPLACE FUNCTION pg_temp.sonda(
  p_seccao text, p_cenario text, p_papel text, p_sub text,
  p_sql text, p_esperado text
) RETURNS void LANGUAGE plpgsql AS $sonda$
DECLARE
  n_existe  int;
  n_visivel int;
  v_erro    text := NULL;
BEGIN
  -- Como dono: quantas linhas existem mesmo. Sem isto o teste não vale nada.
  EXECUTE 'SELECT count(*) FROM (' || p_sql || ') AS s' INTO n_existe;

  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_sub IS NULL THEN '{}' ELSE json_build_object('sub', p_sub)::text END, true);
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', p_papel);
    EXECUTE 'SELECT count(*) FROM (' || p_sql || ') AS s' INTO n_visivel;
  EXCEPTION WHEN OTHERS THEN
    v_erro := SQLERRM;
    n_visivel := NULL;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{}', true);

  INSERT INTO resultado_rls
    VALUES (p_seccao, p_cenario, p_papel, n_existe, n_visivel, p_esperado, v_erro);
END $sonda$;

-- Escritas: mede quantas linhas uma operação consegue tocar.
CREATE OR REPLACE FUNCTION pg_temp.sonda_escrita(
  p_seccao text, p_cenario text, p_papel text, p_sub text,
  p_sql text, p_alvo_sql text, p_esperado text
) RETURNS void LANGUAGE plpgsql AS $sw$
DECLARE
  n_existe  int;
  n_tocadas int := 0;
  v_erro    text := NULL;
BEGIN
  EXECUTE 'SELECT count(*) FROM (' || p_alvo_sql || ') AS s' INTO n_existe;

  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_sub IS NULL THEN '{}' ELSE json_build_object('sub', p_sub)::text END, true);
  -- Um bloco com EXCEPTION é uma subtransação. Levantar uma excepção própria no
  -- fim reverte a escrita e deixa passar a contagem — assim a sonda mede sem
  -- alterar nada, e as sondas seguintes vêem os mesmos dados.
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', p_papel);
    EXECUTE p_sql;
    GET DIAGNOSTICS n_tocadas = ROW_COUNT;
    RAISE EXCEPTION 'SONDA_REVERTER:%', n_tocadas;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'SONDA_REVERTER:%' THEN
      n_tocadas := split_part(SQLERRM, ':', 2)::int;
    ELSE
      v_erro := SQLERRM;
      n_tocadas := NULL;
    END IF;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{}', true);

  INSERT INTO resultado_rls
    VALUES (p_seccao, p_cenario, p_papel, n_existe, n_tocadas, p_esperado, v_erro);
END $sw$;

DO $matriz$
DECLARE
  A     text := '33333333-3333-3333-3333-33333333aaaa';
  B     text := '33333333-3333-3333-3333-33333333bbbb';
  ADMIN text := '33333333-3333-3333-3333-3333333000ad';
BEGIN
-- =========================================================== 3 · MARKETPLACE
PERFORM pg_temp.sonda('3 marketplace','carga PUBLISHED da empresa A','anon',NULL,
  $q$SELECT 1 FROM public.loads WHERE status='PUBLISHED' AND tenant_id='11111111-1111-1111-1111-11111111aaaa'$q$,
  'depende da opção');
PERFORM pg_temp.sonda('3 marketplace','carga PUBLISHED da empresa A','authenticated',B,
  $q$SELECT 1 FROM public.loads WHERE status='PUBLISHED' AND tenant_id='11111111-1111-1111-1111-11111111aaaa'$q$,
  'visível (é o mercado)');
PERFORM pg_temp.sonda('3 marketplace','carga DRAFT da empresa A','anon',NULL,
  $q$SELECT 1 FROM public.loads WHERE status='DRAFT' AND tenant_id='11111111-1111-1111-1111-11111111aaaa'$q$,
  'bloqueado');
PERFORM pg_temp.sonda('3 marketplace','carga DRAFT da empresa A','authenticated',B,
  $q$SELECT 1 FROM public.loads WHERE status='DRAFT' AND tenant_id='11111111-1111-1111-1111-11111111aaaa'$q$,
  'bloqueado');
PERFORM pg_temp.sonda('3 marketplace','carga ASSIGNED da empresa A','authenticated',B,
  $q$SELECT 1 FROM public.loads WHERE status='ASSIGNED' AND tenant_id='11111111-1111-1111-1111-11111111aaaa'$q$,
  'bloqueado (não é dele)');
PERFORM pg_temp.sonda('3 marketplace','carga CANCELLED da empresa A','authenticated',B,
  $q$SELECT 1 FROM public.loads WHERE status='CANCELLED' AND tenant_id='11111111-1111-1111-1111-11111111aaaa'$q$,
  'bloqueado');
PERFORM pg_temp.sonda('3 marketplace','todas as cargas da própria empresa','authenticated',A,
  $q$SELECT 1 FROM public.loads WHERE tenant_id='11111111-1111-1111-1111-11111111aaaa'$q$,
  'vê as 4');
PERFORM pg_temp.sonda('3 marketplace','viagem PUBLISHED da empresa B','anon',NULL,
  $q$SELECT 1 FROM public.trips WHERE status='PUBLISHED' AND tenant_id='11111111-1111-1111-1111-11111111bbbb'$q$,
  'depende da opção');
PERFORM pg_temp.sonda('3 marketplace','viagem PUBLISHED da empresa B','authenticated',A,
  $q$SELECT 1 FROM public.trips WHERE status='PUBLISHED' AND tenant_id='11111111-1111-1111-1111-11111111bbbb'$q$,
  'visível (é o mercado)');
PERFORM pg_temp.sonda('3 marketplace','viagem CANCELLED da empresa B','authenticated',A,
  $q$SELECT 1 FROM public.trips WHERE status='CANCELLED' AND tenant_id='11111111-1111-1111-1111-11111111bbbb'$q$,
  'bloqueado');
PERFORM pg_temp.sonda('3 marketplace','todas as cargas (admin de plataforma)','authenticated',ADMIN,
  $q$SELECT 1 FROM public.loads$q$, 'vê as 6');

-- campos sensíveis dentro da carga publicada
PERFORM pg_temp.sonda('3 marketplace','contacto embutido na descrição da carga publicada','anon',NULL,
  $q$SELECT 1 FROM public.loads WHERE status='PUBLISHED' AND description LIKE '%contacto%'$q$,
  'exposto se o mercado for público');
PERFORM pg_temp.sonda('3 marketplace','orçamento (budget_amount) da carga publicada','anon',NULL,
  $q$SELECT 1 FROM public.loads WHERE status='PUBLISHED' AND budget_amount IS NOT NULL$q$,
  'exposto se o mercado for público');

-- =========================================================== 4 · ISOLAMENTO
PERFORM pg_temp.sonda('4 isolamento','A lê cargas privadas de B (DRAFT)','authenticated',A,
  $q$SELECT 1 FROM public.loads WHERE tenant_id='11111111-1111-1111-1111-11111111bbbb' AND status='DRAFT'$q$,
  'bloqueado');
PERFORM pg_temp.sonda('4 isolamento','A lê propostas de B','authenticated',A,
  $q$SELECT 1 FROM public.offers WHERE id='aaaa0000-0000-0000-0000-0000000000f3'$q$,
  'bloqueado');
PERFORM pg_temp.sonda('4 isolamento','A lê mensagens de conversa só de B','authenticated',A,
  $q$SELECT 1 FROM public.messages WHERE conversation_id='bbbb0000-0000-0000-0000-0000000000c2'$q$,
  'bloqueado');
PERFORM pg_temp.sonda('4 isolamento','A lê documentos de B','authenticated',A,
  $q$SELECT 1 FROM public.documents WHERE tenant_id='11111111-1111-1111-1111-11111111bbbb'$q$,
  'bloqueado');
PERFORM pg_temp.sonda('4 isolamento','A lê rastreio de carga de B','authenticated',A,
  $q$SELECT 1 FROM public.tracking_events WHERE load_id='88888888-0000-0000-0000-0000000000b1'$q$,
  'bloqueado');
PERFORM pg_temp.sonda('4 isolamento','A lê fotos de expedição de B','authenticated',A,
  $q$SELECT 1 FROM public.shipment_photos WHERE tenant_id='11111111-1111-1111-1111-11111111bbbb'$q$,
  'bloqueado');
PERFORM pg_temp.sonda('4 isolamento','A lê utilizadores de B','authenticated',A,
  $q$SELECT 1 FROM public.users WHERE tenant_id='11111111-1111-1111-1111-11111111bbbb'$q$,
  'bloqueado');
PERFORM pg_temp.sonda('4 isolamento','A lê veículos de B','authenticated',A,
  $q$SELECT 1 FROM public.vehicles WHERE tenant_id='11111111-1111-1111-1111-11111111bbbb'$q$,
  'bloqueado');
PERFORM pg_temp.sonda('4 isolamento','A lê a empresa B','authenticated',A,
  $q$SELECT 1 FROM public.tenants WHERE id='11111111-1111-1111-1111-11111111bbbb'$q$,
  'bloqueado');

-- escritas cruzadas
PERFORM pg_temp.sonda_escrita('4 isolamento','A ALTERA carga de B','authenticated',A,
  $q$UPDATE public.loads SET title='INVADIDA' WHERE tenant_id='11111111-1111-1111-1111-11111111bbbb'$q$,
  $q$SELECT 1 FROM public.loads WHERE tenant_id='11111111-1111-1111-1111-11111111bbbb'$q$,
  '0 linhas');
PERFORM pg_temp.sonda_escrita('4 isolamento','A APAGA carga de B','authenticated',A,
  $q$DELETE FROM public.loads WHERE tenant_id='11111111-1111-1111-1111-11111111bbbb'$q$,
  $q$SELECT 1 FROM public.loads WHERE tenant_id='11111111-1111-1111-1111-11111111bbbb'$q$,
  '0 linhas');
PERFORM pg_temp.sonda_escrita('4 isolamento','A ALTERA viagem de B','authenticated',A,
  $q$UPDATE public.trips SET status='CANCELLED' WHERE tenant_id='11111111-1111-1111-1111-11111111bbbb'$q$,
  $q$SELECT 1 FROM public.trips WHERE tenant_id='11111111-1111-1111-1111-11111111bbbb'$q$,
  '0 linhas');
PERFORM pg_temp.sonda_escrita('4 isolamento','A APAGA viagem de B','authenticated',A,
  $q$DELETE FROM public.trips WHERE tenant_id='11111111-1111-1111-1111-11111111bbbb'$q$,
  $q$SELECT 1 FROM public.trips WHERE tenant_id='11111111-1111-1111-1111-11111111bbbb'$q$,
  '0 linhas');
PERFORM pg_temp.sonda_escrita('4 isolamento','A ALTERA documento de B','authenticated',A,
  $q$UPDATE public.documents SET document_number='ROUBADO' WHERE tenant_id='11111111-1111-1111-1111-11111111bbbb'$q$,
  $q$SELECT 1 FROM public.documents WHERE tenant_id='11111111-1111-1111-1111-11111111bbbb'$q$,
  '0 linhas');
PERFORM pg_temp.sonda_escrita('4 isolamento','A ALTERA proposta de B','authenticated',A,
  $q$UPDATE public.offers SET amount=1 WHERE id='aaaa0000-0000-0000-0000-0000000000f3'$q$,
  $q$SELECT 1 FROM public.offers WHERE id='aaaa0000-0000-0000-0000-0000000000f3'$q$,
  '0 linhas');
PERFORM pg_temp.sonda_escrita('4 isolamento','A insere carga em nome de B','authenticated',A,
  $q$INSERT INTO public.loads (tenant_id, created_by, origin_id, destination_id, title, cargo_type, weight_kg, pickup_from, pickup_until)
     VALUES ('11111111-1111-1111-1111-11111111bbbb','22222222-2222-2222-2222-22222222aaaa',
             '44444444-4444-4444-4444-444444440001','44444444-4444-4444-4444-444444440002',
             'FORJADA','GENERAL',1, now()+interval '1 day', now()+interval '2 days')$q$,
  $q$SELECT 1$q$, 'erro de política');

-- =========================================================== 9 · ESCALADA POR UUID
PERFORM pg_temp.sonda('9 escalada','UUID directo de carga DRAFT de B','authenticated',A,
  $q$SELECT 1 FROM public.loads WHERE id='88888888-0000-0000-0000-0000000000b2'$q$, 'bloqueado');
PERFORM pg_temp.sonda('9 escalada','UUID directo de viagem FULL de B','authenticated',A,
  $q$SELECT 1 FROM public.trips WHERE id='99999999-0000-0000-0000-0000000000b2'$q$, 'bloqueado');
PERFORM pg_temp.sonda('9 escalada','UUID directo de proposta de B','authenticated',A,
  $q$SELECT 1 FROM public.offers WHERE id='aaaa0000-0000-0000-0000-0000000000f2'$q$, 'bloqueado');
PERFORM pg_temp.sonda('9 escalada','UUID directo de documento de B','authenticated',A,
  $q$SELECT 1 FROM public.documents WHERE id='77777777-7777-7777-7777-77777777bbbb'$q$, 'bloqueado');
PERFORM pg_temp.sonda('9 escalada','UUID directo de rastreio de B','authenticated',A,
  $q$SELECT 1 FROM public.tracking_events WHERE id='dddd0000-0000-0000-0000-0000000000d2'$q$, 'bloqueado');
PERFORM pg_temp.sonda('9 escalada','UUID directo de mensagem de B','authenticated',A,
  $q$SELECT 1 FROM public.messages WHERE id='cccc0000-0000-0000-0000-0000000000e2'$q$, 'bloqueado');
PERFORM pg_temp.sonda('9 escalada','UUID directo de foto de B','authenticated',A,
  $q$SELECT 1 FROM public.shipment_photos WHERE id='ffff0000-0000-0000-0000-0000000000f2'$q$, 'bloqueado');
PERFORM pg_temp.sonda('9 escalada','avaliação (reviews) de operação alheia','authenticated',B,
  $q$SELECT 1 FROM public.reviews WHERE id='eeee0000-0000-0000-0000-0000000000e1'$q$,
  'depende: reviews_read é aberta a autenticados');

-- =========================================================== 5 · ANÓNIMO
PERFORM pg_temp.sonda('5 anonimo','utilizadores','anon',NULL,
  $q$SELECT 1 FROM public.users$q$, 'bloqueado');
PERFORM pg_temp.sonda('5 anonimo','empresas','anon',NULL,
  $q$SELECT 1 FROM public.tenants$q$, 'bloqueado');
PERFORM pg_temp.sonda('5 anonimo','documentos','anon',NULL,
  $q$SELECT 1 FROM public.documents$q$, 'bloqueado');
PERFORM pg_temp.sonda('5 anonimo','propostas','anon',NULL,
  $q$SELECT 1 FROM public.offers$q$, 'bloqueado');
PERFORM pg_temp.sonda('5 anonimo','mensagens','anon',NULL,
  $q$SELECT 1 FROM public.messages$q$, 'bloqueado');
PERFORM pg_temp.sonda('5 anonimo','rastreio','anon',NULL,
  $q$SELECT 1 FROM public.tracking_events$q$, 'bloqueado');
PERFORM pg_temp.sonda('5 anonimo','avaliações','anon',NULL,
  $q$SELECT 1 FROM public.reviews$q$, 'bloqueado');
PERFORM pg_temp.sonda('5 anonimo','localidades','anon',NULL,
  $q$SELECT 1 FROM public.locations$q$, 'bloqueado se exigir sessão');
PERFORM pg_temp.sonda('5 anonimo','fotos de expedição','anon',NULL,
  $q$SELECT 1 FROM public.shipment_photos$q$, 'bloqueado');
END $matriz$;

\set QUIET off
\echo ''
\echo '======================================================================'
\echo 'MATRIZ DE VISIBILIDADE — existe = linhas reais · visivel = o que o papel vê'
\echo '======================================================================'
SELECT seccao,
       rpad(cenario, 52) AS cenario,
       rpad(papel, 14)   AS papel,
       lpad(existe::text, 6)  AS existe,
       lpad(coalesce(visivel::text, 'ERRO'), 7) AS visivel,
       CASE
         WHEN existe = 0                      THEN 'INCONCLUSIVO — sem dados'
         WHEN erro IS NOT NULL                THEN 'ERRO: ' || left(erro, 40)
         WHEN visivel = 0                     THEN 'BLOQUEADO'
         WHEN visivel = existe                THEN 'VÊ TUDO'
         ELSE 'VÊ ' || visivel || '/' || existe
       END AS veredicto
FROM resultado_rls ORDER BY seccao, cenario, papel;

\echo ''
\echo '--- sondas inconclusivas (o teste falhou, não a segurança) ---'
SELECT seccao || ' · ' || cenario || ' · ' || papel AS inconclusiva
FROM resultado_rls WHERE existe = 0;

\echo ''
\echo '=== ASSERÇÕES ==='
--
-- O isolamento entre empresas não é uma questão de opinião: tem de estar
-- bloqueado nos dois conjuntos de políticas. A visibilidade do mercado é que
-- está em aberto — por isso a secção 3 e a 5 não entram nas asserções, entram
-- na decisão.
--
-- Uma sonda inconclusiva conta como FALHA. Um teste que não conseguiu medir não
-- é um teste que passou.
WITH v AS (
  SELECT
    count(*) FILTER (WHERE seccao LIKE '4%' AND existe > 0
                       AND (visivel IS NULL OR visivel = 0 OR erro IS NOT NULL)) AS iso_ok,
    count(*) FILTER (WHERE seccao LIKE '4%') AS iso_total,
    count(*) FILTER (WHERE seccao LIKE '9%' AND cenario NOT LIKE '%avaliação%'
                       AND cenario NOT LIKE '%proposta%'
                       AND existe > 0 AND coalesce(visivel, 0) = 0) AS esc_ok,
    count(*) FILTER (WHERE seccao LIKE '9%' AND cenario NOT LIKE '%avaliação%'
                       AND cenario NOT LIKE '%proposta%') AS esc_total,
    count(*) FILTER (WHERE existe = 0) AS inconclusivas
  FROM resultado_rls
)
SELECT
  'isolamento entre empresas: ' || iso_ok || '/' || iso_total || E'\n' ||
  'escalada por UUID: '         || esc_ok || '/' || esc_total || E'\n' ||
  'sondas inconclusivas: '      || inconclusivas || E'\n\n' ||
  CASE WHEN iso_ok = iso_total AND esc_ok = esc_total AND inconclusivas = 0
       THEN (iso_total + esc_total) || ' PASS, 0 FAIL'
       ELSE ((iso_total - iso_ok) + (esc_total - esc_ok) + inconclusivas) ||
            ' FAIL de ' || (iso_total + esc_total + inconclusivas)
  END AS asserçoes
FROM v;
