-- ===========================================================================
-- Fluxo funcional mínimo contra uma base reconstruída
--
-- Responde a uma pergunta que «todas as migrações correram» não responde:
-- a base que sai do repositório consegue fazer o trabalho da plataforma?
--
-- Na FASE 7 a resposta era não. Zero erros de migração, e mesmo assim:
--   ERROR: null value in column "reference" of relation "loads"
--
-- Cada etapa corre isolada num bloco com tratamento de excepção, para que uma
-- falha não esconda as seguintes. Guarda-se o SQLSTATE, a mensagem exacta e o
-- objecto responsável.
--
-- LIMITE DESTE TESTE — importa saber
--
-- Corre como dono da base, e o dono não passa por RLS. Isto testa a canalização
-- (gatilhos, sequências, funções, restrições), não as políticas. A segunda
-- passagem, como `authenticated`, é que mede o que as políticas deixam fazer.
--
-- Correr: psql -v ON_ERROR_STOP=0 -f tests/reconstrucao-funcional.sql
-- ===========================================================================

\set QUIET on
\pset footer off

-- Temporária: o teste não deixa rasto no esquema que está a medir.
CREATE TEMP TABLE resultado_fluxo (
  ord       int,
  etapa     text,
  estado    text,
  sqlstate  text,
  erro      text,
  objecto   text
);

DO $fluxo$
DECLARE
  t_merc   UUID := '11111111-1111-1111-1111-111111111111';
  t_transp UUID := '11111111-1111-1111-1111-222222222222';
  u_merc   UUID := '22222222-1111-1111-1111-111111111111';
  u_transp UUID := '22222222-2222-2222-2222-222222222222';
  a_merc   UUID := '33333333-1111-1111-1111-111111111111';
  a_transp UUID := '33333333-2222-2222-2222-222222222222';
  l_orig   UUID := '44444444-1111-1111-1111-111111111111';
  l_dest   UUID := '44444444-2222-2222-2222-222222222222';
  v_veic   UUID;
  v_carga  UUID;
  v_viagem UUID;
  v_prop   UUID;
  v_acordo UUID;
  v_ref    TEXT;
  v_n      INT;
