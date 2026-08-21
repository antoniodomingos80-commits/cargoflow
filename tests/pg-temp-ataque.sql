-- ===========================================================================
-- Ataque de sombra em pg_temp, executado — não inspeccionado
--
-- Este ficheiro não olha para metadados. Cria tabelas temporárias com o nome e
-- a estrutura das reais, chama as funções a sério, e compara o que elas
-- devolvem com o que devolveram sem ataque. Se o resultado muda, a função é
-- explorável. Se não muda, não é.
--
-- As sombras copiam a estrutura com `LIKE public.<tabela>` de propósito: uma
-- tabela vazia sem colunas faria a função rebentar, e um erro é fácil de
-- confundir com defesa. Assim a função corre até ao fim e devolve dados
-- errados — que é o que um atacante quer.
--
-- Correr contra uma base semeada por `tests/rls-semente.sql`:
--   psql -d <base> -f tests/pg-temp-ataque.sql
-- ===========================================================================

\set QUIET on
\pset footer off

CREATE TEMP TABLE resultado_ataque (
  ord      int,
  funcao   text,
  sem      text,
  com      text,
  veredicto text
);

-- Executa a função, devolve uma marca do resultado. Erros contam como marca,
-- porque um erro provocado por sombra também é exploração (negação de serviço).
CREATE OR REPLACE FUNCTION pg_temp.marca(p_sql text) RETURNS text
LANGUAGE plpgsql AS $m$
DECLARE r text;
BEGIN
  EXECUTE 'SELECT coalesce(md5(string_agg(x::text, ''|'' ORDER BY x::text)), ''<vazio>'') FROM (' || p_sql || ') AS x'
    INTO r;
  RETURN r;
EXCEPTION WHEN OTHERS THEN
  RETURN 'ERRO: ' || left(SQLERRM, 40);
END $m$;

DO $ataque$
DECLARE
  A    text := '33333333-3333-3333-3333-33333333aaaa';  -- comerciante, empresa A
  B    text := '33333333-3333-3333-3333-33333333bbbb';  -- transportador, empresa B
  ADM  text := '33333333-3333-3333-3333-3333333000ad';  -- admin de plataforma
  alvos text[][] := ARRAY[
    -- funcao | sql | quem chama
    ['current_app_user_id',      'SELECT public.current_app_user_id()', 'B'],
    ['cf_minhas_conversas',      'SELECT * FROM public.cf_minhas_conversas()', 'B'],
    -- B tenta registar posições na viagem da empresa A: sem ataque tem de falhar.
    ['cf_registar_posicoes',     'SELECT public.cf_registar_posicoes(''99999999-0000-0000-0000-0000000000a1''::uuid, ''[{"lat":-8.8,"lng":13.2,"recorded_at":"2026-08-21T10:00:00Z"}]''::jsonb)', 'B'],
    -- Estas duas só devolvem linhas ao dono da carga. Chamadas por B davam
    -- vazio por direito, e um vazio igual dos dois lados não prova nada.
    ['cf_propostas_da_carga',    'SELECT * FROM public.cf_propostas_da_carga(''88888888-0000-0000-0000-0000000000a1''::uuid)', 'A'],
    ['cf_correspondencias_da_carga','SELECT * FROM public.cf_correspondencias_da_carga(''88888888-0000-0000-0000-0000000000a1''::uuid)', 'A'],
    ['cf_admin_indicadores',     'SELECT * FROM public.cf_admin_indicadores()', 'ADM']
  ];
  i int;
  v_sem text;
  v_com text;
  v_sub text;
BEGIN
  FOR i IN 1 .. array_length(alvos, 1) LOOP
    v_sub := CASE alvos[i][3] WHEN 'ADM' THEN ADM WHEN 'A' THEN A ELSE B END;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_sub)::text, true);
    v_sem := pg_temp.marca(alvos[i][2]);
    INSERT INTO resultado_ataque VALUES (i, alvos[i][1], v_sem, NULL, NULL);
  END LOOP;
END $ataque$;

-- --------------------------------------------------------------------------
-- A armadilha. Estrutura igual à real, conteúdo forjado.
-- --------------------------------------------------------------------------
CREATE TEMP TABLE users                     (LIKE public.users INCLUDING DEFAULTS);
CREATE TEMP TABLE conversations             (LIKE public.conversations INCLUDING DEFAULTS);
CREATE TEMP TABLE conversation_participants (LIKE public.conversation_participants INCLUDING DEFAULTS);
CREATE TEMP TABLE loads                     (LIKE public.loads INCLUDING DEFAULTS);
CREATE TEMP TABLE trips                     (LIKE public.trips INCLUDING DEFAULTS);
CREATE TEMP TABLE offers                    (LIKE public.offers INCLUDING DEFAULTS);
CREATE TEMP TABLE matches                   (LIKE public.matches INCLUDING DEFAULTS);
CREATE TEMP TABLE tracking_points           (LIKE public.tracking_points INCLUDING DEFAULTS);

