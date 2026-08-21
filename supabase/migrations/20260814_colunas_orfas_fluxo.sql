-- ===========================================================================
-- Quatro divergências de coluna que só o fluxo funcional revelou
--
-- COMO FORAM ENCONTRADAS
--
-- Não por leitura. A FASE 8 montou uma base do zero e tentou percorrer o
-- caminho real da plataforma — criar empresa, utilizador, carga, viagem,
-- proposta, acordo. Três etapas rebentaram com erros que nenhuma migração dá:
--
--   D · publicar carga
--       ERROR: record "new" has no field "confirmed_at"
--       → cf_trigger_load_confirmed_at() escreve NEW.confirmed_at
--
--   G · criar proposta
--       ERROR: column "oferta_criada_em" does not exist
--       → cf_apos_criar_proposta() marca a correspondência
--
-- As funções estão versionadas e com paridade MD5 desde 21/08. As colunas em
-- que elas escrevem é que nunca entraram em ficheiro nenhum. Uma função certa a
-- escrever numa coluna que não existe é uma função que rebenta.
--
-- A quarta apareceu ao comparar as 31 tabelas coluna a coluna: `trips.waypoints`
-- é `NOT NULL DEFAULT '[]'::jsonb` em produção e nulável na reconstrução.
-- Passava despercebida porque o teste não fornecia waypoints — e em produção o
-- valor por omissão tapava o buraco.
--
-- VALORES EXACTOS, verificados no catálogo da produção a 21/08/2026:
--
--   loads.confirmed_at         timestamptz, nulável, sem default
--   matches.oferta_criada_em   timestamptz, nulável, sem default
--   matches.acordo_fechado_em  timestamptz, nulável, sem default
--   trips.waypoints            jsonb, NOT NULL, default '[]'::jsonb
--
-- Nenhuma tem restrição nem índice em produção.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ
--
-- Não altera nenhuma das funções. Não muda comportamento de negócio: repõe o
-- sítio onde o comportamento que já existe escreve.
-- ===========================================================================

ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS oferta_criada_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acordo_fechado_em TIMESTAMPTZ;

-- `waypoints`: a ordem importa. Preencher primeiro, só depois apertar — ao
-- contrário, o `SET NOT NULL` rebenta em qualquer base que já tenha viagens com
-- o valor a nulo. Numa base vazia não há diferença; numa base com dados, há.
UPDATE public.trips SET waypoints = '[]'::jsonb WHERE waypoints IS NULL;
ALTER TABLE public.trips ALTER COLUMN waypoints SET DEFAULT '[]'::jsonb;
ALTER TABLE public.trips ALTER COLUMN waypoints SET NOT NULL;

COMMENT ON COLUMN public.loads.confirmed_at IS
  'Preenchida por cf_trigger_load_confirmed_at() na transição para CONFIRMED.';
COMMENT ON COLUMN public.matches.oferta_criada_em IS
  'Marcada por cf_apos_criar_proposta(): regista que esta correspondência gerou proposta.';
COMMENT ON COLUMN public.matches.acordo_fechado_em IS
  'Marcada por cf_trigger_match_resultado_acordo(): regista que esta correspondência terminou em acordo.';