BEGIN
  -- Limpeza, para que o teste possa correr mais do que uma vez na mesma base.
  DELETE FROM public.tracking_events WHERE created_by IN (u_merc, u_transp);
  DELETE FROM public.agreements     WHERE merchant_user_id = u_merc;
  DELETE FROM public.offers         WHERE offered_by = u_transp;
  DELETE FROM public.matches        WHERE load_id IN (SELECT id FROM public.loads WHERE tenant_id = t_merc);
  DELETE FROM public.messages       WHERE sender_id IN (u_merc, u_transp);
  DELETE FROM public.conversation_participants WHERE user_id IN (u_merc, u_transp);
  DELETE FROM public.conversations  WHERE load_id IN (SELECT id FROM public.loads WHERE tenant_id = t_merc);
  DELETE FROM public.notifications  WHERE user_id IN (u_merc, u_transp);
  UPDATE public.loads SET assigned_trip_id = NULL WHERE tenant_id = t_merc;
  DELETE FROM public.loads          WHERE tenant_id = t_merc;
  DELETE FROM public.trips          WHERE tenant_id = t_transp;
  DELETE FROM public.drivers        WHERE tenant_id = t_transp;
  DELETE FROM public.vehicles       WHERE tenant_id = t_transp;
  DELETE FROM public.users          WHERE id IN (u_merc, u_transp);
  DELETE FROM public.locations      WHERE id IN (l_orig, l_dest);
  DELETE FROM public.tenants        WHERE id IN (t_merc, t_transp);

  ---------------------------------------------------------------- A
  BEGIN
    INSERT INTO public.tenants (id, name, slug, type) VALUES
      (t_merc,   'Comércio Teste',   'comercio-teste',   'EMPRESA'),
      (t_transp, 'Transportes Teste','transportes-teste','EMPRESA');
    INSERT INTO resultado_fluxo VALUES (1,'A · criar empresas','PASS',NULL,NULL,'tenants');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado_fluxo VALUES (1,'A · criar empresas','FAIL',SQLSTATE,SQLERRM,'tenants');
  END;

  ---------------------------------------------------------------- B
  BEGIN
    INSERT INTO public.users (id, tenant_id, auth_user_id, email, full_name, role, is_active) VALUES
      (u_merc,   t_merc,   a_merc,   'comerciante@teste.ao','Comerciante Teste','MERCHANT', true),
      (u_transp, t_transp, a_transp, 'transportador@teste.ao','Transportador Teste','CARRIER', true);
    INSERT INTO public.locations (id, name, city, province, coordinates) VALUES
      (l_orig, 'Luanda', 'Luanda', 'Luanda',
        ST_SetSRID(ST_MakePoint(13.2343, -8.8383), 4326)::geography),
      (l_dest, 'Huambo', 'Huambo', 'Huambo',
        ST_SetSRID(ST_MakePoint(15.7392, -12.7761), 4326)::geography);
    INSERT INTO public.vehicles (tenant_id, plate, type, max_weight_kg, is_active)
      VALUES (t_transp, 'LD-00-00-AA', 'HEAVY_TRUCK', 20000, true) RETURNING id INTO v_veic;
    INSERT INTO public.drivers (tenant_id, user_id) VALUES (t_transp, u_transp);
    INSERT INTO resultado_fluxo VALUES (2,'B · criar utilizadores, locais, veículo, motorista','PASS',NULL,NULL,'users/locations/vehicles/drivers');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado_fluxo VALUES (2,'B · criar utilizadores, locais, veículo, motorista','FAIL',SQLSTATE,SQLERRM,'users/locations/vehicles/drivers');
  END;

  ---------------------------------------------------------------- C
  BEGIN
    INSERT INTO public.loads
      (tenant_id, created_by, origin_id, destination_id, title, cargo_type,
       weight_kg, pickup_from, pickup_until)
    VALUES
      (t_merc, u_merc, l_orig, l_dest, 'Carga de teste', 'GENERAL',
       1000, now() + interval '1 day', now() + interval '3 days')
    RETURNING id, reference INTO v_carga, v_ref;

    IF v_ref IS NULL THEN
      RAISE EXCEPTION 'reference ficou NULL — preparar_carga() não correu';
    END IF;
    INSERT INTO resultado_fluxo VALUES (3,'C · criar carga (referência '||v_ref||')','PASS',NULL,NULL,'trg_preparar_carga → gerar_referencia → seq_load_reference');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado_fluxo VALUES (3,'C · criar carga','FAIL',SQLSTATE,SQLERRM,'trg_preparar_carga → gerar_referencia → seq_load_reference');
  END;

  ---------------------------------------------------------------- D
  BEGIN
    UPDATE public.loads SET status = 'PUBLISHED' WHERE id = v_carga;
    SELECT count(*) INTO v_n FROM public.loads
     WHERE id = v_carga AND status='PUBLISHED' AND published_at IS NOT NULL;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'published_at não foi preenchido por preparar_carga()';
    END IF;
    INSERT INTO resultado_fluxo VALUES (4,'D · publicar carga (published_at preenchido)','PASS',NULL,NULL,'trg_preparar_carga');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado_fluxo VALUES (4,'D · publicar carga','FAIL',SQLSTATE,SQLERRM,'trg_preparar_carga');
  END;

  ---------------------------------------------------------------- E
  BEGIN
    INSERT INTO public.trips
      (tenant_id, created_by, vehicle_id, origin_id, destination_id,
       available_weight_kg, departure_at)
    VALUES
      (t_transp, u_transp, v_veic, l_orig, l_dest, 15000, now() + interval '2 days')
    RETURNING id, reference INTO v_viagem, v_ref;

    IF v_ref IS NULL THEN
      RAISE EXCEPTION 'reference ficou NULL — preparar_viagem() não correu';
    END IF;
    INSERT INTO resultado_fluxo VALUES (5,'E · criar viagem (referência '||v_ref||')','PASS',NULL,NULL,'trg_preparar_viagem → gerar_referencia → seq_trip_reference');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado_fluxo VALUES (5,'E · criar viagem','FAIL',SQLSTATE,SQLERRM,'trg_preparar_viagem → gerar_referencia → seq_trip_reference');
  END;

  ---------------------------------------------------------------- F
  BEGIN
    UPDATE public.trips SET status = 'PUBLISHED' WHERE id = v_viagem;
    INSERT INTO resultado_fluxo VALUES (6,'F · publicar viagem','PASS',NULL,NULL,'trips');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado_fluxo VALUES (6,'F · publicar viagem','FAIL',SQLSTATE,SQLERRM,'trips');
  END;

  ---------------------------------------------------------------- F2
  BEGIN
    SELECT count(*) INTO v_n FROM public.matches WHERE load_id = v_carga;
    IF v_n = 0 THEN
      RAISE EXCEPTION 'nenhuma correspondência gerada para a carga';
    END IF;
    INSERT INTO resultado_fluxo VALUES (7,'F2 · correspondências geradas ('||v_n||')','PASS',NULL,NULL,'trg_matches_carga / trg_matches_viagem');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado_fluxo VALUES (7,'F2 · correspondências geradas','FAIL',SQLSTATE,SQLERRM,'trg_matches_carga / trg_matches_viagem');
  END;

  ---------------------------------------------------------------- G
  BEGIN
    INSERT INTO public.offers (load_id, trip_id, offered_by, amount)
    VALUES (v_carga, v_viagem, u_transp, 150000)
    RETURNING id INTO v_prop;
    INSERT INTO resultado_fluxo VALUES (8,'G · criar proposta','PASS',NULL,NULL,'offers + trg_apos_criar_proposta');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado_fluxo VALUES (8,'G · criar proposta','FAIL',SQLSTATE,SQLERRM,'offers + trg_apos_criar_proposta');
  END;

  ---------------------------------------------------------------- H
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', a_merc::text)::text, true);
    PERFORM public.cf_aceitar_proposta(v_prop);
    PERFORM set_config('request.jwt.claims', '', true);
    INSERT INTO resultado_fluxo VALUES (9,'H · aceitar proposta','PASS',NULL,NULL,'cf_aceitar_proposta → pode_operar/current_tenant_id');
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('request.jwt.claims', '', true);
    INSERT INTO resultado_fluxo VALUES (9,'H · aceitar proposta','FAIL',SQLSTATE,SQLERRM,'cf_aceitar_proposta → pode_operar/current_tenant_id');
  END;

  ---------------------------------------------------------------- I
  BEGIN
    SELECT id INTO v_acordo FROM public.agreements WHERE load_id = v_carga;
    IF v_acordo IS NULL THEN
      RAISE EXCEPTION 'nenhum acordo criado para a carga';
    END IF;
    SELECT count(*) INTO v_n FROM public.offers WHERE id = v_prop AND status='ACCEPTED';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'a proposta não ficou ACCEPTED';
    END IF;
    INSERT INTO resultado_fluxo VALUES (10,'I · acordo criado e proposta ACCEPTED','PASS',NULL,NULL,'agreements + trg_match_resultado_acordo');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado_fluxo VALUES (10,'I · acordo criado e proposta ACCEPTED','FAIL',SQLSTATE,SQLERRM,'agreements + trg_match_resultado_acordo');
  END;

  ---------------------------------------------------------------- J
  BEGIN
    -- Contar tudo seria errado: cf_aceitar_proposta já regista um
    -- AGREEMENT_REACHED. A primeira versão deste teste esperava 1 evento e
    -- encontrava 2 — e se tivesse escrito `>= 1` teria passado sem provar nada.
    -- Verifica-se cada evento pelo seu tipo.
    SELECT count(*) INTO v_n FROM public.tracking_events
     WHERE load_id = v_carga AND event_type = 'AGREEMENT_REACHED';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'cf_aceitar_proposta não registou AGREEMENT_REACHED (encontrados %)', v_n;
    END IF;

    INSERT INTO public.tracking_events (load_id, event_type, description, created_by)
    VALUES (v_carga, 'PICKED_UP', 'Carga recolhida no teste', u_transp);

    SELECT count(*) INTO v_n FROM public.tracking_events
     WHERE load_id = v_carga AND event_type = 'PICKED_UP';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'o evento PICKED_UP não ficou registado';
    END IF;
    INSERT INTO resultado_fluxo VALUES (11,'J · rastreio: AGREEMENT_REACHED automático + PICKED_UP manual','PASS',NULL,NULL,'tracking_events + cf_aceitar_proposta');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado_fluxo VALUES (11,'J · evento de rastreio','FAIL',SQLSTATE,SQLERRM,'tracking_events');
  END;

  ---------------------------------------------------------------- J2
  BEGIN
    -- `now()` é fixo dentro de uma transação, portanto `created_at` e
    -- `updated_at` de uma linha acabada de inserir são IGUAIS. A primeira
    -- versão comparava os dois e não podia passar nunca — nem provaria nada se
    -- passasse. Aqui insere-se com um `updated_at` antigo (não há gatilho
    -- BEFORE INSERT que o sobreponha) e verifica-se que o UPDATE o puxa para o
    -- presente. Isto exercita `trg_tenants_updated`, um dos catorze.
    INSERT INTO public.tenants (id, name, slug, type, updated_at)
    VALUES ('11111111-1111-1111-1111-333333333333','Relógio','relogio-teste','EMPRESA',
            TIMESTAMPTZ '2020-01-01 00:00:00+00');

    UPDATE public.tenants SET name = 'Relógio II'
     WHERE id = '11111111-1111-1111-1111-333333333333';

    SELECT count(*) INTO v_n FROM public.tenants
     WHERE id = '11111111-1111-1111-1111-333333333333'
       AND updated_at > TIMESTAMPTZ '2020-01-02 00:00:00+00';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'updated_at não avançou — trg_tenants_updated não correu';
    END IF;
    DELETE FROM public.tenants WHERE id = '11111111-1111-1111-1111-333333333333';
    INSERT INTO resultado_fluxo VALUES (12,'J2 · trg_tenants_updated actualiza updated_at','PASS',NULL,NULL,'trg_tenants_updated → set_updated_at');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado_fluxo VALUES (12,'J2 · updated_at mantido pelos gatilhos','FAIL',SQLSTATE,SQLERRM,'trg_users_updated → set_updated_at');
  END;
END $fluxo$;

\set QUIET off
\echo ''
\echo '=== FLUXO FUNCIONAL SOBRE A BASE RECONSTRUÍDA ==='
SELECT lpad(ord::text,2) || '  ' || rpad(estado,4) || '  ' || etapa AS resultado
FROM resultado_fluxo ORDER BY ord;

\echo ''
\echo '--- falhas, com o erro exacto ---'
SELECT etapa || E'\n     SQLSTATE ' || sqlstate || E'\n     ' || erro ||
       E'\n     objecto: ' || objecto AS detalhe
FROM resultado_fluxo WHERE estado = 'FAIL' ORDER BY ord;

\echo ''
SELECT count(*) FILTER (WHERE estado='PASS') || ' PASS, ' ||
       count(*) FILTER (WHERE estado='FAIL') || ' FAIL' AS total
FROM resultado_fluxo;
