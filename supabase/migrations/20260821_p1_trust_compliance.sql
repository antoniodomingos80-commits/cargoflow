-- ===========================================================================
-- P1 — Trust & Compliance
--
-- Quatro peças, todas a correr sobre os dados que já existem:
--
--   1. Auditoria alargada — a tabela `verification_audit_log` passa a guardar
--      entidade, id, estado anterior e estado novo. Era o que faltava para
--      cumprir o requisito de "quem, o quê, antes, depois, porquê, quando".
--   2. Expiração real — `cf_expirar_documentos()` faz o que a UI já fingia:
--      transita documentos vencidos para EXPIRED e regista-o. Ligada ao
--      pg_cron. Até hoje o estado EXPIRED existia no enum e nada o escrevia.
--   3. Compliance da frota — vista `vehicle_compliance`, derivada dos
--      documentos do veículo e das datas de validade que já estavam em
--      `vehicles` e que nenhum ficheiro lia.
--   4. Trust Score — `cf_trust_score()` devolve o número E a decomposição.
--      Fórmula única, em SQL, para não haver duas versões a divergir.
--
-- Nada aqui altera RLS existente, `pode_operar()`, as políticas RESTRICTIVE
-- do P0, as RPCs de negócio, a autenticação ou as permissões por perfil.
--
-- Nota: o valor `UNDER_REVIEW` foi acrescentado ao enum `verification_status`
-- num passo separado — `ALTER TYPE ... ADD VALUE` não pode ser usado na mesma
-- transação em que o novo valor é referido.
--
--   ALTER TYPE public.verification_status
--     ADD VALUE IF NOT EXISTS 'UNDER_REVIEW' AFTER 'PENDING';
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Auditoria alargada
--
-- `admin_id` passa a poder ser nulo: as expirações são decididas pelo sistema,
-- não por uma pessoa, e inventar um administrador para elas seria falsificar
-- o registo.
-- ---------------------------------------------------------------------------
ALTER TABLE public.verification_audit_log
  ALTER COLUMN admin_id DROP NOT NULL;

ALTER TABLE public.verification_audit_log
  ADD COLUMN IF NOT EXISTS entity_type      TEXT,
  ADD COLUMN IF NOT EXISTS entity_id        UUID,
  ADD COLUMN IF NOT EXISTS estado_anterior  TEXT,
  ADD COLUMN IF NOT EXISTS estado_novo      TEXT;

COMMENT ON COLUMN public.verification_audit_log.admin_id IS
  'Quem decidiu. NULL significa decisão automática do sistema (ex.: expiração por validade).';

