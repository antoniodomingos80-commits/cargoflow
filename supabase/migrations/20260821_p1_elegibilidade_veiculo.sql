-- ===========================================================================
-- P1 — Elegibilidade do veículo para operar
--
-- O PROBLEMA
--
-- `listarVeiculosDisponiveis()` filtrava só por `is_active`. Um veículo com o
-- seguro caducado, a inspeção fora de prazo ou a verificação recusada
-- continuava a aparecer na lista de publicar viagem — e nada, em lado nenhum,
-- o impedia de ser usado.
--
-- A REGRA
--
--   compliant      → elegível
--   pending        → elegível, mas assinalado na interface
--   non_compliant  → NÃO elegível
--   expired        → NÃO elegível
--   verification REJECTED ou EXPIRED → NÃO elegível
--
-- `pending` continua elegível de propósito. Hoje os dez veículos em produção
-- estão todos em `pending` — nenhum tem livrete, seguro ou inspeção
-- carregados — e sete deles já publicaram viagens. Bloquear `pending` parava
-- a plataforma inteira esta tarde. O caminho honesto é deixar operar enquanto
-- a documentação está a caminho e dizer-lhes claramente o que falta, não
-- fechar a porta a quem já lá estava dentro.
--
-- ONDE A REGRA VIVE
--
-- Nos três sítios, porque um só não chega:
--   1. na lista (o utilizador vê e percebe);
--   2. na Server Action (mensagem clara antes de tentar escrever);
--   3. no RLS e num gatilho (ninguém contorna pelo PostgREST).
--
-- Não altera `pode_operar()`, as políticas RESTRICTIVE do P0, a blindagem
-- administrativa nem o isolamento por empresa. Acrescenta.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Correção da vista: `valido_ate` estava a devolver a sentinela
--
-- O CTE usa 9999-12-31 para representar "sem data" dentro do LEAST. Essa
-- sentinela estava a escapar para fora, e a interface recebia um veículo com
-- validade no ano 9999 em vez de nenhuma validade. Cosmético, mas é um dado
-- falso — e um dado falso acaba sempre por ser usado para decidir.
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
  -- NULLIF devolve a sentinela ao que ela é: ausência de data.
  NULLIF(
    LEAST(
      MIN(p.valido_ate) FILTER (WHERE p.valido_ate IS NOT NULL),
      (SELECT proxima_data FROM datas_veiculo dv WHERE dv.vehicle_id = v.id)
    ),
    DATE '9999-12-31'
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
-- A regra, num só sítio
--
-- SECURITY DEFINER porque tem de ler `vehicle_compliance` (que é
-- security_invoker) e as tabelas por baixo dela mesmo quando é chamada de
-- dentro de uma política RLS.
--
-- A verificação de empresa é feita aqui também: sem ela, um utilizador podia
-- inserir uma viagem sua apontando para o veículo de outra empresa — o RLS de
-- `trips` só olha para `trips.tenant_id`, nunca olhou para o veículo.
-- `auth.uid() IS NULL` liberta as chamadas de servidor (service-role, cron),
-- que não têm sessão.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cf_veiculo_elegivel(p_vehicle_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM vehicles v
    LEFT JOIN vehicle_compliance vc ON vc.vehicle_id = v.id
    WHERE v.id = p_vehicle_id
      AND v.is_active
      AND v.verification NOT IN ('REJECTED', 'EXPIRED')
      AND COALESCE(vc.estado_compliance, 'pending') NOT IN ('non_compliant', 'expired')
      AND (auth.uid() IS NULL OR v.tenant_id = public.current_tenant_id())
  );
$$;

COMMENT ON FUNCTION public.cf_veiculo_elegivel(UUID) IS
  'Verdadeiro quando o veículo pode ser usado numa operação: activo, da própria empresa, sem verificação recusada ou expirada, e com conformidade compliant ou pending.';

GRANT EXECUTE ON FUNCTION public.cf_veiculo_elegivel(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Publicar viagem: o veículo tem de ser elegível
--
-- RESTRICTIVE, portanto combina-se com E lógico às políticas existentes — não
-- alarga nada, só estreita.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS trips_veiculo_elegivel ON public.trips;
CREATE POLICY trips_veiculo_elegivel ON public.trips
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (public.cf_veiculo_elegivel(vehicle_id));

-- ---------------------------------------------------------------------------
-- Trocar de veículo numa viagem já criada
--
-- Isto é um gatilho e não uma política porque uma política de UPDATE não
-- consegue comparar a linha antiga com a nova. Se fosse política, qualquer
-- alteração a uma viagem (mudar o estado, cancelar) passaria a exigir um
-- veículo elegível — e um camionista com o seguro caducado ficava sem poder
-- sequer cancelar a viagem. Aqui só se verifica quando o veículo muda.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cf_trips_veiculo_elegivel()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
     AND NOT public.cf_veiculo_elegivel(NEW.vehicle_id) THEN
    RAISE EXCEPTION
      'O veículo indicado não está elegível para operar.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_trips_veiculo_elegivel ON public.trips;
CREATE TRIGGER zz_trips_veiculo_elegivel
  BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.cf_trips_veiculo_elegivel();