-- O atacante diz que é outra pessoa, de outra empresa.
INSERT INTO users (id, tenant_id, auth_user_id, email, full_name, role, is_active, is_blocked)
VALUES ('22222222-2222-2222-2222-22222222aaaa',
        '11111111-1111-1111-1111-11111111aaaa',
        '33333333-3333-3333-3333-33333333bbbb',
        'forjado@teste.ao', 'Identidade forjada', 'PLATFORM_ADMIN', true, false);

-- E que a viagem da vítima é dele.
INSERT INTO trips (id, tenant_id, created_by, vehicle_id, origin_id, destination_id,
                   reference, available_weight_kg, departure_at, status, waypoints)
SELECT id, '11111111-1111-1111-1111-11111111aaaa', created_by, vehicle_id, origin_id,
       destination_id, reference, available_weight_kg, departure_at, status, waypoints
FROM public.trips LIMIT 1;

-- Os planos das funções PL/pgSQL ficam em cache na sessão, e a primeira
-- chamada (a linha de base) resolveu `users` para `public.users`. Sem isto, a
-- segunda chamada pode reutilizar esse plano e a sombra parece não ter efeito
-- — um FALSO NEGATIVO. Foi exactamente o que aconteceu na primeira versão
-- deste ficheiro: dava «resistiu» a funções que se demonstrava serem
-- exploráveis quando chamadas ao nível de topo.
DISCARD PLANS;

DO $ataque2$
DECLARE
  A    text := '33333333-3333-3333-3333-33333333aaaa';
  B    text := '33333333-3333-3333-3333-33333333bbbb';
  ADM  text := '33333333-3333-3333-3333-3333333000ad';
  -- EXACTAMENTE a mesma lista do primeiro bloco. Se divergir, comparam-se
  -- coisas diferentes e o resultado não quer dizer nada — foi o que aconteceu
  -- na primeira versão deste ficheiro, que media a linha de base como A e o
  -- ataque como B, e dava «explorável» a funções que tinham resistido.
  alvos text[][] := ARRAY[
    ['current_app_user_id',      'SELECT public.current_app_user_id()', 'B'],
    ['cf_minhas_conversas',      'SELECT * FROM public.cf_minhas_conversas()', 'B'],
    ['cf_registar_posicoes',     'SELECT public.cf_registar_posicoes(''99999999-0000-0000-0000-0000000000a1''::uuid, ''[{"lat":-8.8,"lng":13.2,"recorded_at":"2026-08-21T10:00:00Z"}]''::jsonb)', 'B'],
    ['cf_propostas_da_carga',    'SELECT * FROM public.cf_propostas_da_carga(''88888888-0000-0000-0000-0000000000a1''::uuid)', 'A'],
    ['cf_correspondencias_da_carga','SELECT * FROM public.cf_correspondencias_da_carga(''88888888-0000-0000-0000-0000000000a1''::uuid)', 'A'],
    ['cf_admin_indicadores',     'SELECT * FROM public.cf_admin_indicadores()', 'ADM']
  ];
  i int;
  v_com text;
  v_sub text;
BEGIN
  FOR i IN 1 .. array_length(alvos, 1) LOOP
    v_sub := CASE alvos[i][3] WHEN 'ADM' THEN ADM WHEN 'A' THEN A ELSE B END;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_sub)::text, true);
    v_com := pg_temp.marca(alvos[i][2]);
    UPDATE resultado_ataque SET com = v_com WHERE ord = i;
  END LOOP;

  -- Uma linha de base vazia ou em erro não permite concluir nada: se a função
  -- já não devolvia nada antes do ataque, «não mudou» não é defesa. Isso é
  -- falha do teste, não prova de segurança.
  -- Duas leituras iguais significam que a sombra não teve efeito, mesmo quando
  -- as duas são o mesmo erro: uma guarda que rejeita antes e depois resistiu.
  -- Só é inconclusivo quando não havia nada para distinguir de início.
  UPDATE resultado_ataque
     SET veredicto = CASE
       WHEN sem = com AND sem = '<vazio>'
         THEN 'INCONCLUSIVO — sem linha de base'
       WHEN sem = com
         THEN 'resistiu'
       WHEN sem LIKE 'ERRO:%' AND com NOT LIKE 'ERRO:%'
         THEN 'EXPLORÁVEL — a guarda foi contornada'
       ELSE 'EXPLORÁVEL — o resultado mudou' END;
END $ataque2$;

\set QUIET off
\echo ''
\echo '=== ATAQUE pg_temp — resultado das funções, com e sem armadilha ==='
SELECT rpad(funcao, 30) || ' ' ||
       rpad(left(sem, 12), 14) || ' ' || rpad(left(coalesce(com, '?'), 12), 14) || ' ' || veredicto AS resultado
FROM resultado_ataque ORDER BY ord;

\echo ''
SELECT count(*) FILTER (WHERE veredicto LIKE 'EXPLOR%') || ' exploráveis, ' ||
       count(*) FILTER (WHERE veredicto LIKE 'INCONCLUSIVO%') || ' inconclusivas, de ' ||
       count(*) || ' sondas' AS total
FROM resultado_ataque;