CREATE INDEX IF NOT EXISTS idx_verification_audit_entity
  ON public.verification_audit_log (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_verification_audit_user
  ON public.verification_audit_log (user_id, created_at DESC);

-- Uma função única de registo, para que nenhum caminho de código consiga
-- escrever um registo incompleto.
CREATE OR REPLACE FUNCTION public.cf_registar_auditoria_trust(
  p_action           verification_action,
  p_entity_type      TEXT,
  p_entity_id        UUID,
  p_tenant_id        UUID,
  p_user_id          UUID    DEFAULT NULL,
  p_admin_id         UUID    DEFAULT NULL,
  p_estado_anterior  TEXT    DEFAULT NULL,
  p_estado_novo      TEXT    DEFAULT NULL,
  p_reason           TEXT    DEFAULT NULL,
  p_comment          TEXT    DEFAULT NULL,
  p_metadata         JSONB   DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO verification_audit_log (
    action, entity_type, entity_id, tenant_id, user_id, admin_id,
    estado_anterior, estado_novo, reason, comment, metadata, document_id
  )
  VALUES (
    p_action, p_entity_type, p_entity_id, p_tenant_id, p_user_id, p_admin_id,
    p_estado_anterior, p_estado_novo, p_reason, p_comment, COALESCE(p_metadata, '{}'::jsonb),
    CASE WHEN p_entity_type = 'document' THEN p_entity_id ELSE NULL END
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Expiração de documentos
--
-- Só toca em documentos APROVADOS cuja validade já passou. Um documento
-- pendente que expira continua pendente — o problema dele é outro.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cf_expirar_documentos()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r  RECORD;
  n  INTEGER := 0;
BEGIN
  FOR r IN
    SELECT id, tenant_id, user_id, type, expires_at
    FROM documents
    WHERE verification = 'APPROVED'
      AND expires_at IS NOT NULL
      AND expires_at < CURRENT_DATE
  LOOP
    UPDATE documents SET verification = 'EXPIRED', updated_at = now() WHERE id = r.id;

    PERFORM cf_registar_auditoria_trust(
      'DOCUMENT_EXPIRED', 'document', r.id, r.tenant_id, r.user_id, NULL,
      'APPROVED', 'EXPIRED',
      'Validade ultrapassada em ' || to_char(r.expires_at, 'DD/MM/YYYY'),
      NULL,
      jsonb_build_object('tipo', r.type, 'expirou_em', r.expires_at)
    );

    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;

COMMENT ON FUNCTION public.cf_expirar_documentos() IS
  'Transita para EXPIRED os documentos aprovados cuja validade passou, com registo em auditoria. Corre diariamente por pg_cron.';

-- ---------------------------------------------------------------------------
-- 3. Compliance da frota
--
-- Três documentos são obrigatórios por veículo: registo, seguro e inspeção.
-- O estado sai da pior situação encontrada, por esta ordem:
--   expired > non_compliant > pending > compliant
--
-- `security_invoker` faz a vista respeitar o RLS de quem a consulta — sem
-- isto, a vista correria com as permissões de quem a criou e furava o
-- isolamento por empresa.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.vehicle_compliance;

CREATE VIEW public.vehicle_compliance
WITH (security_invoker = true)
AS
WITH obrigatorios AS (
  SELECT unnest(ARRAY['VEHICLE_REGISTRATION', 'INSURANCE', 'INSPECTION']::document_type[]) AS tipo
),
por_veiculo AS (
  SELECT
    v.id                AS vehicle_id,
    v.tenant_id,
    o.tipo,
    (
      SELECT d.verification
      FROM documents d
      WHERE d.vehicle_id = v.id AND d.type = o.tipo
      ORDER BY
        CASE d.verification WHEN 'APPROVED' THEN 0 WHEN 'UNDER_REVIEW' THEN 1
                            WHEN 'PENDING' THEN 2 WHEN 'EXPIRED' THEN 3 ELSE 4 END,
        d.created_at DESC
      LIMIT 1
    ) AS estado,
    (
      SELECT d.expires_at
      FROM documents d
      WHERE d.vehicle_id = v.id AND d.type = o.tipo AND d.verification = 'APPROVED'
      ORDER BY d.expires_at DESC NULLS LAST
      LIMIT 1
    ) AS valido_ate
  FROM vehicles v
  CROSS JOIN obrigatorios o
  WHERE v.is_active
),
datas_veiculo AS (
  SELECT
    v.id AS vehicle_id,
    LEAST(
      COALESCE(v.insurance_valid_until,  DATE '9999-12-31'),
      COALESCE(v.inspection_valid_until, DATE '9999-12-31')
    ) AS proxima_data
  FROM vehicles v
  WHERE v.is_active
)
SELECT
  v.id                                    AS vehicle_id,
  v.tenant_id,
  v.plate,
  v.verification                          AS verificacao_veiculo,
  COUNT(*) FILTER (WHERE p.estado = 'APPROVED')                          AS docs_aprovados,
  COUNT(*) FILTER (WHERE p.estado IN ('PENDING', 'UNDER_REVIEW'))        AS docs_em_analise,
  COUNT(*) FILTER (WHERE p.estado = 'REJECTED')                          AS docs_rejeitados,
  COUNT(*) FILTER (WHERE p.estado = 'EXPIRED')                           AS docs_expirados,
  COUNT(*) FILTER (WHERE p.estado IS NULL)                               AS docs_em_falta,
  ARRAY_REMOVE(ARRAY_AGG(p.tipo::text) FILTER (WHERE p.estado IS NULL), NULL) AS tipos_em_falta,
  LEAST(
    MIN(p.valido_ate) FILTER (WHERE p.valido_ate IS NOT NULL),
    (SELECT proxima_data FROM datas_veiculo dv WHERE dv.vehicle_id = v.id)
  )                                                                       AS valido_ate,
  CASE
    WHEN COUNT(*) FILTER (WHERE p.estado = 'EXPIRED') > 0
      OR MIN(p.valido_ate) FILTER (WHERE p.valido_ate IS NOT NULL) < CURRENT_DATE
      OR v.insurance_valid_until  < CURRENT_DATE
      OR v.inspection_valid_until < CURRENT_DATE
      THEN 'expired'
    WHEN COUNT(*) FILTER (WHERE p.estado = 'REJECTED') > 0
      THEN 'non_compliant'
    WHEN COUNT(*) FILTER (WHERE p.estado IS NULL) > 0
      OR COUNT(*) FILTER (WHERE p.estado IN ('PENDING', 'UNDER_REVIEW')) > 0
      THEN 'pending'
    ELSE 'compliant'
  END                                                                     AS estado_compliance
FROM vehicles v
JOIN por_veiculo p ON p.vehicle_id = v.id
WHERE v.is_active
GROUP BY v.id, v.tenant_id, v.plate, v.verification, v.insurance_valid_until, v.inspection_valid_until;

COMMENT ON VIEW public.vehicle_compliance IS
  'Estado de conformidade por veículo, derivado dos documentos do veículo e das datas de validade. Respeita o RLS de vehicles e documents.';

GRANT SELECT ON public.vehicle_compliance TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Trust Score
--
-- ATENÇÃO: existe uma segunda implementação desta regra, em TypeScript, em
-- `lib/trust/score.ts`. É ela que a aplicação usa; esta existe porque a tarefa
-- do pg_cron corre dentro da base de dados e não tem Node. Os pesos das duas
-- são comparados automaticamente por `tests/trust-score.mjs` — se mudar um
-- peso aqui sem mudar lá, o teste falha.
--
-- Seis fatores, peso fixo, total 100. Cada fator diz se TEM DADOS.
-- O score é calculado só sobre os fatores com dados e renormalizado — assim
-- uma conta nova e honesta não é castigada por ainda não ter histórico, e
-- continua a ver o que lhe falta para subir.
--
-- A função devolve a decomposição junto com o número. É de propósito: o
-- requisito era o utilizador conseguir responder a "porque tenho este nível".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cf_trust_score(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  u                 users%ROWTYPE;
  t                 tenants%ROWTYPE;
  v_fatores         JSONB := '[]'::jsonb;
  v_peso_total      NUMERIC := 0;
  v_pontos          NUMERIC := 0;
  v_score           INTEGER;

  v_docs_exigidos   INTEGER := 0;
  v_docs_validos    INTEGER := 0;
  v_docs_falta      TEXT[]  := '{}';

  v_veic_total      INTEGER := 0;
  v_veic_conformes  INTEGER := 0;
  v_tem_frota       BOOLEAN;

  v_acordos         INTEGER := 0;
  v_concluidos      INTEGER := 0;

  v_valor           NUMERIC;
  v_detalhe         TEXT;
BEGIN
  SELECT * INTO u FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'utilizador inexistente');
  END IF;
  SELECT * INTO t FROM tenants WHERE id = u.tenant_id;

  -- ---- Fator 1: identidade (20) --------------------------------------------
  v_valor := CASE WHEN u.verification = 'APPROVED' THEN 1 ELSE 0 END;
  v_detalhe := CASE u.verification
                 WHEN 'APPROVED'     THEN 'Identidade verificada'
                 WHEN 'UNDER_REVIEW' THEN 'Identidade em análise'
                 WHEN 'PENDING'      THEN 'Identidade por verificar'
                 WHEN 'REJECTED'     THEN 'Identidade recusada'
                 ELSE 'Verificação de identidade expirada'
               END;
  v_fatores := v_fatores || jsonb_build_object(
    'chave','identidade','rotulo','Identidade','peso',20,
    'valor',v_valor,'tem_dados',true,'detalhe',v_detalhe);
  v_peso_total := v_peso_total + 20;
  v_pontos := v_pontos + 20 * v_valor;

  -- ---- Fator 2: empresa (15) -----------------------------------------------
  v_valor := CASE WHEN t.verification = 'APPROVED' THEN 1 ELSE 0 END;
  v_detalhe := CASE t.verification
                 WHEN 'APPROVED'     THEN 'Empresa verificada'
                 WHEN 'UNDER_REVIEW' THEN 'Empresa em análise'
                 WHEN 'PENDING'      THEN 'Empresa por verificar'
                 WHEN 'REJECTED'     THEN 'Empresa recusada'
                 ELSE 'Verificação da empresa expirada'
               END;
  v_fatores := v_fatores || jsonb_build_object(
    'chave','empresa','rotulo','Empresa','peso',15,
    'valor',v_valor,'tem_dados',true,'detalhe',v_detalhe);
  v_peso_total := v_peso_total + 15;
  v_pontos := v_pontos + 15 * v_valor;

  -- ---- Fator 3: documentação (25) ------------------------------------------
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM documents d
      WHERE d.tenant_id = u.tenant_id
        AND d.type = vr.document_type
        AND d.verification = 'APPROVED'
        AND (d.expires_at IS NULL OR d.expires_at >= CURRENT_DATE)
    )),
    ARRAY_REMOVE(ARRAY_AGG(vr.document_type::text) FILTER (WHERE NOT EXISTS (
      SELECT 1 FROM documents d
      WHERE d.tenant_id = u.tenant_id
        AND d.type = vr.document_type
        AND d.verification = 'APPROVED'
        AND (d.expires_at IS NULL OR d.expires_at >= CURRENT_DATE)
    )), NULL)
  INTO v_docs_exigidos, v_docs_validos, v_docs_falta
  FROM verification_requirements vr
  WHERE vr.role = u.role AND vr.is_required;

  IF v_docs_exigidos > 0 THEN
    v_valor := v_docs_validos::numeric / v_docs_exigidos;
    v_fatores := v_fatores || jsonb_build_object(
      'chave','documentacao','rotulo','Documentação obrigatória','peso',25,
      'valor',v_valor,'tem_dados',true,
      'detalhe', v_docs_validos || ' de ' || v_docs_exigidos || ' documentos válidos',
      'em_falta', to_jsonb(COALESCE(v_docs_falta, '{}'::text[])));
    v_peso_total := v_peso_total + 25;
    v_pontos := v_pontos + 25 * v_valor;
  ELSE
    v_fatores := v_fatores || jsonb_build_object(
      'chave','documentacao','rotulo','Documentação obrigatória','peso',25,
      'valor',0,'tem_dados',false,'detalhe','Sem documentos exigidos para este perfil');
  END IF;

  -- ---- Fator 4: frota (15) -------------------------------------------------
  v_tem_frota := u.role IN ('CARRIER', 'COMPANY_ADMIN', 'COMPANY_STAFF');

  IF v_tem_frota THEN
    SELECT COUNT(*), COUNT(*) FILTER (WHERE vc.estado_compliance = 'compliant')
    INTO v_veic_total, v_veic_conformes
    FROM vehicle_compliance vc
    WHERE vc.tenant_id = u.tenant_id;
  END IF;

  IF v_tem_frota AND v_veic_total > 0 THEN
    v_valor := v_veic_conformes::numeric / v_veic_total;
    v_fatores := v_fatores || jsonb_build_object(
      'chave','frota','rotulo','Frota conforme','peso',15,
      'valor',v_valor,'tem_dados',true,
      'detalhe', v_veic_conformes || ' de ' || v_veic_total || ' veículos conformes');
    v_peso_total := v_peso_total + 15;
    v_pontos := v_pontos + 15 * v_valor;
  ELSE
    v_fatores := v_fatores || jsonb_build_object(
      'chave','frota','rotulo','Frota conforme','peso',15,
      'valor',0,'tem_dados',false,
      'detalhe', CASE WHEN v_tem_frota THEN 'Ainda não há veículos registados'
                      ELSE 'Não se aplica a este perfil' END);
  END IF;

  -- ---- Fator 5: cumprimento das operações (15) -----------------------------
  SELECT COUNT(*), COUNT(*) FILTER (WHERE l.status = 'CONFIRMED')
  INTO v_acordos, v_concluidos
  FROM agreements a
  JOIN loads l ON l.id = a.load_id
  WHERE a.merchant_user_id = p_user_id OR a.carrier_user_id = p_user_id;

  IF v_acordos > 0 THEN
    v_valor := v_concluidos::numeric / v_acordos;
    v_fatores := v_fatores || jsonb_build_object(
      'chave','operacoes','rotulo','Cumprimento das operações','peso',15,
      'valor',v_valor,'tem_dados',true,
      'detalhe', v_concluidos || ' de ' || v_acordos || ' operações concluídas',
      'concluidas', v_concluidos, 'total', v_acordos);
    v_peso_total := v_peso_total + 15;
    v_pontos := v_pontos + 15 * v_valor;
  ELSE
    v_fatores := v_fatores || jsonb_build_object(
      'chave','operacoes','rotulo','Cumprimento das operações','peso',15,
      'valor',0,'tem_dados',false,'detalhe','Ainda não há operações fechadas',
      'concluidas', 0, 'total', 0);
  END IF;

  -- ---- Fator 6: avaliações (10) --------------------------------------------
  IF COALESCE(u.rating_count, 0) > 0 AND u.rating_average IS NOT NULL THEN
    v_valor := LEAST(u.rating_average / 5.0, 1);
    v_fatores := v_fatores || jsonb_build_object(
      'chave','avaliacoes','rotulo','Avaliações recebidas','peso',10,
      'valor',v_valor,'tem_dados',true,
      'detalhe', round(u.rating_average, 1) || ' em 5, com ' || u.rating_count || ' avaliações');
    v_peso_total := v_peso_total + 10;
    v_pontos := v_pontos + 10 * v_valor;
  ELSE
    v_fatores := v_fatores || jsonb_build_object(
      'chave','avaliacoes','rotulo','Avaliações recebidas','peso',10,
      'valor',0,'tem_dados',false,'detalhe','Ainda não recebeu avaliações');
  END IF;

  -- ---- Resultado -----------------------------------------------------------
  IF v_peso_total = 0 THEN
    v_score := NULL;
  ELSE
    v_score := ROUND(100 * v_pontos / v_peso_total);
  END IF;

  RETURN jsonb_build_object(
    'user_id',        p_user_id,
    'score',          v_score,
    'peso_com_dados', v_peso_total,
    'peso_maximo',    100,
    'fatores',        v_fatores,
    'calculado_em',   now()
  );
END;
$$;

COMMENT ON FUNCTION public.cf_trust_score(UUID) IS
  'Pontuação de confiança e a sua decomposição. Calculada só sobre os fatores com dados e renormalizada; devolve score NULL quando não há dado nenhum.';

-- ---------------------------------------------------------------------------
-- Recálculo persistido
--
-- É a única via que escreve `users.trust_score`. Corre como dona da função
-- (postgres), por isso passa o gatilho de blindagem — e o utilizador, esse,
-- continua sem conseguir tocar na coluna.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cf_recalcular_trust_score(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_resultado JSONB;
  v_novo      NUMERIC;
  v_antigo    NUMERIC;
  v_tenant    UUID;
BEGIN
  v_resultado := cf_trust_score(p_user_id);
  IF v_resultado ? 'erro' THEN RETURN v_resultado; END IF;

  v_novo := (v_resultado->>'score')::numeric;
  SELECT trust_score, tenant_id INTO v_antigo, v_tenant FROM users WHERE id = p_user_id;

  IF v_novo IS DISTINCT FROM v_antigo THEN
    UPDATE users SET trust_score = v_novo, updated_at = now() WHERE id = p_user_id;

    PERFORM cf_registar_auditoria_trust(
      'TRUST_SCORE_RECALCULATED', 'user', p_user_id, v_tenant, p_user_id, NULL,
      v_antigo::text, v_novo::text, 'Recálculo automático', NULL,
      v_resultado->'fatores'
    );
  END IF;

  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.cf_recalcular_trust_scores()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r RECORD; n INTEGER := 0;
BEGIN
  FOR r IN SELECT id FROM users WHERE is_active AND deleted_at IS NULL LOOP
    PERFORM cf_recalcular_trust_score(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- ---------------------------------------------------------------------------
-- Quem pode chamar o quê
--
-- `cf_trust_score` é de leitura e só devolve o que o próprio já podia deduzir
-- sobre si. O recálculo NÃO é dado ao browser: quem o quiser forçar tem de
-- passar por uma Server Action com barreira de administrador.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.cf_trust_score(UUID)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cf_recalcular_trust_score(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cf_recalcular_trust_scores()    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cf_expirar_documentos()         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cf_registar_auditoria_trust(
  verification_action, TEXT, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cf_trust_score(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.cf_recalcular_trust_score(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.cf_recalcular_trust_scores() TO service_role;
GRANT EXECUTE ON FUNCTION public.cf_expirar_documentos() TO service_role;

-- ---------------------------------------------------------------------------
-- 4b. A porta por onde a aplicação entra
--
-- `cf_trust_score` fica fechada ao browser. O que a sessão pode chamar é o
-- invólucro, que autoriza antes de calcular: cada um só pergunta por si, o
-- administrador pode perguntar por qualquer um, e o servidor (sem JWT, ou
-- seja, service-role e pg_cron) passa.
--
-- Isto evita depender da service-role key para desenhar a página de
-- confiança — se a chave faltasse, a página deixava de funcionar.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cf_trust_score_autorizado(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NULL
      OR p_user_id = public.current_app_user_id()
      OR public.is_platform_admin();
$$;

CREATE OR REPLACE FUNCTION public.cf_trust_score_visivel(p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_alvo UUID;
BEGIN
  v_alvo := COALESCE(p_user_id, public.current_app_user_id());

  IF v_alvo IS NULL THEN
    RAISE EXCEPTION 'Sem sessão válida.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.cf_trust_score_autorizado(v_alvo) THEN
    RAISE EXCEPTION 'Não tem permissão para consultar esta pontuação.' USING ERRCODE = '42501';
  END IF;

  RETURN public.cf_trust_score(v_alvo);
END;
$$;

REVOKE ALL ON FUNCTION public.cf_trust_score_visivel(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cf_trust_score_visivel(UUID)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cf_trust_score_autorizado(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Agendamento
--
-- Uma vez por dia às 03:10 UTC: primeiro expirar, depois recalcular — por esta
-- ordem, para que o score do dia já reflicta as expirações da noite.
--
-- A tarefa fica CRIADA MAS EM PAUSA. A primeira execução altera dados reais
-- (expira documentos vencidos e reescreve `users.trust_score` em todas as
-- contas), e essa alteração precisa de aprovação explícita. Para a activar:
--
--   SELECT cron.alter_job(jobid, active := true)
--   FROM cron.job WHERE jobname = 'cf_expirar_documentos';
-- ---------------------------------------------------------------------------
SELECT cron.unschedule('cf_expirar_documentos')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cf_expirar_documentos');

SELECT cron.schedule(
  'cf_expirar_documentos',
  '10 3 * * *',
  $cron$ SELECT public.cf_expirar_documentos(); SELECT public.cf_recalcular_trust_scores(); $cron$
);

SELECT cron.alter_job(jobid, active := false)
FROM cron.job WHERE jobname = 'cf_expirar_documentos';
