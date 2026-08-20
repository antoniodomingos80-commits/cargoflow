-- ---------------------------------------------------------------------------
-- P0 · Bloqueio operacional na base de dados
-- Aplicado em produção a 19 de Agosto de 2026. Idempotente.
-- ---------------------------------------------------------------------------
--
-- PORQUÊ
--
-- A barreira aplicacional (lib/seguranca/conta.ts) protege as Server Actions,
-- mas o Supabase expõe as tabelas e as funções directamente: qualquer sessão
-- válida pode fazer POST a /rest/v1/loads ou /rest/v1/rpc/cf_aceitar_proposta
-- com a chave anónima, que é pública por desenho. Sem esta migração, bloquear
-- uma conta na aplicação não impedia nada nessa via.
--
-- O QUE FAZ
--
--  1. `pode_operar()` — a mesma decisão da barreira aplicacional, agora no
--     sítio onde a escrita acontece. Falha fechada: basta um dos sinais.
--  2. Políticas RESTRICTIVE de escrita nas tabelas de negócio. São AND-adas
--     com as políticas permissivas existentes, que ficam intactas — nenhuma
--     regra de tenant ou de propriedade foi alterada ou removida.
--  3. A mesma verificação dentro das funções cf_* de mutação. É indispensável:
--     essas funções são SECURITY DEFINER e pertencem a `postgres`, que ignora
--     RLS — as políticas do ponto 2 não as alcançam.
--
-- A leitura fica deliberadamente livre: uma conta bloqueada tem de conseguir
-- abrir a aplicação e perceber o que se passa.

-- ---------------------------------------------------------------------------
-- 1. Função central
-- ---------------------------------------------------------------------------
create or replace function public.pode_operar()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.is_active = true
      and coalesce(u.is_blocked, false) = false
      and coalesce(u.banned, false) = false
      and not exists (
        select 1 from public.user_blocklist b
        where b.user_id = u.id and b.is_active = true
      )
  );
$$;

comment on function public.pode_operar() is
  'P0: true quando a conta autenticada não tem qualquer bloqueio activo. Fonte de verdade: user_blocklist; is_blocked e banned entram como sinais adicionais.';

revoke all on function public.pode_operar() from public;
grant execute on function public.pode_operar() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Políticas RESTRICTIVE de escrita
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  cmd text;
  tabelas text[] := array[
    'loads','trips','offers','agreements','vehicles','drivers',
    'messages','conversations','conversation_participants',
    'reviews','proof_of_delivery','load_attachments'
  ];
begin
  foreach t in array tabelas loop
    foreach cmd in array array['insert','update','delete'] loop
      execute format('drop policy if exists %I on public.%I', t || '_bloqueio_' || cmd, t);
    end loop;

    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check (public.pode_operar())',
      t || '_bloqueio_insert', t);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using (public.pode_operar()) with check (public.pode_operar())',
      t || '_bloqueio_update', t);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (public.pode_operar())',
      t || '_bloqueio_delete', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Verificação dentro das funções cf_* de mutação
-- ---------------------------------------------------------------------------
-- A guarda é inserida a seguir ao primeiro BEGIN, preservando o corpo original.
do $$
declare
  f text;
  def text;
  novo text;
  guarda text := E'  IF NOT public.pode_operar() THEN\n    RAISE EXCEPTION ''A sua conta está bloqueada e não pode realizar esta operação.'' USING ERRCODE = ''42501'';\n  END IF;\n';
  alvos text[] := array[
    'cf_aceitar_proposta','cf_contrapropor_proposta','cf_rejeitar_proposta',
    'cf_registar_entrega','cf_confirmar_receccao','cf_avaliar',
    'cf_convidar_transportador','cf_registar_evento','cf_registar_posicoes'
  ];
begin
  foreach f in array alvos loop
    select pg_get_functiondef(p.oid) into def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = f
     limit 1;

    if def is null then
      raise notice 'ignorada (não encontrada): %', f;
      continue;
    end if;

    if def ilike '%pode_operar%' then
      raise notice 'já protegida: %', f;
      continue;
    end if;

    novo := regexp_replace(def, '(\mBEGIN\M[ \t]*\r?\n)', '\1' || guarda, 'i');

    if novo = def then
      raise warning 'sem BEGIN reconhecível, não alterada: %', f;
      continue;
    end if;

    execute novo;
  end loop;
end $$;
