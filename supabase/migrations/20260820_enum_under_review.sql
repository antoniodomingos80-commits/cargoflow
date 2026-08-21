-- ===========================================================================
-- Acrescentar `UNDER_REVIEW` ao enum `verification_status`
--
-- Este valor foi acrescentado à produção a 21/08/2026 como comando avulso, e
-- ficou fora de qualquer migração. O teste de reconstrução numa base vazia
-- apanhou a falha: `20260821_p1_elegibilidade_veiculo.sql` referia
-- 'UNDER_REVIEW' num CASE e rebentava com
--
--   ERROR: invalid input value for enum verification_status: "UNDER_REVIEW"
--
-- Fica num ficheiro próprio porque `ALTER TYPE ... ADD VALUE` não pode ser
-- usado na mesma transação em que o novo valor é referido. Uma migração
-- separada garante o COMMIT entre uma coisa e outra.
--
-- Sem efeito numa base que já o tenha.
-- ===========================================================================
ALTER TYPE public.verification_status
  ADD VALUE IF NOT EXISTS 'UNDER_REVIEW' AFTER 'PENDING';
