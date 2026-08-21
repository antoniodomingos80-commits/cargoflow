-- ===========================================================================
-- Pôr sob controlo de versões as funções que só existiam na base de dados
--
-- PORQUÊ
--
-- A auditoria do módulo de rastreio (21 de Agosto de 2026) encontrou algo mais
-- grave do que qualquer funcionalidade em falta: das 51 funções `cf_*` que
-- correm em produção, apenas 10 tinham SQL de origem no repositório — e essas
-- dez foram todas escritas nos últimos dois dias, no P0 e no P1.
--
-- As outras 41, mais 10 funções auxiliares sem prefixo, existiam APENAS na
-- base de dados viva. Entre elas está toda a lógica de negócio da plataforma:
-- propostas, acordos, correspondências, mensagens, carteira, rastreio,
-- entrega, avaliações e administração. E também `current_app_user_id()`, que
-- quase todas as outras chamam e que várias políticas RLS usam, e
-- `handle_new_auth_user()`, o gatilho que cria a conta e a empresa no registo.
--
-- A migração `20260819_p0_bloqueio_operacional.sql` chega a alterar nove
-- destas funções lendo-as com `pg_get_functiondef` da base de dados em
-- execução, porque não tinha o SQL de origem para as recriar. Isso é o sintoma
-- que torna o problema visível: se a base de dados se perdesse, o repositório
-- não a reconstruía.
--
-- O QUE ESTA MIGRAÇÃO É
--
-- Preservação, e nada mais. Cada definição foi extraída com
-- `pg_get_functiondef(oid)` e está aqui LITERALMENTE como corre em produção —
-- incluindo a assinatura, os tipos, os valores por omissão, `SECURITY
-- DEFINER`, `SET search_path`, os comentários em português e até o erro de
-- ortografia em `cf_confirmar_receccao`.
--
-- Nada foi corrigido, melhorado ou reformatado. Onde se encontraram problemas
-- (ver o fim do ficheiro), foram documentados e deixados como estão. Corrigir
-- durante a extração tornaria impossível provar que o repositório representa a
-- produção.
--
-- Todas usam `CREATE OR REPLACE`: aplicar isto a uma base de dados que já as
-- tem é uma operação sem efeito.
--
-- ONDE ESTÃO AS AUXILIARES
--
-- Saíram deste ficheiro para `20260812_funcoes_auxiliares.sql`. O teste de
-- reconstrução mostrou porquê: `current_app_user_id()` é precisa por
-- `20260821_p1_trust_compliance.sql`, e "p1" ordena antes de "versionar".
-- Auxiliares partilhadas têm de existir cedo.
--
-- O QUE NÃO ESTÁ AQUI
--
-- As 10 funções `cf_*` já versionadas no P0 e no P1 não são repetidas:
--   cf_expirar_documentos, cf_proteger_campos_administrativos,
--   cf_recalcular_trust_score, cf_recalcular_trust_scores,
--   cf_registar_auditoria_trust, cf_trips_veiculo_elegivel, cf_trust_score,
--   cf_trust_score_autorizado, cf_trust_score_visivel, cf_veiculo_elegivel
--
-- Nem `current_tenant_id`, `current_user_id`, `is_platform_admin`,
-- `pode_operar`, `escrita_administrativa_permitida`, `set_updated_at` e
-- `set_payments_updated_at`, que já vivem em migrações anteriores.
-- ===========================================================================


-- ===========================================================================
-- RASTREIO E ENTREGA
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.cf_raio_tolerancia_m()
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$ SELECT 75000::numeric $function$
;

