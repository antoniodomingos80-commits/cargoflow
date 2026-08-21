-- ===========================================================================
-- Os 14 gatilhos de `public` que existiam só em produção
--
-- PORQUE ESTA MIGRAÇÃO EXISTE
--
-- Uma função versionada não é um gatilho versionado. As 51 funções `cf_*` têm
-- paridade MD5 com a produção desde 21/08/2026, e mesmo assim a base
-- reconstruída não fazia nada: `preparar_carga()` existia, ninguém a chamava.
--
-- Produção tem 26 gatilhos em `public`. A reconstrução criava 12 — e os 12 com
-- definição idêntica, byte a byte. Faltavam estes 14. As definições abaixo são
-- cópias literais de `pg_get_triggerdef(oid)` a 21/08/2026.
--
-- IDEMPOTÊNCIA
--
-- `CREATE OR REPLACE TRIGGER` (PostgreSQL 14+; a produção corre 17.6). Escolhi
-- esta forma em vez de `DROP TRIGGER IF EXISTS` + `CREATE` de propósito: o
-- `DROP` removeria momentaneamente uma protecção activa numa base em serviço, e
-- a instrução era não remover gatilhos existentes. `OR REPLACE` substitui em
-- lugar, dentro da transação, sem janela em que o gatilho não existe.
--
-- ORDEM DE DISPARO
--
-- O PostgreSQL dispara, dentro do mesmo tempo e evento, por ordem alfabética do
-- nome. Isto importa em duas tabelas e é preservado por construção, porque os
-- nomes não mudam:
--
--   loads,  BEFORE UPDATE:  trg_load_confirmed_at  →  trg_loads_updated
--                           →  trg_preparar_carga
--   loads,  AFTER  UPDATE:  trg_matches_carga      →  trg_wallet_release
--
-- O prefixo `zz_` da blindagem administrativa e da elegibilidade de veículo não
-- é decorativo: garante que essas verificações correm **depois** de tudo o que
-- possa alterar a linha. Nenhum gatilho criado aqui usa esse prefixo, e nenhum
-- deles se intromete entre um `zz_` e o que ele protege.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ
--
-- Não cria nem substitui função nenhuma — todas as 14 funções já existem, e
-- alterá-las aqui desfaria a paridade MD5 provada. Não remove gatilhos. Não
-- toca em políticas RLS. A divergência de `loads`/`trips` continua por decidir
-- e continua intacta.
-- ===========================================================================

-- --- loads ----------------------------------------------------------------
-- Sem este, `reference` fica NULL e o INSERT morre no NOT NULL. É o gatilho
-- que faltava para a plataforma reconstruída ser utilizável.
CREATE OR REPLACE TRIGGER trg_preparar_carga
  BEFORE INSERT OR UPDATE ON public.loads
  FOR EACH ROW EXECUTE FUNCTION preparar_carga();

CREATE OR REPLACE TRIGGER trg_load_confirmed_at
  BEFORE UPDATE ON public.loads
  FOR EACH ROW EXECUTE FUNCTION cf_trigger_load_confirmed_at();

-- `UPDATE OF` com dez colunas: recalcular correspondências só quando muda algo
-- que as afecta. A lista é literal — tirar uma coluna muda o comportamento.
CREATE OR REPLACE TRIGGER trg_matches_carga
  AFTER INSERT OR UPDATE OF status, origin_id, destination_id, weight_kg,
    volume_m3, pickup_from, pickup_until, delivery_deadline,
    requires_refrigeration, required_vehicle_type
  ON public.loads
  FOR EACH ROW EXECUTE FUNCTION cf_trigger_matches_carga();

CREATE OR REPLACE TRIGGER trg_wallet_release
  AFTER UPDATE ON public.loads
  FOR EACH ROW EXECUTE FUNCTION cf_trigger_wallet_release();

-- --- trips ----------------------------------------------------------------
-- Note-se a assimetria com `trg_preparar_carga`: aqui é só INSERT, lá é INSERT
-- OR UPDATE. É assim em produção e fica assim.
CREATE OR REPLACE TRIGGER trg_preparar_viagem
  BEFORE INSERT ON public.trips
  FOR EACH ROW EXECUTE FUNCTION preparar_viagem();

CREATE OR REPLACE TRIGGER trg_matches_viagem
  AFTER INSERT OR UPDATE OF status, available_weight_kg, available_volume_m3,
    origin_id, destination_id, vehicle_id, departure_at, estimated_arrival,
    is_return_trip
  ON public.trips
  FOR EACH ROW EXECUTE FUNCTION cf_trigger_matches_viagem();

-- --- offers ---------------------------------------------------------------
CREATE OR REPLACE TRIGGER trg_apos_criar_proposta
  AFTER INSERT ON public.offers
  FOR EACH ROW EXECUTE FUNCTION cf_apos_criar_proposta();

CREATE OR REPLACE TRIGGER trg_match_resultado_oferta
  AFTER INSERT ON public.offers
  FOR EACH ROW EXECUTE FUNCTION cf_trigger_match_resultado_oferta();

-- --- agreements -----------------------------------------------------------
CREATE OR REPLACE TRIGGER trg_match_resultado_acordo
  AFTER INSERT ON public.agreements
  FOR EACH ROW EXECUTE FUNCTION cf_trigger_match_resultado_acordo();

-- --- messages -------------------------------------------------------------
CREATE OR REPLACE TRIGGER trg_notificar_mensagem
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION cf_notificar_mensagem();

-- --- os quatro `set_updated_at` que faltavam ------------------------------
-- `loads`, `trips`, `users`, `payments` e `user_blocklist` já os tinham. Estes
-- quatro não. Sem eles, `updated_at` mente.
CREATE OR REPLACE TRIGGER trg_documents_updated
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_drivers_updated
  BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_tenants_updated
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_vehicles_updated
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
