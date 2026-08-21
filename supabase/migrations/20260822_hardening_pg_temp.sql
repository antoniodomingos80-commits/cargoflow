-- ===========================================================================
-- Fechar a exposição a `pg_temp` — as 55 funções SECURITY DEFINER
--
-- O PROBLEMA
--
-- O Postgres pesquisa o esquema temporário ANTES de todos os outros para
-- nomes de relação, e continua a fazê-lo com `SET search_path TO 'public'`.
-- Uma função SECURITY DEFINER com `FROM users` sem esquema resolve para
-- `pg_temp.users` se essa tabela existir na sessão de quem chama.
--
-- PROVADO, em transação revertida (21/08/2026)
--
--   CREATE TEMP TABLE users (...); INSERT INTO pg_temp.users VALUES (...);
--     current_app_user_id()   →  o id forjado, em vez de nulo
--     cf_minhas_conversas()   →  0 conversas   ← em vez das 5 reais
--
-- Não é roubo de identidade apenas: com `current_app_user_id()` forjada, as
-- conversas da própria vítima desaparecem. É também negação de serviço.
--
-- PORQUE SÃO 55 E NÃO 46
--
-- A versão anterior deste ficheiro cobria 46 — as que referem relações sem
-- qualificar o esquema. As outras 9 resistem ao ataque por outra via: os
-- corpos escrevem `FROM public.users u`, e a qualificação explícita torna o
-- `search_path` irrelevante. Foram verificadas uma a uma e atacadas a sério
-- na FASE 7; nenhuma cedeu.
--
-- Passam a estar cobertas à mesma, por três razões:
--
--   · a protecção delas depende de cada linha do corpo continuar qualificada.
--     Uma edição futura que acrescente um `FROM users` reabre o buraco sem
--     que nada acuse;
--   · `pg_temp` no fim do search_path não custa nada e não muda semântica;
--   · com as 55 cobertas, a regra passa a ser universal — «toda a função
--     SECURITY DEFINER tem pg_temp» — e uma regra sem excepções é uma regra
--     que se consegue verificar.
--
-- As nove: cf_trigger_load_confirmed_at, cf_trust_score_autorizado,
-- cf_trust_score_visivel, current_tenant_id, current_user_id,
-- is_platform_admin, pode_operar, preparar_carga, preparar_viagem.
--
-- Três delas — `current_tenant_id`, `current_user_id`, `is_platform_admin` —
-- não tinham sequer `SET search_path`. Passam a ter.
--
-- PORQUÊ ESTA MITIGAÇÃO
--
-- Dois caminhos, ambos testados e ambos eficazes:
--
--   (1) qualificar `public.<tabela>` em cada referência — 27 tabelas em 46
--       corpos, milhares de linhas reescritas, cada uma uma oportunidade de
--       partir uma função de negócio;
--   (2) nomear `pg_temp` explicitamente no fim do search_path — uma linha por
--       função, corpo intocado.
--
-- Escolhida a (2). Quando `pg_temp` é nomeado, é pesquisado NA POSIÇÃO
-- indicada em vez de primeiro; pondo-o em último, `public` ganha sempre.
--
-- `ALTER FUNCTION ... SET` altera apenas a configuração. Os corpos ficam byte
-- a byte como estão — o que importa, porque foram provados idênticos à
-- produção nas migrações de preservação. Não há `DROP FUNCTION` nem
-- `CREATE OR REPLACE` neste ficheiro, de propósito.
--
-- IDEMPOTÊNCIA
--
-- `ALTER FUNCTION ... SET search_path` põe o valor; aplicar duas vezes dá o
-- mesmo resultado. Não se usa `IF EXISTS` — o PostgreSQL não o aceita aqui, e
-- também não se quereria: se uma destas funções não existir, a migração deve
-- parar em vez de seguir em silêncio.
--
-- O QUE NÃO MUDA
--
-- Lógica, assinaturas, tipos de retorno, SECURITY DEFINER, permissões,
-- `pode_operar()` e todas as outras barreiras. Uma chamada legítima devolve
-- exactamente o mesmo de antes. As assinaturas abaixo são as que
-- `pg_get_function_identity_arguments()` devolve, copiadas do catálogo da
-- produção a 21/08/2026.
-- ===========================================================================


-- --- Identidade e contexto do chamador -----------------------------------
ALTER FUNCTION public.current_app_user_id()
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.current_tenant_id()
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.current_user_id()
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.is_platform_admin()
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.is_verified_user()
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.pode_operar()
  SET search_path TO 'public', 'pg_temp';

-- --- Propostas e acordos -------------------------------------------------
ALTER FUNCTION public.cf_aceitar_proposta(p_offer_id uuid)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_apos_criar_proposta()
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_contrapropor_proposta(p_offer_id uuid, p_novo_valor numeric, p_mensagem text)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_convidar_transportador(p_load_id uuid, p_trip_id uuid, p_mensagem text)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_propostas_da_carga(p_load_id uuid)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_rejeitar_proposta(p_offer_id uuid, p_motivo text)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_trigger_match_resultado_acordo()
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_trigger_match_resultado_oferta()
  SET search_path TO 'public', 'pg_temp';

-- --- Correspondências ----------------------------------------------------
ALTER FUNCTION public.cf_calcular_matches_carga(p_load_id uuid)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_calcular_matches_viagem(p_trip_id uuid)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_correspondencias_da_carga(p_load_id uuid)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_correspondencias_da_viagem(p_trip_id uuid)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_trigger_matches_carga()
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_trigger_matches_viagem()
  SET search_path TO 'public', 'pg_temp';

