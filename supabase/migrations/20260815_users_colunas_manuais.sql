-- ===========================================================================
-- Versionar as 12 colunas de `users` que entraram em produção à mão
--
-- COMO FORAM ENCONTRADAS
--
-- O teste de reconstrução numa base vazia (21/08/2026) parou em
-- `20260819_p0_bloqueio_operacional.sql` com
--
--   ERROR: column u.banned does not exist
--
-- `banned` é usada por essa migração e pela blindagem administrativa, e não é
-- criada por ficheiro nenhum. Ao procurar as irmãs, apareceram mais onze.
--
-- QUANDO ENTRARAM
--
-- Não é possível datar cada uma: o PostgreSQL não guarda quando uma coluna foi
-- acrescentada, e não há registo de migração. O que se sabe:
--
--   · `users` tem 17 colunas em `04-MODELO-DE-DADOS.sql` e 35 em produção;
--   · seis das dezoito extra vêm de `20260816_extend_existing.sql`
--     (trust_score, is_blocked, blocked_at, blocked_reason, verification_date,
--     verified_by);
--   · as doze abaixo não vêm de lado nenhum.
--
-- `verification_status` tem o valor por omissão `'PENDENTE'` — em português,
-- ao contrário de `users.verification`, que usa o enum inglês
-- `verification_status`. Os dois nomes colidem: a coluna chama-se como o tipo.
-- É um indício de que foram acrescentadas em alturas e por mãos diferentes.
--
-- ONDE SÃO USADAS
--
--   banned, ban_reason, banned_at  → lib/admin/utilizadores.ts (painel legado),
--                                    lib/trust/actions.ts (sincronia),
--                                    pode_operar(), zz_proteger_campos_admin
--   deleted_at                     → cf_recalcular_trust_scores
--   base_city                      → lib/configuracoes/actions.ts
--   identity_photo_url,
--   documento_tipo, documento_numero,
--   verification_status, verified_at,
--   rejected_at, rejection_reason  → sem uso no código actual
--
-- O QUE ESTA MIGRAÇÃO FAZ
--
-- Repõe exactamente o tipo, o valor por omissão e a nulabilidade que a
-- produção tem hoje — verificados no catálogo a 21/08/2026. Não corrige nada,
-- não renomeia nada, não apaga nada. `IF NOT EXISTS` em todas: aplicar isto a
-- uma base que já as tem não faz nada.
--
-- Nenhuma tem restrição nem índice em produção, e `banned` está a `false` em
-- todas as 24 contas.
-- ===========================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS verification_status VARCHAR DEFAULT 'PENDENTE'::character varying,
  ADD COLUMN IF NOT EXISTS verified_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason    TEXT,
  ADD COLUMN IF NOT EXISTS identity_photo_url  TEXT,
  ADD COLUMN IF NOT EXISTS documento_tipo      VARCHAR,
  ADD COLUMN IF NOT EXISTS documento_numero    VARCHAR,
  ADD COLUMN IF NOT EXISTS banned              BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ban_reason          TEXT,
  ADD COLUMN IF NOT EXISTS banned_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS base_city           TEXT;

COMMENT ON COLUMN public.users.banned IS
  'Mecanismo legado de suspensão do painel /admin/utilizadores. Mantido em sincronia com user_blocklist, que é a fonte de verdade — ver lib/seguranca/conta.ts.';
COMMENT ON COLUMN public.users.verification_status IS
  'Coluna legada com valores em português. Não confundir com users.verification, que usa o enum verification_status. Sem uso no código actual.';
