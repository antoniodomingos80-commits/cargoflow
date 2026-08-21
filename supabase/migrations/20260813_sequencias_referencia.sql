-- ===========================================================================
-- As duas sequências que geram `loads.reference` e `trips.reference`
--
-- PORQUE ESTA MIGRAÇÃO EXISTE
--
-- A reconstrução numa base vazia (FASE 7, 21/08/2026) correu sem um único erro
-- de migração — e a base resultante não conseguia publicar uma carga:
--
--   INSERT INTO public.loads (…) VALUES (…);
--   ERROR:  null value in column "reference" of relation "loads"
--
-- A cadeia real, medida no catálogo da produção a 21/08/2026:
--
--   INSERT INTO loads
--     → trg_preparar_carga        BEFORE INSERT OR UPDATE, FOR EACH ROW
--     → preparar_carga()          NEW.reference IS NULL → gera
--     → gerar_referencia('CF', 'seq_load_reference')
--     → EXECUTE format('SELECT nextval(%L)', seq_nome)
--     → 'CF-' || ano || '-' || lpad(proximo, 6, '0')     ex.: CF-2026-000021
--
-- `loads.reference` é `text`, `NOT NULL`, **sem DEFAULT** e **sem identity**. A
-- coluna não sabe nada da sequência: quem as liga é a função, e quem chama a
-- função é o gatilho. Faltavam as duas pontas — a sequência (aqui) e o gatilho
-- (em `20260823_versionar_triggers_core.sql`).
--
-- O MECANISMO, NÃO O VALOR
--
-- Estas sequências são criadas a começar em 1, como em produção. **Não faço
-- `setval`.** Uma base reconstruída de raiz não tem cargas, e portanto não tem
-- razão para começar no número 22.
--
-- Para quem estiver a restaurar dados históricos, e só nesse caso, os valores
-- da produção a 21/08/2026 eram `seq_load_reference = 21` e
-- `seq_trip_reference = 23`. O `setval` pertence ao procedimento de restauro,
-- a seguir ao carregamento das linhas — não a esta migração.
--
-- INDEPENDENTES, DE PROPÓSITO
--
-- Nenhuma das duas é `OWNED BY` uma coluna, e é assim que a produção as tem.
-- Não é descuido: `gerar_referencia()` recebe o nome da sequência como texto e
-- chama-a por `EXECUTE`, portanto não existe dependência que o PostgreSQL
-- consiga registar. Pôr `OWNED BY` agora mudaria o comportamento de `DROP
-- TABLE` e afastaria o repositório da produção — que é o oposto do objectivo.
--
-- OS GRANTS
--
-- Reproduzidos tal como estão em produção (`rwU` = SELECT, UPDATE, USAGE para
-- `anon`, `authenticated` e `service_role`). Num projecto Supabase real isto
-- vem dos `ALTER DEFAULT PRIVILEGES` do próprio Supabase; numa base montada à
-- mão não vem, e sem eles a inserção falha para quem não é dono.
--
-- Observação, para o registo e não para agir aqui: `anon` tem `USAGE`, o que
-- permite a um chamador não autenticado fazer `SELECT nextval('…')` e queimar
-- números. Não expõe dados — abre buracos na numeração. Fica documentado como
-- o resto: preservar primeiro, decidir depois.
-- ===========================================================================

CREATE SEQUENCE IF NOT EXISTS public.seq_load_reference
  AS bigint
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  NO MAXVALUE
  CACHE 1
  NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS public.seq_trip_reference
  AS bigint
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  NO MAXVALUE
  CACHE 1
  NO CYCLE;

GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.seq_load_reference
  TO anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.seq_trip_reference
  TO anon, authenticated, service_role;

COMMENT ON SEQUENCE public.seq_load_reference IS
  'Alimenta gerar_referencia(''CF'', ''seq_load_reference'') a partir de preparar_carga(), disparada por trg_preparar_carga. Independente por desenho: a ligação é por nome, em EXECUTE, e não é registável como dependência.';
COMMENT ON SEQUENCE public.seq_trip_reference IS
  'Alimenta gerar_referencia(''VG'', ''seq_trip_reference'') a partir de preparar_viagem(), disparada por trg_preparar_viagem.';