CREATE OR REPLACE FUNCTION public.cf_transporto_esta_carga(p_trip_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM trips t
    WHERE t.id = p_trip_id AND t.tenant_id = current_tenant_id()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.cf_garantir_particoes_futuras()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  d DATE := date_trunc('month', NOW())::date;
  i INT;
BEGIN
  -- Garantir os próximos 3 meses
  FOR i IN 0..3 LOOP
    PERFORM criar_particao_tracking(
      EXTRACT(YEAR FROM d + (i || ' months')::interval)::int,
      EXTRACT(MONTH FROM d + (i || ' months')::interval)::int
    );
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_registar_posicoes(p_trip_id uuid, p_pontos jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trip     RECORD;
  v_driver   UUID;
  v_ponto    JSONB;
  n          INT := 0;
BEGIN
  IF NOT public.pode_operar() THEN
    RAISE EXCEPTION 'A sua conta está bloqueada e não pode realizar esta operação.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_trip FROM trips WHERE id = p_trip_id;
  IF v_trip.id IS NULL THEN
    RAISE EXCEPTION 'Viagem não encontrada.';
  END IF;

  -- Só quem opera a viagem regista posições
  IF v_trip.tenant_id <> current_tenant_id() AND NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Sem permissão para registar posições nesta viagem.';
  END IF;

  SELECT id INTO v_driver FROM drivers WHERE user_id = current_app_user_id();

  FOR v_ponto IN SELECT * FROM jsonb_array_elements(p_pontos)
  LOOP
    -- Ignorar pontos com coordenadas inválidas ou precisão inaceitável
    CONTINUE WHEN (v_ponto->>'lat') IS NULL OR (v_ponto->>'lng') IS NULL;
    CONTINUE WHEN (v_ponto->>'lat')::numeric NOT BETWEEN -90 AND 90;
    CONTINUE WHEN (v_ponto->>'lng')::numeric NOT BETWEEN -180 AND 180;
    CONTINUE WHEN COALESCE((v_ponto->>'accuracy')::numeric, 0) > 500;

    INSERT INTO tracking_points (
      trip_id, driver_id, coordinates, speed_kmh, heading, accuracy_m, recorded_at
    ) VALUES (
      p_trip_id, v_driver,
      ST_SetSRID(ST_MakePoint(
        (v_ponto->>'lng')::float8, (v_ponto->>'lat')::float8), 4326)::geography,
      NULLIF((v_ponto->>'speed')::numeric, 0),
      (v_ponto->>'heading')::numeric,
      (v_ponto->>'accuracy')::numeric,
      COALESCE((v_ponto->>'recorded_at')::timestamptz, NOW())
    );
    n := n + 1;
  END LOOP;

  RETURN n;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_percurso(p_trip_id uuid)
 RETURNS TABLE(lat double precision, lng double precision, recorded_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM trips t WHERE t.id = p_trip_id
      AND (t.tenant_id = current_tenant_id() OR is_platform_admin()
           OR EXISTS (SELECT 1 FROM loads l
                      WHERE l.assigned_trip_id = p_trip_id
                        AND l.tenant_id = current_tenant_id()))
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT ST_Y(tp.coordinates::geometry), ST_X(tp.coordinates::geometry), tp.recorded_at
  FROM (
    -- Um ponto a cada 5 minutos chega para desenhar o traçado
    SELECT DISTINCT ON (date_trunc('hour', recorded_at),
                        (EXTRACT(MINUTE FROM recorded_at)::int / 5))
           coordinates, recorded_at
    FROM tracking_points
    WHERE trip_id = p_trip_id
    ORDER BY date_trunc('hour', recorded_at),
             (EXTRACT(MINUTE FROM recorded_at)::int / 5),
             recorded_at
  ) tp
  ORDER BY tp.recorded_at ASC
  LIMIT 500;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_estado_rastreamento(p_load_id uuid)
 RETURNS TABLE(load_reference text, load_status load_status, trip_id uuid, origin_lat double precision, origin_lng double precision, origin_city text, destination_lat double precision, destination_lng double precision, destination_city text, atual_lat double precision, atual_lng double precision, atual_em timestamp with time zone, velocidade_kmh numeric, minutos_sem_sinal numeric, km_percorridos numeric, km_restantes numeric, progresso_pct numeric, eta timestamp with time zone, motorista_nome text, veiculo_matricula text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_load  RECORD;
  v_trip  RECORD;
  v_pos   RECORD;
  v_dist_total    NUMERIC;
  v_dist_restante NUMERIC;
  v_vel_media     NUMERIC;
BEGIN
  SELECT l.*, o.coordinates AS org, d.coordinates AS dst,
         o.city AS org_city, d.city AS dst_city
    INTO v_load
    FROM loads l
    JOIN locations o ON o.id = l.origin_id
    JOIN locations d ON d.id = l.destination_id
   WHERE l.id = p_load_id;

  IF v_load.id IS NULL THEN RETURN; END IF;

  IF v_load.tenant_id <> current_tenant_id()
     AND NOT is_platform_admin()
     AND NOT EXISTS (
       SELECT 1 FROM trips t
       WHERE t.id = v_load.assigned_trip_id AND t.tenant_id = current_tenant_id()
     ) THEN
    RETURN;
  END IF;

  SELECT t.*, v.plate AS matricula, u.full_name AS motorista
    INTO v_trip
    FROM trips t
    LEFT JOIN vehicles v ON v.id = t.vehicle_id
    LEFT JOIN drivers dr ON dr.id = t.driver_id
    LEFT JOIN users u ON u.id = dr.user_id
   WHERE t.id = v_load.assigned_trip_id;

  SELECT ST_Y(tp.coordinates::geometry) AS lat,
         ST_X(tp.coordinates::geometry) AS lng,
         tp.recorded_at AS quando,
         tp.speed_kmh   AS velocidade,
         tp.coordinates AS coord
    INTO v_pos
    FROM tracking_points tp
   WHERE tp.trip_id = v_load.assigned_trip_id
   ORDER BY tp.recorded_at DESC
   LIMIT 1;

  v_dist_total := ST_Distance(v_load.org, v_load.dst) / 1000 * 1.25;

  IF v_pos.lat IS NOT NULL THEN
    v_dist_restante := ST_Distance(v_pos.coord, v_load.dst) / 1000 * 1.25;

    -- Velocidade média das últimas 2h (ignorando paragens) — mais fiável
    -- que a instantânea para estimar chegada
    SELECT AVG(tp2.speed_kmh) INTO v_vel_media
      FROM tracking_points tp2
     WHERE tp2.trip_id = v_load.assigned_trip_id
       AND tp2.recorded_at > NOW() - INTERVAL '2 hours'
       AND tp2.speed_kmh > 5;
  END IF;

  RETURN QUERY SELECT
    v_load.reference,
    v_load.status,
    v_load.assigned_trip_id,
    ST_Y(v_load.org::geometry), ST_X(v_load.org::geometry), v_load.org_city,
    ST_Y(v_load.dst::geometry), ST_X(v_load.dst::geometry), v_load.dst_city,
    v_pos.lat, v_pos.lng, v_pos.quando, v_pos.velocidade,
    CASE WHEN v_pos.quando IS NULL THEN NULL
         ELSE ROUND(EXTRACT(EPOCH FROM (NOW() - v_pos.quando)) / 60) END,
    CASE WHEN v_dist_restante IS NULL THEN NULL
         ELSE ROUND(GREATEST(0, v_dist_total - v_dist_restante), 1) END,
    ROUND(v_dist_restante, 1),
    CASE WHEN v_dist_total > 0 AND v_dist_restante IS NOT NULL
         THEN ROUND(LEAST(100, GREATEST(0,
              (1 - v_dist_restante / v_dist_total) * 100)), 0)
         ELSE 0 END,
    CASE WHEN v_vel_media > 0 AND v_dist_restante IS NOT NULL
         THEN NOW() + (v_dist_restante / v_vel_media) * INTERVAL '1 hour'
         ELSE v_trip.estimated_arrival END,
    v_trip.motorista,
    v_trip.matricula;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_registar_evento(p_load_id uuid, p_tipo text, p_descricao text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_load  RECORD;
  v_id    UUID;
  v_novo  load_status;
BEGIN
  IF NOT public.pode_operar() THEN
    RAISE EXCEPTION 'A sua conta está bloqueada e não pode realizar esta operação.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_load FROM loads WHERE id = p_load_id;
  IF v_load.id IS NULL THEN RAISE EXCEPTION 'Carga não encontrada.'; END IF;

  -- Quem transporta ou quem é dono
  IF v_load.tenant_id <> current_tenant_id()
     AND NOT is_platform_admin()
     AND NOT EXISTS (
       SELECT 1 FROM trips t WHERE t.id = v_load.assigned_trip_id
         AND t.tenant_id = current_tenant_id()) THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;

  INSERT INTO tracking_events (load_id, event_type, description, coordinates, created_by)
  VALUES (
    p_load_id, p_tipo, p_descricao,
    CASE WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL
         THEN ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography END,
    current_app_user_id()
  ) RETURNING id INTO v_id;

  -- Transição de estado da carga conforme o evento
  v_novo := CASE p_tipo
    WHEN 'PICKED_UP'  THEN 'PICKED_UP'::load_status
    WHEN 'IN_TRANSIT' THEN 'IN_TRANSIT'::load_status
    WHEN 'DELIVERED'  THEN 'DELIVERED'::load_status
    ELSE NULL END;

  IF v_novo IS NOT NULL THEN
    UPDATE loads SET status = v_novo WHERE id = p_load_id;

    -- Notificar o dono da carga
    INSERT INTO notifications (user_id, type, title, body, action_url)
    VALUES (v_load.created_by, 'TRACKING_UPDATE',
            CASE p_tipo
              WHEN 'PICKED_UP'  THEN 'Carga recolhida'
              WHEN 'IN_TRANSIT' THEN 'Carga em trânsito'
              WHEN 'DELIVERED'  THEN 'Carga entregue'
              ELSE 'Atualização' END,
            v_load.reference || ': ' || p_descricao,
            '/rastreio/' || p_load_id);
  END IF;

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_registar_entrega(p_load_id uuid, p_recebido_por text, p_assinatura text DEFAULT NULL::text, p_fotos text[] DEFAULT '{}'::text[], p_notas text DEFAULT NULL::text, p_tem_danos boolean DEFAULT false, p_danos_desc text DEFAULT NULL::text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_load RECORD;
  v_id   UUID;
BEGIN
  IF NOT public.pode_operar() THEN
    RAISE EXCEPTION 'A sua conta está bloqueada e não pode realizar esta operação.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_load FROM loads WHERE id = p_load_id FOR UPDATE;
  IF v_load.id IS NULL THEN RAISE EXCEPTION 'Carga não encontrada.'; END IF;

  -- Só quem transporta regista a entrega
  IF NOT EXISTS (
    SELECT 1 FROM trips t
    WHERE t.id = v_load.assigned_trip_id AND t.tenant_id = current_tenant_id()
  ) AND NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Apenas o transportador pode registar a entrega.';
  END IF;

  IF v_load.status NOT IN ('PICKED_UP', 'IN_TRANSIT') THEN
    RAISE EXCEPTION 'A carga tem de estar em trânsito para poder ser entregue.';
  END IF;

  IF COALESCE(TRIM(p_recebido_por), '') = '' THEN
    RAISE EXCEPTION 'Indique quem recebeu a mercadoria.';
  END IF;

  INSERT INTO proof_of_delivery (
    load_id, delivered_by, received_by_name, signature_url, photo_urls,
    coordinates, notes, has_damage, damage_description, delivered_at
  ) VALUES (
    p_load_id, current_app_user_id(), TRIM(p_recebido_por), p_assinatura, p_fotos,
    CASE WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL
         THEN ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography END,
    p_notas, p_tem_danos, p_danos_desc, NOW()
  )
  ON CONFLICT (load_id) DO UPDATE SET
    received_by_name = EXCLUDED.received_by_name,
    signature_url = EXCLUDED.signature_url,
    photo_urls = EXCLUDED.photo_urls,
    notes = EXCLUDED.notes,
    has_damage = EXCLUDED.has_damage,
    damage_description = EXCLUDED.damage_description
  RETURNING id INTO v_id;

  UPDATE loads SET status = 'DELIVERED' WHERE id = p_load_id;

  INSERT INTO tracking_events (load_id, event_type, description, coordinates, created_by)
  VALUES (p_load_id, 'DELIVERED',
          'Entregue a ' || TRIM(p_recebido_por) ||
          CASE WHEN p_tem_danos THEN ' (com danos registados)' ELSE '' END,
          CASE WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL
               THEN ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography END,
          current_app_user_id());

  INSERT INTO notifications (user_id, type, title, body, action_url)
  VALUES (v_load.created_by, 'DELIVERED', 'Carga entregue',
          v_load.reference || ' foi entregue. Confirme a receção.',
          '/rastreio/' || p_load_id);

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_prova_entrega(p_load_id uuid)
 RETURNS TABLE(pod_id uuid, received_by_name text, signature_url text, photo_urls text[], notes text, has_damage boolean, damage_description text, delivered_at timestamp with time zone, confirmed_at timestamp with time zone, lat double precision, lng double precision, entregue_por text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM loads l
    WHERE l.id = p_load_id
      AND (l.tenant_id = current_tenant_id() OR is_platform_admin()
           OR EXISTS (SELECT 1 FROM trips t WHERE t.id = l.assigned_trip_id
                        AND t.tenant_id = current_tenant_id()))
  ) THEN RETURN; END IF;

  RETURN QUERY
  SELECT pod.id, pod.received_by_name, pod.signature_url, pod.photo_urls,
         pod.notes, pod.has_damage, pod.damage_description,
         pod.delivered_at, pod.confirmed_at,
         ST_Y(pod.coordinates::geometry), ST_X(pod.coordinates::geometry),
         u.full_name
  FROM proof_of_delivery pod
  JOIN users u ON u.id = pod.delivered_by
  WHERE pod.load_id = p_load_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_confirmar_receccao(p_load_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_load RECORD;
  v_carrier UUID;
BEGIN
  IF NOT public.pode_operar() THEN
    RAISE EXCEPTION 'A sua conta está bloqueada e não pode realizar esta operação.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_load FROM loads WHERE id = p_load_id FOR UPDATE;
  IF v_load.id IS NULL THEN RAISE EXCEPTION 'Carga não encontrada.'; END IF;

  IF v_load.tenant_id <> current_tenant_id() AND NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Apenas o dono da carga pode confirmar a receção.';
  END IF;

  IF v_load.status <> 'DELIVERED' THEN
    RAISE EXCEPTION 'A carga ainda não foi marcada como entregue.';
  END IF;

  UPDATE proof_of_delivery
     SET confirmed_by = current_app_user_id(), confirmed_at = NOW()
   WHERE load_id = p_load_id;

  UPDATE loads SET status = 'CONFIRMED' WHERE id = p_load_id;

  INSERT INTO tracking_events (load_id, event_type, description, created_by)
  VALUES (p_load_id, 'CONFIRMED', 'Receção confirmada pelo comerciante.',
          current_app_user_id());

  SELECT t.created_by INTO v_carrier FROM trips t WHERE t.id = v_load.assigned_trip_id;

  INSERT INTO notifications (user_id, type, title, body, action_url)
  VALUES (v_carrier, 'CONFIRMED', 'Entrega confirmada',
          v_load.reference || ': o comerciante confirmou a receção. Pode avaliar.',
          '/rastreio/' || p_load_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_avaliar(p_load_id uuid, p_rating smallint, p_pontualidade smallint DEFAULT NULL::smallint, p_comunicacao smallint DEFAULT NULL::smallint, p_estado_carga smallint DEFAULT NULL::smallint, p_profissional smallint DEFAULT NULL::smallint, p_comentario text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_load     RECORD;
  v_eu       UUID := current_app_user_id();
  v_avaliado UUID;
  v_id       UUID;
BEGIN
  IF NOT public.pode_operar() THEN
    RAISE EXCEPTION 'A sua conta está bloqueada e não pode realizar esta operação.' USING ERRCODE = '42501';
  END IF;
  IF p_rating NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'A classificação tem de ser entre 1 e 5.';
  END IF;

  SELECT l.*, t.created_by AS carrier_user
    INTO v_load
    FROM loads l
    LEFT JOIN trips t ON t.id = l.assigned_trip_id
   WHERE l.id = p_load_id;

  IF v_load.id IS NULL THEN RAISE EXCEPTION 'Carga não encontrada.'; END IF;

  -- Só se avalia depois de a operação estar concluída. Avaliar antes
  -- transformaria a reputação numa arma de pressão durante a negociação.
  IF v_load.status <> 'CONFIRMED' THEN
    RAISE EXCEPTION 'Só é possível avaliar após a confirmação da entrega.';
  END IF;

  -- Determinar quem avalia quem
  IF v_load.tenant_id = current_tenant_id() THEN
    v_avaliado := v_load.carrier_user;      -- comerciante avalia transportador
  ELSIF EXISTS (SELECT 1 FROM trips t WHERE t.id = v_load.assigned_trip_id
                  AND t.tenant_id = current_tenant_id()) THEN
    v_avaliado := v_load.created_by;        -- transportador avalia comerciante
  ELSE
    RAISE EXCEPTION 'Não participou nesta operação.';
  END IF;

  IF v_avaliado IS NULL OR v_avaliado = v_eu THEN
    RAISE EXCEPTION 'Não é possível avaliar.';
  END IF;

  INSERT INTO reviews (
    load_id, reviewer_id, reviewed_id, rating,
    punctuality, communication, cargo_condition, professionalism, comment
  ) VALUES (
    p_load_id, v_eu, v_avaliado, p_rating,
    p_pontualidade, p_comunicacao, p_estado_carga, p_profissional,
    NULLIF(TRIM(COALESCE(p_comentario, '')), '')
  )
  ON CONFLICT (load_id, reviewer_id) DO UPDATE SET
    rating = EXCLUDED.rating,
    punctuality = EXCLUDED.punctuality,
    communication = EXCLUDED.communication,
    cargo_condition = EXCLUDED.cargo_condition,
    professionalism = EXCLUDED.professionalism,
    comment = EXCLUDED.comment
  RETURNING id INTO v_id;

  INSERT INTO notifications (user_id, type, title, body, action_url)
  VALUES (v_avaliado, 'NEW_REVIEW', 'Nova avaliação',
          'Recebeu uma avaliação de ' || p_rating || ' estrelas.',
          '/rastreio/' || p_load_id);

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cf_avaliacoes_da_carga(p_load_id uuid)
 RETURNS TABLE(review_id uuid, rating smallint, punctuality smallint, communication smallint, cargo_condition smallint, professionalism smallint, comment text, created_at timestamp with time zone, autor_nome text, sou_eu boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_eu UUID := current_app_user_id();
BEGIN
  RETURN QUERY
  SELECT r.id, r.rating, r.punctuality, r.communication, r.cargo_condition,
         r.professionalism, r.comment, r.created_at, u.full_name,
         (r.reviewer_id = v_eu)
  FROM reviews r
  JOIN users u ON u.id = r.reviewer_id
  WHERE r.load_id = p_load_id
  ORDER BY r.created_at DESC;
END;
$function$
;


-- ===========================================================================
-- O QUE SE ENCONTROU AO LER ESTE CÓDIGO
--
-- Documentado, não corrigido. Corrigir durante a extração destruiria a prova
-- de que este ficheiro é a produção. Cada ponto é uma decisão a tomar depois.
-- ===========================================================================
--
-- 1. `cf_avaliacoes_da_carga` NÃO VERIFICA QUEM CHAMA
--
--    É SECURITY DEFINER — ignora o RLS — e devolve todas as avaliações de
--    qualquer `p_load_id` sem verificar se quem pergunta participou na
--    operação. Todas as outras funções de leitura deste ficheiro
--    (`cf_percurso`, `cf_estado_rastreamento`, `cf_prova_entrega`) fazem essa
--    verificação e devolvem vazio quando falha; esta não faz.
--
--    Um teste de isolamento feito a 21/08 devolveu 0 linhas para outra
--    empresa, mas esse resultado NÃO PROVA NADA: a tabela `reviews` tem zero
--    linhas em toda a plataforma. No dia em que houver avaliações, qualquer
--    conta autenticada poderá ler as de qualquer carga se souber o id.
--
--    Impacto hoje: nenhum, por ausência de dados. Amanhã: fuga entre empresas.
--
-- 2. `cf_registar_evento` ACEITA QUALQUER TEXTO EM `p_tipo`
--
--    O parâmetro é `text`, não um enum. Só três valores transitam o estado da
--    carga; os outros são gravados em `tracking_events.event_type` tal como
--    vierem. Não é uma falha de segurança — quem chama já tem de ser dono ou
--    transportador — mas deixa a coluna sem vocabulário fechado.
--
-- 3. `criar_particao_tracking` CRIA POLÍTICAS SEM `IF NOT EXISTS`
--
--    `CREATE TABLE IF NOT EXISTS` protege a tabela, mas os dois `CREATE
--    POLICY` a seguir rebentam se a partição já existir com as políticas
--    postas. Como `cf_garantir_particoes_futuras` corre mensalmente por
--    pg_cron sobre os 4 meses seguintes, reexecuções sobre partições já
--    criadas falham. Convém confirmar o histórico do job.
--
-- 4. `cf_garantir_particoes_futuras` NÃO É SECURITY DEFINER
--
--    Ao contrário de quase todas as outras. Corre com as permissões de quem
--    chama — hoje o pg_cron, que é privilegiado, por isso funciona. Se alguma
--    vez for chamada de outro contexto, falha.
--
-- 5. AS PARTIÇÕES DE `tracking_points` NÃO ESTÃO VERSIONADAS
--
--    São criadas dinamicamente por `criar_particao_tracking`, com as
--    políticas RLS embutidas no corpo da função. Existem cinco em produção
--    (2026_08 a 2026_12). O SQL que as define vive só dentro desta função —
--    o que agora, pelo menos, está versionado.
--
-- 6. `handle_new_auth_user` É O ÚNICO CAMINHO DE CRIAÇÃO DE CONTAS
--
--    Cria o tenant e o utilizador na mesma transação do registo, e recusa
--    PLATFORM_ADMIN e COMPANY_STAFF vindos dos metadados. Estava por
--    versionar. Se se perdesse, ninguém se conseguiria registar e não haveria
--    SQL de onde a reconstruir.