-- --- Cargas e viagens ----------------------------------------------------
ALTER FUNCTION public.cf_expirar_anuncios()
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_trigger_load_confirmed_at()
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.preparar_carga()
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.preparar_viagem()
  SET search_path TO 'public', 'pg_temp';

-- --- Rastreio e entrega --------------------------------------------------
ALTER FUNCTION public.cf_estado_rastreamento(p_load_id uuid)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_percurso(p_trip_id uuid)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_prova_entrega(p_load_id uuid)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_registar_entrega(p_load_id uuid, p_recebido_por text, p_assinatura text, p_fotos text[], p_notas text, p_tem_danos boolean, p_danos_desc text, p_lat double precision, p_lng double precision)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_registar_evento(p_load_id uuid, p_tipo text, p_descricao text, p_lat double precision, p_lng double precision)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_registar_posicoes(p_trip_id uuid, p_pontos jsonb)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_confirmar_receccao(p_load_id uuid)
  SET search_path TO 'public', 'pg_temp';

-- --- Conversas e notificações --------------------------------------------
ALTER FUNCTION public.cf_marcar_lida(p_conversation_id uuid)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_mensagens_da_conversa(p_conversation_id uuid)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_minhas_conversas()
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_notificar_mensagem()
  SET search_path TO 'public', 'pg_temp';

-- --- Avaliações e reputação ----------------------------------------------
ALTER FUNCTION public.cf_avaliacoes_da_carga(p_load_id uuid)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_avaliar(p_load_id uuid, p_rating smallint, p_pontualidade smallint, p_comunicacao smallint, p_estado_carga smallint, p_profissional smallint, p_comentario text)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.recalculate_user_rating()
  SET search_path TO 'public', 'pg_temp';

-- --- Trust score ---------------------------------------------------------
ALTER FUNCTION public.cf_trust_score(p_user_id uuid)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_trust_score_autorizado(p_user_id uuid)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_trust_score_visivel(p_user_id uuid)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_recalcular_trust_score(p_user_id uuid)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_recalcular_trust_scores()
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_registar_auditoria_trust(p_action verification_action, p_entity_type text, p_entity_id uuid, p_tenant_id uuid, p_user_id uuid, p_admin_id uuid, p_estado_anterior text, p_estado_novo text, p_reason text, p_comment text, p_metadata jsonb)
  SET search_path TO 'public', 'pg_temp';

-- --- Verificação e administração -----------------------------------------
ALTER FUNCTION public.cf_admin_decidir_verificacao(p_user_id uuid, p_aprovar boolean, p_motivo text)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_admin_indicadores()
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_admin_operacoes()
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_admin_verificacoes_pendentes()
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_expirar_documentos()
  SET search_path TO 'public', 'pg_temp';

-- --- Predicados usados por políticas RLS ---------------------------------
ALTER FUNCTION public.cf_tenho_proposta_na_carga(p_load_id uuid)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_transporto_esta_carga(p_trip_id uuid)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_veiculo_elegivel(p_vehicle_id uuid)
  SET search_path TO 'public', 'pg_temp';

-- --- Carteira ------------------------------------------------------------
ALTER FUNCTION public.cf_trigger_wallet_hold()
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.cf_trigger_wallet_release()
  SET search_path TO 'public', 'pg_temp';

-- --- Contas --------------------------------------------------------------
ALTER FUNCTION public.handle_new_auth_user()
  SET search_path TO 'public', 'pg_temp';


-- ---------------------------------------------------------------------------
-- Verificação: nenhuma SECURITY DEFINER fica exposta
--
-- A regra é estrutural e não tem lista: uma função está protegida se tiver
-- `pg_temp` no search_path OU se não referir nenhuma relação de `public` sem
-- qualificar. Assim esta verificação continua a valer para funções que ainda
-- não existem — que é o ponto.
--
-- NOTA SOBRE O PADRÃO: usa-se `\y` e não `\b`. No Postgres, `\b` significa
-- backspace, não fronteira de palavra. A primeira versão desta verificação
-- usava `\b` e por isso não encontrava nada — dava-se por segura sem ter
-- verificado coisa nenhuma. Foi apanhado ao comparar o resultado da base de
-- dados (0) com o da análise dos ficheiros (46).
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_faltam text;
BEGIN
  SELECT string_agg(DISTINCT d.proname, ', ' ORDER BY d.proname) INTO v_faltam
  FROM (
    SELECT p.proname, p.prosrc, COALESCE(array_to_string(p.proconfig, ','), '') AS cfg
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM pg_depend dd
                      WHERE dd.objid = p.oid AND dd.deptype = 'e')
  ) d
  CROSS JOIN (
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'p')
  ) t
  WHERE d.cfg !~ 'pg_temp'
    AND d.prosrc ~* ('(FROM|JOIN|INTO|UPDATE)[[:space:]]+' || t.relname || '\y')
    AND d.prosrc !~* ('(FROM|JOIN|INTO|UPDATE)[[:space:]]+public\.' || t.relname || '\y');

  IF v_faltam IS NOT NULL THEN
    RAISE EXCEPTION 'Ficaram funções SECURITY DEFINER expostas a pg_temp: %', v_faltam;
  END IF;

  RAISE NOTICE 'Todas as funções SECURITY DEFINER estão protegidas contra pg_temp.';
END $$;
