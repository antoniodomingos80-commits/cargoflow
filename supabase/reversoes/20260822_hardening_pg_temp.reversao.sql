-- ===========================================================================
-- REVERSÃO de 20260822_hardening_pg_temp.sql
-- Repõe o search_path exactamente como estava em produção antes da aplicação,
-- verificado no catálogo a 21/08/2026: 52 funções com `search_path=public` e
-- 3 sem search_path nenhum. Não toca em corpos, assinaturas, SECURITY DEFINER,
-- permissões, políticas nem dados.
--
-- Estado prévio, para conferir depois de reverter:
--   definer_total      55
--   com_pg_temp         0
--   hash_corpos        e982969a4e9d3658faa237c701abbd1c
--   hash_assinaturas   1c1cb1bc3005b8892db09556ded74174
-- ===========================================================================

ALTER FUNCTION public.cf_aceitar_proposta(p_offer_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.cf_admin_decidir_verificacao(p_user_id uuid, p_aprovar boolean, p_motivo text) SET search_path TO 'public';
ALTER FUNCTION public.cf_admin_indicadores() SET search_path TO 'public';
ALTER FUNCTION public.cf_admin_operacoes() SET search_path TO 'public';
ALTER FUNCTION public.cf_admin_verificacoes_pendentes() SET search_path TO 'public';
ALTER FUNCTION public.cf_apos_criar_proposta() SET search_path TO 'public';
ALTER FUNCTION public.cf_avaliacoes_da_carga(p_load_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.cf_avaliar(p_load_id uuid, p_rating smallint, p_pontualidade smallint, p_comunicacao smallint, p_estado_carga smallint, p_profissional smallint, p_comentario text) SET search_path TO 'public';
ALTER FUNCTION public.cf_calcular_matches_carga(p_load_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.cf_calcular_matches_viagem(p_trip_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.cf_confirmar_receccao(p_load_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.cf_contrapropor_proposta(p_offer_id uuid, p_novo_valor numeric, p_mensagem text) SET search_path TO 'public';
ALTER FUNCTION public.cf_convidar_transportador(p_load_id uuid, p_trip_id uuid, p_mensagem text) SET search_path TO 'public';
ALTER FUNCTION public.cf_correspondencias_da_carga(p_load_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.cf_correspondencias_da_viagem(p_trip_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.cf_estado_rastreamento(p_load_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.cf_expirar_anuncios() SET search_path TO 'public';
ALTER FUNCTION public.cf_expirar_documentos() SET search_path TO 'public';
ALTER FUNCTION public.cf_marcar_lida(p_conversation_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.cf_mensagens_da_conversa(p_conversation_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.cf_minhas_conversas() SET search_path TO 'public';
ALTER FUNCTION public.cf_notificar_mensagem() SET search_path TO 'public';
ALTER FUNCTION public.cf_percurso(p_trip_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.cf_propostas_da_carga(p_load_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.cf_prova_entrega(p_load_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.cf_recalcular_trust_score(p_user_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.cf_recalcular_trust_scores() SET search_path TO 'public';
ALTER FUNCTION public.cf_registar_auditoria_trust(p_action verification_action, p_entity_type text, p_entity_id uuid, p_tenant_id uuid, p_user_id uuid, p_admin_id uuid, p_estado_anterior text, p_estado_novo text, p_reason text, p_comment text, p_metadata jsonb) SET search_path TO 'public';
ALTER FUNCTION public.cf_registar_entrega(p_load_id uuid, p_recebido_por text, p_assinatura text, p_fotos text[], p_notas text, p_tem_danos boolean, p_danos_desc text, p_lat double precision, p_lng double precision) SET search_path TO 'public';
ALTER FUNCTION public.cf_registar_evento(p_load_id uuid, p_tipo text, p_descricao text, p_lat double precision, p_lng double precision) SET search_path TO 'public';
ALTER FUNCTION public.cf_registar_posicoes(p_trip_id uuid, p_pontos jsonb) SET search_path TO 'public';
ALTER FUNCTION public.cf_rejeitar_proposta(p_offer_id uuid, p_motivo text) SET search_path TO 'public';
ALTER FUNCTION public.cf_tenho_proposta_na_carga(p_load_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.cf_transporto_esta_carga(p_trip_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.cf_trigger_load_confirmed_at() SET search_path TO 'public';
ALTER FUNCTION public.cf_trigger_match_resultado_acordo() SET search_path TO 'public';
ALTER FUNCTION public.cf_trigger_match_resultado_oferta() SET search_path TO 'public';
ALTER FUNCTION public.cf_trigger_matches_carga() SET search_path TO 'public';
ALTER FUNCTION public.cf_trigger_matches_viagem() SET search_path TO 'public';
ALTER FUNCTION public.cf_trigger_wallet_hold() SET search_path TO 'public';
ALTER FUNCTION public.cf_trigger_wallet_release() SET search_path TO 'public';
ALTER FUNCTION public.cf_trust_score(p_user_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.cf_trust_score_autorizado(p_user_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.cf_trust_score_visivel(p_user_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.cf_veiculo_elegivel(p_vehicle_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.current_app_user_id() SET search_path TO 'public';
ALTER FUNCTION public.current_tenant_id() RESET search_path;
ALTER FUNCTION public.current_user_id() RESET search_path;
ALTER FUNCTION public.handle_new_auth_user() SET search_path TO 'public';
ALTER FUNCTION public.is_platform_admin() RESET search_path;
ALTER FUNCTION public.is_verified_user() SET search_path TO 'public';
ALTER FUNCTION public.pode_operar() SET search_path TO 'public';
ALTER FUNCTION public.preparar_carga() SET search_path TO 'public';
ALTER FUNCTION public.preparar_viagem() SET search_path TO 'public';
ALTER FUNCTION public.recalculate_user_rating() SET search_path TO 'public';
