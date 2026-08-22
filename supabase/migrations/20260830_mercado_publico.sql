-- ===========================================================================
-- Superfície pública do mercado — Opção C
--
-- A DECISÃO
--
-- Opção C: uma página pública limitada, com os dados completos atrás de sessão.
-- Nem A (mercado aberto, como o repositório fazia) nem B (tudo fechado, como a
-- produção faz hoje).
--
-- PORQUE NÃO SE FAZ COM RLS
--
-- A RLS isola **linhas, não colunas**. Uma política que deixasse `anon` ler as
-- cargas publicadas dar-lhe-ia a linha inteira: `budget_amount`,
-- `suggested_price`, a descrição em texto livre — onde as pessoas escrevem
-- números de telefone — e `tenant_id`. Foi medido na FASE 9 e é exactamente o
-- que a decisão proíbe. Não há meio-termo dentro dessa abordagem.
--
-- A ARQUITECTURA
--
-- Uma vista com lista branca de colunas, a correr com os direitos do dono.
--
--   · `loads` continua sem qualquer política para `anon`. A tabela não é
--     exposta, nem directa nem indirectamente.
--   · A vista pertence a `postgres`, dono de `loads`. Uma vista **sem**
--     `security_invoker` executa com os direitos do dono, e por isso atravessa
--     a RLS de `loads` — é este o mecanismo, e é deliberado.
--   · Como atravessa a RLS, o `WHERE` da vista é a única barreira. Está escrito
--     para ser restritivo primeiro: só `PUBLISHED`, só por atribuir, só dentro
--     da janela de recolha.
--
-- ATENÇÃO A QUEM ALTERAR ESTE FICHEIRO
--
-- O resto do projecto usa vistas com `security_invoker = true` (ver
-- `vehicle_compliance`). Esta é a excepção e tem de ser: com
-- `security_invoker = true` a vista respeitaria a RLS de `loads` e `anon` não
-- veria nada, o que anula o objectivo. Não «uniformize» isto sem perceber.
--
-- Acrescentar uma coluna a esta vista é acrescentá-la à Internet. A lista
-- abaixo é branca, não negra: o que não está, não sai.
-- ===========================================================================

DROP VIEW IF EXISTS public.mercado_publico;

CREATE VIEW public.mercado_publico AS
SELECT
  l.id,                       -- necessário para a ligação à página de detalhe
  l.reference,                -- CF-2026-000001; boa para partilha e indexação
  l.title,                    -- ver a nota sobre texto livre, mais abaixo
  l.cargo_type,
  l.weight_kg,
  l.volume_m3,
  l.required_vehicle_type,
  l.requires_refrigeration,
  l.is_urgent,
  l.distance_km,
  l.pickup_from,
  l.pickup_until,
  l.published_at,
  o.city     AS origem_cidade,
  o.province AS origem_provincia,
  d.city     AS destino_cidade,
  d.province AS destino_provincia
FROM public.loads l
JOIN public.locations o ON o.id = l.origin_id
JOIN public.locations d ON d.id = l.destination_id
WHERE l.status = 'PUBLISHED'
  AND l.assigned_trip_id IS NULL
  AND l.pickup_until > now()
  AND (l.expires_at IS NULL OR l.expires_at > now());

-- O que fica de fora, e porquê. Escrito para que a ausência seja legível:
--
--   budget_amount, suggested_price, currency  preço — publicar a tabela de
--                                             preços de um mercado de fretes é
--                                             decisão comercial, e a decisão foi
--                                             não a publicar
--   description                               texto livre; é lá que aparecem
--                                             telefones e emails
--   tenant_id, created_by, assigned_trip_id   identificadores internos
--   status, created_at, updated_at            estado interno
--   origin_id, destination_id                 chaves internas; sai a cidade e a
--                                             província, que é o que serve para
--                                             procurar
--
-- Nenhuma coluna de `users`, `tenants`, `documents` ou `offers` entra aqui, nem
-- por junção.

COMMENT ON VIEW public.mercado_publico IS
  'Superfície pública do mercado (Opção C). Lista branca de colunas sobre cargas PUBLISHED por atribuir. Corre com os direitos do dono e por isso atravessa a RLS de loads — o WHERE é a única barreira. NÃO expõe preço, descrição livre, contactos nem identificadores internos. Acrescentar uma coluna aqui é publicá-la na Internet.';

-- `security_invoker` fica por definir de propósito: o valor por omissão é
-- `false`, ou seja, direitos do dono. Deixá-lo explícito seria mais legível,
-- mas escrevê-lo como `true` por engano fecharia a vista sem ninguém dar por
-- isso — prefere-se a omissão documentada à opção fácil de inverter.
ALTER VIEW public.mercado_publico SET (security_barrier = true);

