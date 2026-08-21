-- ===========================================================================
-- Arranque das partições de `tracking_points`
--
-- `tracking_points` é particionada por `recorded_at`. Uma tabela particionada
-- sem partições aceita zero linhas: qualquer inserção morre com
--
--   ERROR: no partition of relation "tracking_points" found for row
--
-- Em produção existem cinco partições. Não vieram de migração nenhuma — vieram
-- da tarefa `criar-particoes-tracking`, que corre no dia 25 de cada mês. Isso
-- resolve a produção, que já está a andar há meses, e não resolve nada numa
-- base acabada de reconstruir: nasce sem partições e sem forma de as ganhar
-- antes do próximo dia 25.
--
-- PORQUE NÃO CHAMO `cf_garantir_particoes_futuras()` DIRECTAMENTE
--
-- Porque não é idempotente. Ela chama `criar_particao_tracking()`, que cria a
-- tabela com `IF NOT EXISTS` mas as políticas **sem**:
--
--   CREATE POLICY %I ON %I FOR SELECT USING (…)   -- sem IF NOT EXISTS
--
-- Correr a migração duas vezes rebentaria com `42710 duplicate_object`. A
-- alternativa óbvia — apanhar a excepção — é pior: engoliria também os erros
-- verdadeiros.
--
-- Por isso repito aqui a mesma janela (mês corrente + 3) e verifico a
-- existência antes de chamar. A função fica exactamente como está, com a sua
-- paridade MD5 intacta, e esta migração pode correr as vezes que forem
-- precisas.
--
-- NOTA sobre a não-idempotência de `criar_particao_tracking`
--
-- Continua por corrigir, e continua a ser um risco real: se a tarefa mensal
-- correr duas vezes no mesmo mês, falha. Está registado como dívida — não é
-- corrigido aqui porque corrigi-lo obriga a alterar o corpo de uma função com
-- paridade provada, e isso é uma decisão separada.
-- ===========================================================================

DO $particoes$
DECLARE
  d    DATE := date_trunc('month', NOW())::date;
  i    INT;
  ano  INT;
  mes  INT;
  nome TEXT;
  criadas INT := 0;
BEGIN
  FOR i IN 0..3 LOOP
    ano  := EXTRACT(YEAR  FROM d + (i || ' months')::interval)::int;
    mes  := EXTRACT(MONTH FROM d + (i || ' months')::interval)::int;
    nome := format('tracking_points_%s_%s', ano, lpad(mes::text, 2, '0'));

    IF to_regclass('public.' || nome) IS NULL THEN
      PERFORM public.criar_particao_tracking(ano, mes);
      criadas := criadas + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'partições de tracking_points criadas nesta execução: %', criadas;
END $particoes$;
