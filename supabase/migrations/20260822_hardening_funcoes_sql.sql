-- ===========================================================================
-- Hardening das funções SQL — os dois achados da auditoria de 21/08/2026
--
-- Esta migração ALTERA COMPORTAMENTO. É o oposto das duas anteriores, que
-- eram preservação pura. A separação foi deliberada: primeiro provou-se que o
-- repositório é a produção, agora corrige-se o que essa leitura revelou.
--
-- Duas funções, duas correcções. Nada mais é tocado.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. `cf_avaliacoes_da_carga` — fuga de avaliações entre empresas
--
-- O QUE ESTAVA MAL
--
-- A função é SECURITY DEFINER: corre com as permissões do dono e ignora o
-- RLS. As três irmãs que fazem o mesmo tipo de leitura — `cf_percurso`,
-- `cf_estado_rastreamento`, `cf_prova_entrega` — verificam se quem pergunta
-- tem relação com a carga antes de devolver o que quer que seja. Esta não
-- verificava nada. Recebia um `p_load_id` e devolvia as avaliações.
--
-- Qualquer conta autenticada que soubesse o id de uma carga lia as avaliações
-- dessa operação: quem avaliou, que nota deu, e o comentário que escreveu.
--
-- PORQUE NÃO FOI APANHADO ANTES
--
-- O teste de isolamento que corri a 21/08 devolveu 0 linhas para uma carga de
-- outra empresa, e eu tomei isso como prova de que a função recusava. Não
-- recusava: a tabela `reviews` tem zero linhas em toda a plataforma. O
-- resultado vazio vinha da ausência de dados, não de uma barreira. É um erro
-- meu de leitura, e fica aqui registado porque a mesma armadilha volta sempre
-- que se testa isolamento contra uma tabela vazia.
--
-- A CORRECÇÃO
--
-- A mesma verificação de `cf_prova_entrega`, palavra por palavra. Vê as
-- avaliações quem é dono da carga, quem a transporta, ou o administrador da
-- plataforma. Mais ninguém.
--
-- Devolve vazio em vez de levantar excepção, por coerência com as irmãs — e
-- porque num ecrã de leitura uma lista vazia é uma resposta, não um erro.
--
-- ALTERAÇÃO DE COMPORTAMENTO, explicitamente
--
--   ANTES: qualquer autenticado com o id → recebia as avaliações
--   AGORA: só dono, transportador ou admin → recebem; os outros, nada
--
-- Não afecta o caminho legítimo. A única chamada da aplicação está em
-- `lib/entrega/actions.ts::obterAvaliacoes`, usada por `/rastreio/[id]`, onde
-- quem lá chega é sempre dono ou transportador da carga.
--
-- Nada mais muda: assinatura, tipos de retorno, ordenação e o cálculo de
-- `sou_eu` ficam byte a byte como estavam.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cf_avaliacoes_da_carga(p_load_id uuid)
 RETURNS TABLE(review_id uuid, rating smallint, punctuality smallint, communication smallint, cargo_condition smallint, professionalism smallint, comment text, created_at timestamp with time zone, autor_nome text, sou_eu boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_eu UUID := current_app_user_id();
BEGIN
  -- Só quem participou na operação, ou o administrador da plataforma.
  -- SECURITY DEFINER ignora o RLS, por isso a barreira tem de estar aqui.
  IF NOT EXISTS (
    SELECT 1 FROM loads l
    WHERE l.id = p_load_id
      AND (l.tenant_id = current_tenant_id() OR is_platform_admin()
           OR EXISTS (SELECT 1 FROM trips t WHERE t.id = l.assigned_trip_id
                        AND t.tenant_id = current_tenant_id()))
  ) THEN RETURN; END IF;

  RETURN QUERY
  SELECT r.id, r.rating, r.punctuality, r.communication, r.cargo_condition,
         r.professionalism, r.comment, r.created_at, u.full_name,
         (r.reviewer_id = v_eu)
  FROM reviews r
  JOIN users u ON u.id = r.reviewer_id
  WHERE r.load_id = p_load_id
  ORDER BY r.created_at DESC;
END;
$function$;


-- ---------------------------------------------------------------------------
-- 2. `cf_viagem_por_partir` — IMMUTABLE a mentir, e aberta ao anónimo
--
-- O QUE ESTAVA MAL
--
--   RETURNS boolean LANGUAGE sql IMMUTABLE
--   AS $$ SELECT p_departure >= NOW() $$
--
-- `IMMUTABLE` é uma promessa ao planeador: para a mesma entrada, sempre a
-- mesma saída, hoje e daqui a um ano. Esta função depende do relógio, por isso
-- a promessa é falsa. Com ela, o Postgres fica livre para avaliar a chamada
-- uma vez e reutilizar o resultado durante a consulta, ou para a dobrar numa
-- constante ao construir um índice — e uma viagem "por partir" passaria a
-- sê-lo para sempre.
--
-- Era também a ÚNICA das 51 sem `SET search_path` fixo, e a ÚNICA com EXECUTE
-- para `anon`.
--
-- A CORRECÇÃO
--
--   IMMUTABLE → STABLE   a volatilidade honesta: constante dentro de uma
--                        consulta, livre para mudar entre consultas
--   + SET search_path    fecha o caminho clássico de escalada por resolução
--                        de nomes em funções que correm com outro contexto
--   REVOKE de anon       ninguém não autenticado precisa disto
--
-- A REGRA FUNCIONAL NÃO MUDA: continua `p_departure >= NOW()`.
--
-- PORQUE É SEGURO
--
-- Verificado na base de dados antes de mexer: nenhum índice, restrição CHECK,
-- vista, política RLS, coluna gerada ou outra função a usa. E no repositório,
-- nenhum ficheiro da aplicação lhe chama. Não há nada dependente de ela ser
-- IMMUTABLE — que é a única razão pela qual esta troca seria arriscada.
--
-- ALTERAÇÃO DE COMPORTAMENTO, explicitamente
--
--   · O planeador deixa de poder pré-calcular a chamada. Mesmo resultado,
--     avaliação mais frequente. Numa função de uma linha, sem custo relevante.
--   · `anon` deixa de a poder executar. `authenticated` mantém-se.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cf_viagem_por_partir(p_departure timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$ SELECT p_departure >= NOW() $function$;

-- O REVOKE tem de ser a PUBLIC, não a `anon`.
--
-- O Postgres dá EXECUTE a PUBLIC em todas as funções novas, e `anon` é membro
-- de PUBLIC. Revogar só a `anon` não tira nada: o privilégio continua a chegar
-- por herança. Confirmei-o na base de dados — depois de um
-- `REVOKE ... FROM anon`, `has_function_privilege('anon', …, 'EXECUTE')`
-- continuava a devolver `true`.
--
-- É o mesmo padrão que as outras funções fechadas desta base de dados usam:
-- `cf_calcular_matches_*` estão inacessíveis a `authenticated` precisamente
-- porque alguém revogou a PUBLIC, não ao papel.
REVOKE EXECUTE ON FUNCTION public.cf_viagem_por_partir(timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cf_viagem_por_partir(timestamp with time zone) TO authenticated, service_role;


-- ===========================================================================
-- ACHADO NOVO, ENCONTRADO DURANTE ESTE HARDENING — documentado, NÃO corrigido
--
-- `SET search_path TO 'public'` NÃO PROTEGE CONTRA `pg_temp`
-- ===========================================================================
--
-- Comecei esta sessão convencido de que as três funções sem `SET search_path`
-- — `current_tenant_id`, `current_user_id`, `is_platform_admin` — eram as
-- vulneráveis. Testei e estava enganado: são as únicas que resistem.
--
-- O QUE MANDA NÃO É O `search_path`, É A QUALIFICAÇÃO NO CORPO
--
-- O Postgres pesquisa o esquema temporário ANTES de todos os outros para
-- nomes de relação, e continua a fazê-lo mesmo quando `search_path` está
-- fixado — a não ser que `pg_temp` seja nomeado explicitamente. Uma função
-- SECURITY DEFINER com `SET search_path TO 'public'` e um `FROM users` sem
-- esquema resolve `users` para `pg_temp.users` se essa tabela existir.
--
-- As três que eu suspeitava escrevem `FROM public.users u` no corpo. É isso
-- que as salva, e não a ausência ou presença do `search_path`.
--
-- PROVA, em transação revertida (21/08/2026)
--
--   CREATE TEMP TABLE users (auth_user_id uuid, role text, is_active boolean,
--                            id uuid, tenant_id uuid);
--   INSERT INTO pg_temp.users VALUES (<o meu auth uid>, 'PLATFORM_ADMIN', true,
--                                     '0000…0001', '0000…00ff');
--
--   is_platform_admin()   → false                  (usa public.users)
--   current_tenant_id()   → o tenant verdadeiro    (usa public.users)
--   current_user_id()     → o id verdadeiro        (usa public.users)
--   pode_operar()         → true                   (usa public.users)
--   current_app_user_id() → 0000…0001  ← O VALOR FORJADO
--
-- `current_app_user_id()` tem `SET search_path TO 'public'` e mesmo assim caiu,
-- porque o corpo diz `SELECT id FROM users`.
--
-- QUANTAS ESTÃO NESTA SITUAÇÃO
--
-- 19 funções SECURITY DEFINER referem `users` sem qualificar o esquema, 14
-- delas chamáveis por `authenticated`. Entre elas `current_app_user_id()`,
-- que decide QUEM É o utilizador em `cf_avaliar`, `cf_registar_entrega`,
-- `cf_mensagens_da_conversa` e `cf_marcar_lida`. Forjá-la é passar por outra
-- pessoa.
--
-- QUAL É O RISCO REAL, HOJE
--
-- Não é alcançável pela API. O ataque exige criar uma tabela temporária na
-- MESMA ligação, e o PostgREST não expõe DDL. `authenticated` e `anon` não
-- podem criar em nenhum esquema (verificado), mas PODEM criar temporárias —
-- o privilégio TEMP está concedido a PUBLIC na base de dados.
--
-- Passa a ser alcançável se alguém obtiver ligação directa com o papel
-- `authenticated`, ou se aparecer injecção de SQL em qualquer ponto. É uma
-- mina, não um incêndio.
--
-- A CORRECÇÃO, quando for decidida
--
-- Testei as duas e ambas funcionam:
--
--   (B)  SET search_path TO 'public', 'pg_temp'   ← nomear pg_temp em último
--   (C)  FROM public.users                        ← qualificar no corpo
--
-- (B) é uma linha por função e não toca no corpo — preferível, porque não
-- altera o texto que as migrações de preservação provaram ser idêntico à
-- produção. São 19 funções e merece decisão própria, por isso fica aqui
-- documentado e não feito.
