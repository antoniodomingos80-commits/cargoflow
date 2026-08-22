-- ===========================================================================
-- Barreira de conta bloqueada nas tabelas que ainda escreviam
--
-- O P0 pôs 36 políticas RESTRICTIVE `*_bloqueio_*` que chamam `pode_operar()`.
-- Faltaram tabelas onde um utilizador comum escreve. Medido na FASE 9, com uma
-- conta suspensa a sério:
--
--   registar evento de rastreio  → passou
--   carregar documento           → passou
--   carregar foto de expedição   → passou
--   APAGAR foto de expedição     → passou
--
-- A última é a pior: as fotos de expedição são prova do estado da carga, e uma
-- conta suspensa apagava-as. O ficheiro fica no balde; a linha desaparece.
--
-- QUAIS AS TABELAS, E PORQUÊ SÓ ESTAS QUATRO
--
-- O critério não é «tem GRANT de escrita» — isso são quase todas. É «tem uma
-- política PERMISSIVE que autoriza aquele comando». Sem permissiva, a RLS já
-- nega e uma barreira não acrescenta nada:
--
--   audit_logs, matches, tracking_points   → sem permissiva de escrita.
--                                            Já negadas. Nada a fazer.
--
-- Das que têm permissiva de escrita, quatro são operações de utilizador comum e
-- levam barreira aqui:
--
--   shipment_photos   INSERT, UPDATE, DELETE
--   documents         INSERT, UPDATE, DELETE
--   tracking_events   INSERT
--   locations         INSERT
--
-- AS QUE FICAM DE FORA, DE PROPÓSITO
--
-- Sete tabelas têm escrita permissiva e continuam sem barreira. Não é
-- esquecimento — está decidido em SECURITY-MODEL-TARGET.md §5:
--
--   users                     uma conta suspensa tem de poder corrigir o
--                             próprio perfil e pedir revisão
--   notifications             marcar como lida não é operação de negócio
--   tenants, payments         semântica de empresa e financeira; travar pode
--                             partir a liquidação de um acordo em curso
--   user_blocklist            uma barreira aqui faria com que um administrador
--                             bloqueado não pudesse desbloquear ninguém —
--                             incluindo a si próprio
--   verification_audit_log    trilha de auditoria; travar impede registar a
--                             própria decisão administrativa
--   verification_requirements tabela de configuração, só admin
--
-- As quatro últimas são decisões de segurança por tomar, não omissões. Não são
-- resolvidas aqui.
--
-- FORMA
--
-- Mesmo padrão do P0: RESTRICTIVE, para `authenticated`, uma por comando.
-- RESTRICTIVE combina com AND — junta-se às permissivas existentes sem lhes
-- alargar o alcance. Nenhuma política existente é alterada ou removida.
-- ===========================================================================

DO $bloqueio$
DECLARE
  alvo record;
  nome text;
BEGIN
  FOR alvo IN
    SELECT * FROM (VALUES
      ('shipment_photos', ARRAY['insert','update','delete']),
      ('documents',       ARRAY['insert','update','delete']),
      ('tracking_events', ARRAY['insert']),
      ('locations',       ARRAY['insert'])
    ) AS v(tabela, comandos)
  LOOP
    FOREACH nome IN ARRAY alvo.comandos LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = alvo.tabela
          AND policyname = alvo.tabela || '_bloqueio_' || nome
      ) THEN
        -- INSERT só aceita WITH CHECK; DELETE só aceita USING; UPDATE leva os dois.
        EXECUTE format(
          CASE nome
            WHEN 'insert' THEN 'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.pode_operar())'
            WHEN 'update' THEN 'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.pode_operar()) WITH CHECK (public.pode_operar())'
            WHEN 'delete' THEN 'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.pode_operar())'
          END,
          alvo.tabela || '_bloqueio_' || nome, alvo.tabela);
        RAISE NOTICE 'criada barreira %_bloqueio_%', alvo.tabela, nome;
      END IF;
    END LOOP;
  END LOOP;
END $bloqueio$;

-- --------------------------------------------------------------------------
-- Verificação: nenhuma das quatro fica sem barreira num comando que a sua
-- política permissiva autoriza. A regra é estrutural — lê o catálogo, não uma
-- lista — e vale para comandos que venham a ser abertos no futuro.
-- --------------------------------------------------------------------------
DO $verificar$
DECLARE v_faltam text;
BEGIN
  SELECT string_agg(t.tabela || '.' || o.cmd, ', ' ORDER BY t.tabela, o.cmd) INTO v_faltam
  FROM (VALUES ('shipment_photos'), ('documents'), ('tracking_events'), ('locations')) AS t(tabela)
  CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('DELETE')) AS o(cmd)
  WHERE EXISTS (SELECT 1 FROM pg_policies q
                WHERE q.schemaname = 'public' AND q.tablename = t.tabela
                  AND q.permissive = 'PERMISSIVE' AND q.cmd IN (o.cmd, 'ALL'))
    AND NOT EXISTS (SELECT 1 FROM pg_policies q
                    WHERE q.schemaname = 'public' AND q.tablename = t.tabela
                      AND q.permissive = 'RESTRICTIVE' AND q.cmd IN (o.cmd, 'ALL')
                      AND coalesce(q.qual, '') || coalesce(q.with_check, '') LIKE '%pode_operar%');

  IF v_faltam IS NOT NULL THEN
    RAISE EXCEPTION 'Sem barreira de conta bloqueada: %', v_faltam;
  END IF;

  RAISE NOTICE 'As quatro tabelas têm barreira em todos os comandos que autorizam.';
END $verificar$;
