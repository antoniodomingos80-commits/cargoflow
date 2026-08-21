-- ===========================================================================
-- `on_auth_user_created` — o gatilho que liga o Supabase Auth à tabela `users`
--
-- Existe em produção desde sempre e não estava em ficheiro nenhum:
--
--   CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
--     FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user()
--
-- A função `handle_new_auth_user()` já está versionada, com paridade MD5, em
-- `20260812_funcoes_auxiliares.sql`. Faltava a ligação.
--
-- PORQUE ESTÁ NUM FICHEIRO SÓ SEU
--
-- É o único gatilho do projecto fora do esquema `public`. `auth.users` pertence
-- ao Supabase, não a nós: criar um gatilho nela exige privilégios sobre uma
-- tabela de outro dono. No Supabase o papel `postgres` tem-nos (é o mecanismo
-- documentado para sincronizar contas), mas noutros ambientes pode não ter.
--
-- Separado, uma falha de privilégios aqui não arrasta consigo os 14 gatilhos de
-- `20260823_versionar_triggers_core.sql`. E se falhar, **falha à vista** — não
-- há bloco a engolir a excepção. Uma migração que se cala quando não consegue
-- fazer o seu trabalho é pior do que não existir.
--
-- CONSEQUÊNCIA DE NÃO O TER
--
-- Sem este gatilho a plataforma continua a arrancar, mas quem se regista fica
-- com conta no `auth` e sem linha em `public.users` — ou seja, autenticado e
-- invisível para o resto do sistema.
-- ===========================================================================

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();