-- Só-leitura por PRIVILÉGIO, não por acidente.
--
-- Os `ALTER DEFAULT PRIVILEGES` do Supabase concedem ALL em cada objecto novo de
-- `public` a anon, authenticated e service_role — INSERT, UPDATE, DELETE e
-- TRUNCATE incluídos. Hoje isso não é explorável, porque a vista tem junção a
-- `locations` e por isso não é auto-actualizável: o PostgreSQL recusa com
-- «cannot insert into view». Foi medido em produção, como `anon`.
--
-- Só que essa protecção vem da FORMA da consulta, não dos privilégios. Bastava
-- alguém simplificar a vista para uma única tabela e a escrita passava a ser
-- aceite, sem que nada acusasse. Por isso os privilégios de escrita são
-- retirados um a um, e não com um `REVOKE ALL FROM PUBLIC` — que não toca em
-- `anon`, porque `anon` é um papel e não o PUBLIC.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.mercado_publico FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON public.mercado_publico TO anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- A outra metade da Opção C: fechar a porta que a vista veio substituir
--
-- Uma superfície pública segura não serve de nada se a insegura continuar
-- aberta ao lado. `loads_marketplace_read` diz apenas `status = 'PUBLISHED'`,
-- sem exigir sessão — e foi medido que `anon` lia a linha inteira, com
-- `budget_amount` e a descrição em texto livre.
--
-- Passa a exigir `auth.uid() IS NOT NULL`, e ganha os dois ramos que a produção
-- tem e o repositório perdera: quem transporta a carga e quem lhe fez proposta
-- continuam a vê-la depois de ela sair de PUBLISHED. Sem eles, o transportador
-- que ganhou o frete deixava de ver a carga no instante em que a ganhava.
--
-- `ALTER POLICY` e não DROP+CREATE: não se abre uma janela sem regra.
-- ---------------------------------------------------------------------------
DO $fechar$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
             AND tablename='loads' AND policyname='loads_marketplace_read') THEN
    ALTER POLICY loads_marketplace_read ON public.loads USING (
      (status = 'PUBLISHED'::load_status AND auth.uid() IS NOT NULL)
      OR (tenant_id = public.current_tenant_id())
      OR (assigned_trip_id IS NOT NULL AND public.cf_transporto_esta_carga(assigned_trip_id))
      OR public.cf_tenho_proposta_na_carga(id)
      OR public.is_platform_admin()
    );
    RAISE NOTICE 'loads_marketplace_read passou a exigir sessão';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
             AND tablename='trips' AND policyname='trips_marketplace_read') THEN
    ALTER POLICY trips_marketplace_read ON public.trips USING (
      (status = ANY (ARRAY['PUBLISHED'::trip_status, 'PARTIALLY_BOOKED'::trip_status])
        AND auth.uid() IS NOT NULL)
      OR (tenant_id = public.current_tenant_id())
      OR public.is_platform_admin()
    );
    RAISE NOTICE 'trips_marketplace_read passou a exigir sessão';
  END IF;
END $fechar$;

-- ---------------------------------------------------------------------------
-- Verificação: a lista branca é a que está escrita, e `loads` continua fechada
-- ---------------------------------------------------------------------------
DO $verificar$
DECLARE
  v_proibidas text;
  v_invoker   text;
  v_escrita   text;
BEGIN
  SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO v_proibidas
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'mercado_publico'
    AND column_name IN ('budget_amount','suggested_price','currency','description',
                        'tenant_id','created_by','assigned_trip_id','status',
                        'origin_id','destination_id','email','phone');
  IF v_proibidas IS NOT NULL THEN
    RAISE EXCEPTION 'mercado_publico expõe colunas proibidas: %', v_proibidas;
  END IF;

  SELECT option_value INTO v_invoker
  FROM pg_class c, pg_options_to_table(c.reloptions)
  WHERE c.relname = 'mercado_publico' AND option_name = 'security_invoker';
  IF v_invoker = 'true' THEN
    RAISE EXCEPTION 'mercado_publico com security_invoker=true: a vista respeitaria a RLS de loads e ficaria vazia para o público';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies
             WHERE schemaname = 'public' AND tablename IN ('loads','trips')
               AND permissive = 'PERMISSIVE' AND cmd IN ('SELECT','ALL')
               AND coalesce(qual,'') ~ 'PUBLISHED'
               AND coalesce(qual,'') !~ 'auth\.uid\(\)') THEN
    RAISE EXCEPTION 'loads/trips ainda deixam ler o que está publicado sem exigir sessão';
  END IF;

  SELECT string_agg(grantee||':'||privilege_type, ', ' ORDER BY grantee, privilege_type)
    INTO v_escrita
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name='mercado_publico'
    AND grantee IN ('anon','authenticated','service_role','PUBLIC')
    AND privilege_type <> 'SELECT';
  IF v_escrita IS NOT NULL THEN
    RAISE EXCEPTION 'mercado_publico ainda concede escrita: %', v_escrita;
  END IF;

  RAISE NOTICE 'mercado_publico: lista branca conforme, loads fechada ao público.';
END $verificar$;
