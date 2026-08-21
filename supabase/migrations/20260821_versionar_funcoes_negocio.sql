-- ===========================================================================
-- Versionar as funções de negócio que só existiam na base de dados
--
-- Segundo e último passo da preservação começada em
-- `20260821_versionar_funcoes_rastreio.sql`. Aquele trouxe as 12 funções de
-- rastreio e entrega mais as 10 auxiliares de que dependem. Este traz as 29
-- que faltavam — e com elas fecha-se o buraco: a partir daqui, todas as 68
-- funções que correm em produção têm SQL de origem no repositório.
--
-- O que estas 29 são: propostas e acordos, o motor de correspondências,
-- mensagens, carteira e administração. Por outras palavras, o negócio.
-- `cf_aceitar_proposta` sozinha escreve em oito tabelas e é o que transforma
-- uma proposta num acordo com conversa aberta e viagem atribuída. Nada disto
-- tinha SQL versionado.
--
-- MESMO MÉTODO
--
-- Extraídas com `pg_get_functiondef(oid)` e coladas aqui LITERALMENTE, sem
-- uma vírgula mudada. Assinaturas, tipos, valores por omissão, SECURITY
-- DEFINER, SET search_path, comentários em português — e até os finais de
-- linha CRLF que dois destes gatilhos têm no corpo, e que sobreviveriam mal a
-- uma transcrição à mão.
--
-- Nada foi corrigido durante a extração. O que se encontrou está documentado
-- no fim do ficheiro e fica para commits próprios. Preservar primeiro,
-- corrigir depois: só assim se prova que este ficheiro é a produção.
--
-- Todas usam CREATE OR REPLACE — aplicar isto a uma base que já as tem não
-- faz nada.
--
-- ORDEM E DEPENDÊNCIAS
--
-- 1. Correspondências. `cf_viagem_por_partir` e `cf_pontuar_correspondencia`
--    primeiro, porque `cf_calcular_matches_*` chamam a segunda, e os gatilhos
--    `cf_trigger_matches_*` chamam essas. `cf_pontuar_correspondencia` chama
--    `cf_raio_tolerancia_m()`, que vive na migração de rastreio.
-- 2. Propostas. `cf_aceitar_proposta` depende de `current_app_user_id()` e
--    `current_tenant_id()`; a primeira está na migração de rastreio, a
--    segunda em `20260811_enable_rls_core.sql`.
-- 3. Mensagens, 4. Carteira, 5. Administração — sem dependências entre si.
--
-- Nenhuma função já versionada é repetida aqui.
-- ===========================================================================


CREATE OR REPLACE FUNCTION public.cf_viagem_por_partir(p_departure timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$ SELECT p_departure >= NOW() $function$
;

CREATE OR REPLACE FUNCTION public.cf_pontuar_correspondencia(p_load_id uuid, p_trip_id uuid)
 RETURNS TABLE(score numeric, breakdown jsonb)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  c RECORD;
  v RECORD;
  dist_origem   NUMERIC;
  dist_destino  NUMERIC;
  p_geografia   NUMERIC := 0;
  p_avaliacao   NUMERIC := 0;
  p_datas       NUMERIC := 0;
  p_capacidade  NUMERIC := 0;
  p_historico   NUMERIC := 0;
  p_retorno     NUMERIC := 0;
  total         NUMERIC;
  n_anteriores  INT;
BEGIN
  SELECT l.*, o.coordinates AS org_coord, d.coordinates AS dst_coord
    INTO c
    FROM loads l
    JOIN locations o ON o.id = l.origin_id
    JOIN locations d ON d.id = l.destination_id
   WHERE l.id = p_load_id;

  SELECT t.*, o.coordinates AS org_coord, d.coordinates AS dst_coord,
         ve.type AS tipo_veiculo, ve.has_refrigeration,
         u.rating_average, u.rating_count, u.verification AS user_verification,
         u.id AS transportador_user_id
    INTO v
    FROM trips t
    JOIN locations o ON o.id = t.origin_id
    JOIN locations d ON d.id = t.destination_id
    JOIN vehicles ve ON ve.id = t.vehicle_id
    JOIN users u ON u.id = t.created_by
   WHERE t.id = p_trip_id;

  IF c.id IS NULL OR v.id IS NULL THEN RETURN; END IF;

  -- ======================= FILTRO RÍGIDO ==================================

  IF c.tenant_id = v.tenant_id THEN RETURN; END IF;

  -- Receber propostas não fecha o negócio — é quando mais faz falta ter
  -- alternativas para comparar. Só a adjudicação encerra a procura.
  IF c.status NOT IN ('PUBLISHED', 'NEGOTIATING') THEN RETURN; END IF;
  IF v.status NOT IN ('PUBLISHED', 'PARTIALLY_BOOKED') THEN RETURN; END IF;

  IF v.available_weight_kg < c.weight_kg THEN RETURN; END IF;
  IF c.volume_m3 IS NOT NULL AND v.available_volume_m3 IS NOT NULL
     AND v.available_volume_m3 < c.volume_m3 THEN RETURN; END IF;

  IF c.required_vehicle_type IS NOT NULL
     AND v.tipo_veiculo <> c.required_vehicle_type THEN RETURN; END IF;

  IF c.requires_refrigeration AND NOT v.has_refrigeration THEN RETURN; END IF;

  IF v.departure_at < c.pickup_from - INTERVAL '1 day'
     OR v.departure_at > c.pickup_until THEN RETURN; END IF;

  dist_origem  := ST_Distance(c.org_coord, v.org_coord);
  dist_destino := ST_Distance(c.dst_coord, v.dst_coord);

  IF dist_origem > cf_raio_tolerancia_m()
     OR dist_destino > cf_raio_tolerancia_m() THEN RETURN; END IF;

  -- ======================= PONTUAÇÃO (0-100) ==============================

  p_geografia := 40 * (
    1 - ((dist_origem + dist_destino) / (2 * cf_raio_tolerancia_m()))
  );
  p_geografia := GREATEST(0, LEAST(40, p_geografia));

  IF v.rating_count > 0 AND v.rating_average IS NOT NULL THEN
    p_avaliacao := 20 * (v.rating_average / 5.0);
  ELSE
    p_avaliacao := 12;
  END IF;

  p_datas := 15 * (
    1 - (
      EXTRACT(EPOCH FROM (v.departure_at - c.pickup_from))
      / GREATEST(EXTRACT(EPOCH FROM (c.pickup_until - c.pickup_from)), 3600)
    ) * 0.5
  );
  p_datas := GREATEST(0, LEAST(15, p_datas));

  p_capacidade := 10 * LEAST(1.0, (c.weight_kg / NULLIF(v.available_weight_kg, 0)) / 0.8);
  p_capacidade := GREATEST(0, LEAST(10, p_capacidade));

  SELECT COUNT(*) INTO n_anteriores
    FROM agreements a
    JOIN loads l2 ON l2.id = a.load_id
   WHERE l2.tenant_id = c.tenant_id
     AND a.carrier_user_id = v.transportador_user_id;
  p_historico := LEAST(10, n_anteriores * 3.5);

  IF v.is_return_trip THEN p_retorno := 5; END IF;

  total := ROUND(p_geografia + p_avaliacao + p_datas + p_capacidade + p_historico + p_retorno, 2);

  RETURN QUERY SELECT
    total,
    jsonb_build_object(
      'geografia',   ROUND(p_geografia, 1),
      'avaliacao',   ROUND(p_avaliacao, 1),
      'datas',       ROUND(p_datas, 1),
      'capacidade',  ROUND(p_capacidade, 1),
      'historico',   ROUND(p_historico, 1),
      'retorno',     p_retorno,
      'dist_origem_km',  ROUND((dist_origem / 1000)::numeric, 1),
      'dist_destino_km', ROUND((dist_destino / 1000)::numeric, 1)
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_calcular_matches_carga(p_load_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  res RECORD;
  n INT := 0;
BEGIN
  DELETE FROM matches WHERE load_id = p_load_id;

  FOR r IN
    SELECT t.id FROM trips t
    WHERE t.status IN ('PUBLISHED', 'PARTIALLY_BOOKED')
      AND t.departure_at >= NOW()
  LOOP
    SELECT * INTO res FROM cf_pontuar_correspondencia(p_load_id, r.id);
    IF res.score IS NOT NULL THEN
      INSERT INTO matches (load_id, trip_id, score, score_breakdown, algorithm_version)
      VALUES (p_load_id, r.id, res.score, res.breakdown, 'rules-v1')
      ON CONFLICT (load_id, trip_id) DO UPDATE
        SET score = EXCLUDED.score, score_breakdown = EXCLUDED.score_breakdown;
      n := n + 1;
    END IF;
  END LOOP;

  RETURN n;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_calcular_matches_viagem(p_trip_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  res RECORD;
  n INT := 0;
BEGIN
  DELETE FROM matches WHERE trip_id = p_trip_id;

  FOR r IN
    SELECT l.id FROM loads l
    WHERE l.status IN ('PUBLISHED', 'NEGOTIATING')
      AND l.pickup_until >= NOW()
  LOOP
    SELECT * INTO res FROM cf_pontuar_correspondencia(r.id, p_trip_id);
    IF res.score IS NOT NULL THEN
      INSERT INTO matches (load_id, trip_id, score, score_breakdown, algorithm_version)
      VALUES (r.id, p_trip_id, res.score, res.breakdown, 'rules-v1')
      ON CONFLICT (load_id, trip_id) DO UPDATE
        SET score = EXCLUDED.score, score_breakdown = EXCLUDED.score_breakdown;
      n := n + 1;
    END IF;
  END LOOP;

  RETURN n;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_correspondencias_da_carga(p_load_id uuid)
 RETURNS TABLE(match_id uuid, score numeric, score_breakdown jsonb, trip_id uuid, trip_reference text, departure_at timestamp with time zone, estimated_arrival timestamp with time zone, available_weight_kg numeric, available_volume_m3 numeric, minimum_price numeric, currency character, is_return_trip boolean, origin_city text, origin_province text, destination_city text, destination_province text, vehicle_plate text, vehicle_type vehicle_type, has_refrigeration boolean, carrier_name text, carrier_rating numeric, carrier_rating_count integer, carrier_verified boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Só o dono da carga (ou admin) vê as suas correspondências
  IF NOT EXISTS (
    SELECT 1 FROM loads l
    WHERE l.id = p_load_id
      AND (l.tenant_id = current_tenant_id() OR is_platform_admin())
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    m.id, m.score, m.score_breakdown,
    t.id, t.reference, t.departure_at, t.estimated_arrival,
    t.available_weight_kg, t.available_volume_m3, t.minimum_price, t.currency,
    t.is_return_trip,
    o.city, o.province, d.city, d.province,
    v.plate, v.type, v.has_refrigeration,
    -- Apenas campos públicos do transportador
    u.full_name, u.rating_average, u.rating_count,
    (u.verification = 'APPROVED')
  FROM matches m
  JOIN trips t     ON t.id = m.trip_id
  JOIN locations o ON o.id = t.origin_id
  JOIN locations d ON d.id = t.destination_id
  JOIN vehicles v  ON v.id = t.vehicle_id
  JOIN users u     ON u.id = t.created_by
  WHERE m.load_id = p_load_id
    AND t.status IN ('PUBLISHED', 'PARTIALLY_BOOKED')
  ORDER BY m.score DESC
  LIMIT 20;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_correspondencias_da_viagem(p_trip_id uuid)
 RETURNS TABLE(match_id uuid, score numeric, score_breakdown jsonb, load_id uuid, load_reference text, title text, cargo_type cargo_type, weight_kg numeric, volume_m3 numeric, pickup_from timestamp with time zone, pickup_until timestamp with time zone, budget_amount numeric, currency character, is_urgent boolean, requires_refrigeration boolean, distance_km numeric, origin_city text, origin_province text, destination_city text, destination_province text, merchant_name text, merchant_rating numeric, merchant_rating_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM trips t
    WHERE t.id = p_trip_id
      AND (t.tenant_id = current_tenant_id() OR is_platform_admin())
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    m.id, m.score, m.score_breakdown,
    l.id, l.reference, l.title, l.cargo_type, l.weight_kg, l.volume_m3,
    l.pickup_from, l.pickup_until, l.budget_amount, l.currency,
    l.is_urgent, l.requires_refrigeration, l.distance_km,
    o.city, o.province, d.city, d.province,
    u.full_name, u.rating_average, u.rating_count
  FROM matches m
  JOIN loads l     ON l.id = m.load_id
  JOIN locations o ON o.id = l.origin_id
  JOIN locations d ON d.id = l.destination_id
  JOIN users u     ON u.id = l.created_by
  WHERE m.trip_id = p_trip_id
    AND l.status = 'PUBLISHED'
  ORDER BY m.score DESC
  LIMIT 20;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_trigger_matches_carga()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('PUBLISHED', 'NEGOTIATING') THEN
    DELETE FROM matches WHERE load_id = NEW.id;
    PERFORM cf_calcular_matches_carga(NEW.id);
  ELSIF TG_OP = 'UPDATE' AND OLD.status IN ('PUBLISHED', 'NEGOTIATING') THEN
    -- Adjudicada, cancelada ou expirada: já não procura mais ninguém
    DELETE FROM matches WHERE load_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_trigger_matches_viagem()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('PUBLISHED', 'PARTIALLY_BOOKED') THEN
    DELETE FROM matches WHERE trip_id = NEW.id;
    PERFORM cf_calcular_matches_viagem(NEW.id);
  ELSE
    DELETE FROM matches WHERE trip_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_trigger_match_resultado_oferta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.trip_id IS NOT NULL THEN
    UPDATE matches
       SET oferta_criada_em = NOW()
     WHERE load_id = NEW.load_id
       AND trip_id = NEW.trip_id
       AND oferta_criada_em IS NULL;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_trigger_match_resultado_acordo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE matches
     SET acordo_fechado_em = NOW()
   WHERE load_id = NEW.load_id
     AND trip_id = NEW.trip_id;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_tenho_proposta_na_carga(p_load_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM offers o
    JOIN trips t ON t.id = o.trip_id
    WHERE o.load_id = p_load_id
      AND t.tenant_id = current_tenant_id()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.cf_propostas_da_carga(p_load_id uuid)
 RETURNS TABLE(offer_id uuid, amount numeric, currency character, message text, status offer_status, created_at timestamp with time zone, expires_at timestamp with time zone, parent_offer_id uuid, trip_id uuid, trip_reference text, departure_at timestamp with time zone, estimated_arrival timestamp with time zone, available_weight_kg numeric, is_return_trip boolean, origin_city text, destination_city text, vehicle_plate text, vehicle_type vehicle_type, has_refrigeration boolean, proposer_name text, proposer_rating numeric, proposer_rating_count integer, proposer_verified boolean, match_score numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Só o dono da carga vê as propostas que recebeu
  IF NOT EXISTS (
    SELECT 1 FROM loads l
    WHERE l.id = p_load_id
      AND (l.tenant_id = current_tenant_id() OR is_platform_admin())
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    o.id, o.amount, o.currency, o.message, o.status, o.created_at,
    o.expires_at, o.parent_offer_id,
    t.id, t.reference, t.departure_at, t.estimated_arrival,
    t.available_weight_kg, t.is_return_trip,
    lo.city, ld.city,
    v.plate, v.type, v.has_refrigeration,
    u.full_name, u.rating_average, u.rating_count,
    (u.verification = 'APPROVED'),
    m.score
  FROM offers o
  LEFT JOIN trips t     ON t.id = o.trip_id
  LEFT JOIN locations lo ON lo.id = t.origin_id
  LEFT JOIN locations ld ON ld.id = t.destination_id
  LEFT JOIN vehicles v  ON v.id = t.vehicle_id
  JOIN users u          ON u.id = o.offered_by
  LEFT JOIN matches m   ON m.load_id = o.load_id AND m.trip_id = o.trip_id
  WHERE o.load_id = p_load_id
  ORDER BY
    -- Pendentes primeiro, depois por valor (o comerciante quer comparar)
    CASE o.status WHEN 'PENDING' THEN 0 ELSE 1 END,
    o.amount ASC,
    o.created_at DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_aceitar_proposta(p_offer_id uuid)
 RETURNS TABLE(agreement_id uuid, conversation_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_offer      RECORD;
  v_load       RECORD;
  v_trip       RECORD;
  v_agreement  UUID;
  v_conversa   UUID;
  v_carrier    UUID;
  v_merchant   UUID;
BEGIN
  IF NOT public.pode_operar() THEN
    RAISE EXCEPTION 'A sua conta está bloqueada e não pode realizar esta operação.' USING ERRCODE = '42501';
  END IF;
  -- Bloquear a proposta impede aceitação dupla em simultâneo
  SELECT * INTO v_offer FROM offers WHERE id = p_offer_id FOR UPDATE;
  IF v_offer.id IS NULL THEN
    RAISE EXCEPTION 'Proposta não encontrada.';
  END IF;
  IF v_offer.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Esta proposta já foi respondida.';
  END IF;

  -- Bloquear carga e viagem pela mesma razão
  SELECT * INTO v_load FROM loads WHERE id = v_offer.load_id FOR UPDATE;
  IF v_load.status NOT IN ('PUBLISHED', 'NEGOTIATING') THEN
    RAISE EXCEPTION 'Esta carga já não está disponível.';
  END IF;

  -- Só o dono da carga aceita propostas
  IF v_load.tenant_id <> current_tenant_id() AND NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Não tem permissão para aceitar esta proposta.';
  END IF;

  IF v_offer.trip_id IS NULL THEN
    RAISE EXCEPTION 'A proposta não está associada a nenhuma viagem.';
  END IF;

  SELECT * INTO v_trip FROM trips WHERE id = v_offer.trip_id FOR UPDATE;
  IF v_trip.status NOT IN ('PUBLISHED', 'PARTIALLY_BOOKED') THEN
    RAISE EXCEPTION 'A viagem já não está disponível.';
  END IF;

  -- Verificação final de capacidade — pode ter sido consumida entretanto
  IF v_trip.available_weight_kg < v_load.weight_kg THEN
    RAISE EXCEPTION 'A viagem já não tem espaço suficiente para esta carga.';
  END IF;

  v_merchant := v_load.created_by;
  v_carrier  := v_trip.created_by;

  -- 1. Registar o acordo (contrato da operação)
  INSERT INTO agreements (
    load_id, trip_id, accepted_offer_id,
    merchant_user_id, carrier_user_id,
    agreed_amount, currency, platform_fee, terms_snapshot
  ) VALUES (
    v_load.id, v_trip.id, v_offer.id,
    v_merchant, v_carrier,
    v_offer.amount, v_offer.currency, 0,
    -- Retrato das condições no momento do acordo: se a carga ou a viagem
    -- forem alteradas depois, o que foi acordado fica registado.
    jsonb_build_object(
      'carga', jsonb_build_object(
        'referencia', v_load.reference, 'titulo', v_load.title,
        'peso_kg', v_load.weight_kg, 'volume_m3', v_load.volume_m3,
        'tipo', v_load.cargo_type,
        'recolha_de', v_load.pickup_from, 'recolha_ate', v_load.pickup_until,
        'entrega_ate', v_load.delivery_deadline,
        'origem_id', v_load.origin_id, 'destino_id', v_load.destination_id
      ),
      'viagem', jsonb_build_object(
        'referencia', v_trip.reference, 'partida', v_trip.departure_at,
        'chegada_prevista', v_trip.estimated_arrival, 'veiculo_id', v_trip.vehicle_id
      ),
      'acordado_em', NOW()
    )
  ) RETURNING id INTO v_agreement;

  -- 2. Marcar a proposta como aceite
  UPDATE offers SET status = 'ACCEPTED', responded_at = NOW() WHERE id = p_offer_id;

  -- 3. Rejeitar as restantes propostas pendentes desta carga
  UPDATE offers
     SET status = 'REJECTED', responded_at = NOW()
   WHERE load_id = v_load.id AND id <> p_offer_id AND status = 'PENDING';

  -- 4. Atribuir a carga à viagem
  UPDATE loads
     SET status = 'ASSIGNED', assigned_trip_id = v_trip.id
   WHERE id = v_load.id;

  -- 5. Descontar a capacidade ocupada
  UPDATE trips
     SET available_weight_kg = available_weight_kg - v_load.weight_kg,
         available_volume_m3 = CASE
           WHEN available_volume_m3 IS NOT NULL AND v_load.volume_m3 IS NOT NULL
           THEN GREATEST(0, available_volume_m3 - v_load.volume_m3)
           ELSE available_volume_m3 END,
         status = CASE
           WHEN available_weight_kg - v_load.weight_kg <= 0 THEN 'FULL'::trip_status
           ELSE 'PARTIALLY_BOOKED'::trip_status END
   WHERE id = v_trip.id;

  -- 6. Abrir conversa entre as partes (se ainda não existir)
  SELECT id INTO v_conversa FROM conversations WHERE load_id = v_load.id LIMIT 1;
  IF v_conversa IS NULL THEN
    INSERT INTO conversations (load_id) VALUES (v_load.id) RETURNING id INTO v_conversa;
    INSERT INTO conversation_participants (conversation_id, user_id)
      VALUES (v_conversa, v_merchant), (v_conversa, v_carrier)
      ON CONFLICT DO NOTHING;
  END IF;

  -- Registo na linha temporal da operação
  INSERT INTO tracking_events (load_id, event_type, description, created_by)
  VALUES (v_load.id, 'AGREEMENT_REACHED', 'Proposta aceite — transporte adjudicado.', v_merchant);

  -- Notificar o transportador
  INSERT INTO notifications (user_id, type, title, body, action_url)
  VALUES (
    v_carrier, 'OFFER_ACCEPTED',
    'Proposta aceite',
    'A sua proposta para ' || v_load.reference || ' foi aceite.',
    '/viagens/' || v_trip.id
  );

  RETURN QUERY SELECT v_agreement, v_conversa;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_rejeitar_proposta(p_offer_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_offer RECORD;
  v_load  RECORD;
BEGIN
  IF NOT public.pode_operar() THEN
    RAISE EXCEPTION 'A sua conta está bloqueada e não pode realizar esta operação.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_offer FROM offers WHERE id = p_offer_id FOR UPDATE;
  IF v_offer.id IS NULL THEN
    RAISE EXCEPTION 'Proposta não encontrada.';
  END IF;
  IF v_offer.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Esta proposta já foi respondida.';
  END IF;

  SELECT * INTO v_load FROM loads WHERE id = v_offer.load_id;

  IF v_load.tenant_id <> current_tenant_id() AND NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Apenas o dono da carga pode recusar propostas.';
  END IF;

  UPDATE offers
     SET status = 'REJECTED', responded_at = NOW()
   WHERE id = p_offer_id;

  INSERT INTO notifications (user_id, type, title, body, action_url)
  VALUES (
    v_offer.offered_by, 'OFFER_REJECTED', 'Proposta recusada',
    v_load.reference || COALESCE(': ' || p_motivo, ' — o comerciante recusou a sua proposta.'),
    '/mercado/cargas/' || v_load.id
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_contrapropor_proposta(p_offer_id uuid, p_novo_valor numeric, p_mensagem text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_offer RECORD;
  v_load  RECORD;
  v_eu    UUID := current_app_user_id();
  v_nova  UUID;
BEGIN
  IF NOT public.pode_operar() THEN
    RAISE EXCEPTION 'A sua conta está bloqueada e não pode realizar esta operação.' USING ERRCODE = '42501';
  END IF;
  IF p_novo_valor <= 0 THEN
    RAISE EXCEPTION 'O valor tem de ser superior a zero.';
  END IF;

  SELECT * INTO v_offer FROM offers WHERE id = p_offer_id FOR UPDATE;
  IF v_offer.id IS NULL THEN
    RAISE EXCEPTION 'Proposta não encontrada.';
  END IF;
  IF v_offer.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Esta proposta já foi respondida.';
  END IF;
  IF v_offer.offered_by = v_eu THEN
    RAISE EXCEPTION 'Não pode contrapropor à sua própria proposta.';
  END IF;

  SELECT * INTO v_load FROM loads WHERE id = v_offer.load_id;

  -- Só as duas partes da negociação — comerciante da carga ou
  -- transportador da viagem — participam
  IF v_load.tenant_id <> current_tenant_id()
     AND NOT EXISTS (
       SELECT 1 FROM trips t WHERE t.id = v_offer.trip_id AND t.tenant_id = current_tenant_id()
     )
     AND NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Não faz parte desta negociação.';
  END IF;

  UPDATE offers SET status = 'COUNTERED', responded_at = NOW() WHERE id = p_offer_id;

  INSERT INTO offers (load_id, trip_id, offered_by, amount, currency, message, parent_offer_id)
  VALUES (v_offer.load_id, v_offer.trip_id, v_eu, p_novo_valor, v_offer.currency,
          p_mensagem, p_offer_id)
  RETURNING id INTO v_nova;

  -- A notificação da contraparte é tratada automaticamente pelo trigger
  -- cf_apos_criar_proposta, que já corre em qualquer inserção em offers.

  RETURN v_nova;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_convidar_transportador(p_load_id uuid, p_trip_id uuid, p_mensagem text DEFAULT NULL::text)
 RETURNS TABLE(conversation_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_load     RECORD;
  v_trip     RECORD;
  v_merchant UUID;
  v_carrier  UUID;
  v_conversa UUID;
  v_texto    TEXT;
BEGIN
  IF NOT public.pode_operar() THEN
    RAISE EXCEPTION 'A sua conta está bloqueada e não pode realizar esta operação.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_load FROM loads WHERE id = p_load_id;
  IF v_load.id IS NULL THEN
    RAISE EXCEPTION 'Carga não encontrada.';
  END IF;

  -- Só o dono da carga convida
  IF v_load.tenant_id <> current_tenant_id() AND NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Não tem permissão para contactar sobre esta carga.';
  END IF;

  IF v_load.status NOT IN ('PUBLISHED', 'NEGOTIATING') THEN
    RAISE EXCEPTION 'Esta carga já não está aberta a propostas.';
  END IF;

  SELECT * INTO v_trip FROM trips WHERE id = p_trip_id;
  IF v_trip.id IS NULL THEN
    RAISE EXCEPTION 'Viagem não encontrada.';
  END IF;
  IF v_trip.status NOT IN ('PUBLISHED', 'PARTIALLY_BOOKED') THEN
    RAISE EXCEPTION 'Esta viagem já não está disponível.';
  END IF;
  IF v_trip.tenant_id = v_load.tenant_id THEN
    RAISE EXCEPTION 'A viagem é da sua própria empresa.';
  END IF;

  v_merchant := v_load.created_by;
  v_carrier  := v_trip.created_by;

  -- Conversa por carga — se já existir, reaproveita-se
  SELECT id INTO v_conversa FROM conversations WHERE load_id = v_load.id LIMIT 1;
  IF v_conversa IS NULL THEN
    INSERT INTO conversations (load_id) VALUES (v_load.id) RETURNING id INTO v_conversa;
  END IF;

  INSERT INTO conversation_participants (conversation_id, user_id)
  VALUES (v_conversa, v_merchant), (v_conversa, v_carrier)
  ON CONFLICT DO NOTHING;

  v_texto := COALESCE(
    NULLIF(TRIM(p_mensagem), ''),
    'Olá. Tenho uma carga que parece encaixar na sua viagem ' || v_trip.reference ||
    '. Se tiver interesse, envie-me uma proposta.'
  );

  INSERT INTO messages (conversation_id, sender_id, content)
  VALUES (v_conversa, v_merchant, v_texto);

  -- A ligação leva o transportador direto ao ecrã onde pode propor
  INSERT INTO notifications (user_id, type, title, body, action_url, metadata)
  VALUES (
    v_carrier,
    'LOAD_INVITE',
    'Um comerciante contactou-o',
    v_load.reference || ' — ' || v_load.title,
    '/mercado/cargas/' || v_load.id,
    jsonb_build_object('load_id', v_load.id, 'trip_id', v_trip.id)
  );

  RETURN QUERY SELECT v_conversa;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_apos_criar_proposta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_load     RECORD;
  v_conversa UUID;
BEGIN
  SELECT * INTO v_load FROM loads WHERE id = NEW.load_id;

  IF v_load.status = 'PUBLISHED' THEN
    UPDATE loads SET status = 'NEGOTIATING' WHERE id = NEW.load_id;
  END IF;

  -- Conversa entre quem propõe e o dono da carga
  SELECT id INTO v_conversa FROM conversations WHERE load_id = NEW.load_id LIMIT 1;
  IF v_conversa IS NULL THEN
    INSERT INTO conversations (load_id) VALUES (NEW.load_id) RETURNING id INTO v_conversa;
  END IF;

  INSERT INTO conversation_participants (conversation_id, user_id)
  VALUES (v_conversa, NEW.offered_by), (v_conversa, v_load.created_by)
  ON CONFLICT DO NOTHING;

  -- Notificar a contraparte
  INSERT INTO notifications (user_id, type, title, body, action_url)
  SELECT
    CASE WHEN NEW.offered_by = v_load.created_by THEN
      (SELECT created_by FROM trips WHERE id = NEW.trip_id)
    ELSE v_load.created_by END,
    'NEW_OFFER', 'Nova proposta',
    'Recebeu uma proposta para ' || v_load.reference || '.',
    '/cargas/' || v_load.id
  WHERE NEW.status = 'PENDING';

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_minhas_conversas()
 RETURNS TABLE(conversation_id uuid, load_id uuid, load_reference text, load_title text, load_status load_status, origin_city text, destination_city text, outro_nome text, outro_verificado boolean, ultima_mensagem text, ultima_em timestamp with time zone, por_ler bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_eu UUID := current_app_user_id();
BEGIN
  IF v_eu IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    c.id, l.id, l.reference, l.title, l.status,
    lo.city, ld.city,
    outro.full_name,
    (outro.verification = 'APPROVED'),
    ult.content,
    ult.created_at,
    COALESCE(nl.n, 0)
  FROM conversations c
  JOIN conversation_participants meu ON meu.conversation_id = c.id AND meu.user_id = v_eu
  LEFT JOIN loads l      ON l.id = c.load_id
  LEFT JOIN locations lo ON lo.id = l.origin_id
  LEFT JOIN locations ld ON ld.id = l.destination_id
  -- A contraparte
  LEFT JOIN LATERAL (
    SELECT u.full_name, u.verification
    FROM conversation_participants cp
    JOIN users u ON u.id = cp.user_id
    WHERE cp.conversation_id = c.id AND cp.user_id <> v_eu
    LIMIT 1
  ) outro ON TRUE
  -- Última mensagem
  LEFT JOIN LATERAL (
    SELECT m.content, m.created_at
    FROM messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) ult ON TRUE
  -- Por ler
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS n
    FROM messages m
    WHERE m.conversation_id = c.id
      AND m.sender_id <> v_eu
      AND (meu.last_read_at IS NULL OR m.created_at > meu.last_read_at)
  ) nl ON TRUE
  ORDER BY COALESCE(ult.created_at, c.created_at) DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_mensagens_da_conversa(p_conversation_id uuid)
 RETURNS TABLE(message_id uuid, content text, attachment_url text, attachment_type text, created_at timestamp with time zone, sender_id uuid, sender_name text, sou_eu boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_eu UUID := current_app_user_id();
BEGIN
  -- Só participantes leem
  IF NOT EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = v_eu
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT m.id, m.content, m.attachment_url, m.attachment_type, m.created_at,
         m.sender_id, u.full_name, (m.sender_id = v_eu)
  FROM messages m
  JOIN users u ON u.id = m.sender_id
  WHERE m.conversation_id = p_conversation_id
  ORDER BY m.created_at ASC
  LIMIT 500;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_marcar_lida(p_conversation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE conversation_participants
     SET last_read_at = NOW()
   WHERE conversation_id = p_conversation_id
     AND user_id = current_app_user_id();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_notificar_mensagem()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_load  RECORD;
BEGIN
  SELECT l.id, l.reference INTO v_load
  FROM conversations c LEFT JOIN loads l ON l.id = c.load_id
  WHERE c.id = NEW.conversation_id;

  INSERT INTO notifications (user_id, type, title, body, action_url)
  SELECT cp.user_id, 'NEW_MESSAGE', 'Nova mensagem',
         COALESCE(v_load.reference || ': ', '') || LEFT(COALESCE(NEW.content, 'Anexo'), 80),
         '/mensagens/' || NEW.conversation_id
  FROM conversation_participants cp
  WHERE cp.conversation_id = NEW.conversation_id
    AND cp.user_id <> NEW.sender_id;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_trigger_wallet_hold()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trip_tenant UUID;
BEGIN
  IF NEW.status = 'PAID' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'PAID') THEN
    SELECT t.tenant_id INTO v_trip_tenant
    FROM agreements a
    JOIN trips t ON t.id = a.trip_id
    WHERE a.id = NEW.agreement_id;

    IF v_trip_tenant IS NOT NULL THEN
      INSERT INTO wallet_transactions (tenant_id, payment_id, agreement_id, amount, currency, status)
      VALUES (v_trip_tenant, NEW.id, NEW.agreement_id, NEW.amount, NEW.currency, 'RETIDO')
      ON CONFLICT (payment_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_trigger_wallet_release()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_agreement_id UUID;
BEGIN
  IF NEW.status = 'CONFIRMED' AND (OLD.status IS DISTINCT FROM 'CONFIRMED') THEN
    SELECT a.id INTO v_agreement_id FROM agreements a WHERE a.load_id = NEW.id;

    IF v_agreement_id IS NOT NULL THEN
      UPDATE wallet_transactions
         SET status = 'DISPONIVEL',
             disponivel_em = NOW()
       WHERE agreement_id = v_agreement_id
         AND status = 'RETIDO';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_trigger_load_confirmed_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'CONFIRMED' AND NEW.confirmed_at IS NULL THEN
    NEW.confirmed_at := NOW();
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_admin_indicadores()
 RETURNS TABLE(utilizadores_total bigint, utilizadores_pendentes bigint, empresas bigint, veiculos bigint, cargas_publicadas bigint, cargas_em_curso bigint, cargas_concluidas bigint, viagens_ativas bigint, correspondencias bigint, propostas_pendentes bigint, acordos bigint, valor_transacionado numeric, avaliacao_media numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_platform_admin() THEN RETURN; END IF;

  RETURN QUERY SELECT
    (SELECT COUNT(*) FROM users WHERE is_active),
    (SELECT COUNT(*) FROM users WHERE verification = 'PENDING' AND is_active),
    (SELECT COUNT(*) FROM tenants WHERE is_active),
    (SELECT COUNT(*) FROM vehicles WHERE is_active),
    (SELECT COUNT(*) FROM loads WHERE status = 'PUBLISHED'),
    (SELECT COUNT(*) FROM loads WHERE status IN ('ASSIGNED','PICKED_UP','IN_TRANSIT','DELIVERED')),
    (SELECT COUNT(*) FROM loads WHERE status = 'CONFIRMED'),
    (SELECT COUNT(*) FROM trips WHERE status IN ('PUBLISHED','PARTIALLY_BOOKED')),
    (SELECT COUNT(*) FROM matches),
    (SELECT COUNT(*) FROM offers WHERE status = 'PENDING'),
    (SELECT COUNT(*) FROM agreements),
    (SELECT COALESCE(SUM(agreed_amount), 0) FROM agreements),
    (SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_admin_operacoes()
 RETURNS TABLE(load_id uuid, reference text, title text, status load_status, origin_city text, destination_city text, weight_kg numeric, merchant_nome text, carrier_nome text, valor numeric, criado_em timestamp with time zone, ultima_posicao timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_platform_admin() THEN RETURN; END IF;

  RETURN QUERY
  SELECT l.id, l.reference, l.title, l.status, o.city, d.city, l.weight_kg,
         um.full_name, uc.full_name, a.agreed_amount, l.created_at,
         (SELECT MAX(tp.recorded_at) FROM tracking_points tp
           WHERE tp.trip_id = l.assigned_trip_id)
  FROM loads l
  JOIN locations o ON o.id = l.origin_id
  JOIN locations d ON d.id = l.destination_id
  JOIN users um ON um.id = l.created_by
  LEFT JOIN agreements a ON a.load_id = l.id
  LEFT JOIN users uc ON uc.id = a.carrier_user_id
  WHERE l.status NOT IN ('DRAFT', 'CANCELLED', 'EXPIRED')
  ORDER BY l.created_at DESC
  LIMIT 200;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_admin_verificacoes_pendentes()
 RETURNS TABLE(user_id uuid, full_name text, email text, phone text, role user_role, criado_em timestamp with time zone, tenant_id uuid, tenant_nome text, tenant_tipo text, tax_id text, n_documentos bigint, n_veiculos bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_platform_admin() THEN RETURN; END IF;

  RETURN QUERY
  SELECT u.id, u.full_name, u.email, u.phone, u.role, u.created_at,
         t.id, t.name, t.type, t.tax_id,
         (SELECT COUNT(*) FROM documents d WHERE d.tenant_id = t.id),
         (SELECT COUNT(*) FROM vehicles v WHERE v.tenant_id = t.id AND v.is_active)
  FROM users u
  JOIN tenants t ON t.id = u.tenant_id
  WHERE u.verification = 'PENDING' AND u.is_active
  ORDER BY u.created_at ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_admin_decidir_verificacao(p_user_id uuid, p_aprovar boolean, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user RECORD;
  v_novo verification_status;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;

  SELECT * INTO v_user FROM users WHERE id = p_user_id;
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Utilizador não encontrado.'; END IF;

  v_novo := CASE WHEN p_aprovar THEN 'APPROVED' ELSE 'REJECTED' END::verification_status;

  UPDATE users SET verification = v_novo WHERE id = p_user_id;

  -- A empresa fica verificada quando o seu primeiro utilizador for aprovado
  IF p_aprovar THEN
    UPDATE tenants SET verification = 'APPROVED' WHERE id = v_user.tenant_id;
    UPDATE vehicles SET verification = 'APPROVED'
     WHERE tenant_id = v_user.tenant_id AND verification = 'PENDING';
  END IF;

  INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, after_state)
  VALUES (v_user.tenant_id, current_app_user_id(),
          CASE WHEN p_aprovar THEN 'user.approved' ELSE 'user.rejected' END,
          'User', p_user_id,
          jsonb_build_object('verification', v_novo, 'motivo', p_motivo));

  INSERT INTO notifications (user_id, type, title, body, action_url)
  VALUES (p_user_id,
          CASE WHEN p_aprovar THEN 'ACCOUNT_APPROVED' ELSE 'ACCOUNT_REJECTED' END,
          CASE WHEN p_aprovar THEN 'Conta verificada' ELSE 'Verificação não aprovada' END,
          CASE WHEN p_aprovar
               THEN 'A sua conta foi verificada. Já pode publicar e negociar.'
               ELSE COALESCE(p_motivo, 'Contacte-nos para mais informações.') END,
          '/painel');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_expirar_anuncios()
 RETURNS TABLE(cargas_expiradas integer, viagens_expiradas integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  n_cargas  INT := 0;
  n_viagens INT := 0;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;

  -- Cargas: janela de recolha terminada e ainda sem transporte atribuído.
  -- Tolerância de 12 h — quem publica com recolha "até hoje" merece o dia.
  WITH expiradas AS (
    UPDATE loads
       SET status = 'EXPIRED'
     WHERE status IN ('DRAFT', 'PUBLISHED', 'NEGOTIATING')
       AND pickup_until < NOW() - INTERVAL '12 hours'
    RETURNING id
  )
  SELECT COUNT(*) INTO n_cargas FROM expiradas;

  -- Viagens: partida no passado e sem carga a bordo.
  WITH expiradas AS (
    UPDATE trips
       SET status = 'CANCELLED'
     WHERE status = 'PUBLISHED'
       AND departure_at < NOW() - INTERVAL '12 hours'
    RETURNING id
  )
  SELECT COUNT(*) INTO n_viagens FROM expiradas;

  -- Propostas pendentes sobre anúncios que morreram deixam de fazer sentido
  UPDATE offers o
     SET status = 'EXPIRED', responded_at = NOW()
    FROM loads l
   WHERE l.id = o.load_id
     AND o.status = 'PENDING'
     AND l.status = 'EXPIRED';

  -- E as que já passaram do próprio prazo de resposta
  UPDATE offers
     SET status = 'EXPIRED', responded_at = NOW()
   WHERE status = 'PENDING'
     AND expires_at IS NOT NULL
     AND expires_at < NOW();

  RETURN QUERY SELECT n_cargas, n_viagens;
END;
$function$
;


-- ===========================================================================
-- O QUE SE ENCONTROU AO LER ESTE CÓDIGO
--
-- Auditoria, não correcção. Cada ponto fica para um commit próprio.
-- ===========================================================================
--
-- 1. `cf_viagem_por_partir` É DECLARADA IMMUTABLE E USA NOW()
--
--      CREATE FUNCTION cf_viagem_por_partir(p_departure timestamptz)
--        RETURNS boolean LANGUAGE sql IMMUTABLE
--      AS $$ SELECT p_departure >= NOW() $$
--
--    IMMUTABLE é uma promessa ao planeador de que a mesma entrada dá sempre a
--    mesma saída. Esta função quebra essa promessa: depende do relógio. O
--    Postgres fica livre para a avaliar uma vez e reutilizar o resultado, ou
--    para a dobrar numa constante ao construir um índice. Devia ser STABLE.
--
--    É também a única das 29 SEM `SET search_path`, e a única executável por
--    `anon`. Não lê dados, por isso o risco prático é baixo — mas as três
--    coisas juntas fazem dela a mais frágil do conjunto.
--
-- 2. `cf_pontuar_correspondencia` ACEITA QUALQUER PAR DE IDs
--
--    É a única das 29 que NÃO é SECURITY DEFINER, e está acessível a
--    `authenticated`. Por ser INVOKER, o RLS aplica-se às suas consultas, o
--    que limita o estrago: quem a chamar só pontua o que já podia ver. Mas
--    aceita `p_load_id` e `p_trip_id` arbitrários e devolve a decomposição do
--    score, incluindo distâncias em quilómetros entre origens e destinos.
--    Para anúncios públicos do mercado isso é informação semi-pública; ainda
--    assim, é mais do que a interface mostra.
--
-- 3. `cf_calcular_matches_*` NÃO VALIDAM QUEM CHAMA — mas estão fechadas
--
--    São SECURITY DEFINER, aceitam qualquer id, e fazem DELETE + INSERT em
--    `matches`. Não verificam empresa nem utilizador. O que as salva é a
--    permissão: `authenticated` NÃO tem EXECUTE sobre nenhuma das duas
--    (confirmado a 21/08). Só correm por dentro, chamadas pelos gatilhos.
--
--    Fica registado porque a protecção está inteiramente no GRANT. Um
--    `GRANT EXECUTE ... TO authenticated` dado por distracção abriria a
--    qualquer conta a capacidade de apagar e reescrever as correspondências
--    de outra empresa.
--
-- 4. `cf_apos_criar_proposta` NÃO VERIFICA NADA — e não precisa
--
--    Gatilho AFTER INSERT em `offers`, SECURITY DEFINER, escreve em quatro
--    tabelas. Não valida chamador porque quem valida é a política RESTRICTIVE
--    de `offers` do P0: se a linha não pôde ser inserida, o gatilho não corre.
--    Registado para que ninguém o converta em função chamável.
--
-- 5. O QUE ESTÁ BEM, e vale a pena dizer
--
--    · As cinco funções que movem dinheiro ou fecham negócio — aceitar,
--      rejeitar, contrapropor, convidar — verificam `pode_operar()` e
--      levantam 42501 antes de escrever seja o que for.
--    · As quatro de mensagens confirmam que quem pergunta é participante da
--      conversa antes de devolver uma única linha.
--    · As quatro `cf_admin_*` e `cf_expirar_anuncios` verificam
--      `is_platform_admin()` e falham FECHADAS: devolvem vazio ou levantam
--      excepção, nunca dados.
--    · 28 das 29 fixam `SET search_path TO 'public'`.
