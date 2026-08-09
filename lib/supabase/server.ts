import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SessionProfile } from '@/lib/types';

/** Forma dos cookies que o Supabase pede para gravar */
type CookieParaGravar = { name: string; value: string; options: CookieOptions };

/**
 * Cliente Supabase para Server Components, Route Handlers e Server Actions.
 * A sessão vive em cookies httpOnly — nunca acessível a JavaScript no browser.
 */
export function createClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async getAll() {
          const c = await cookies();
          return c.getAll();
        },
        async setAll(cookiesToSet: CookieParaGravar[]) {
          try {
            const c = await cookies();
            cookiesToSet.forEach(({ name, value, options }) => c.set(name, value, options));
          } catch {
            // Server Components não podem escrever cookies. O middleware
            // trata da renovação da sessão — este erro é esperado e inócuo.
          }
        },
      },
    },
  );
}

/**
 * Cliente administrativo — IGNORA Row Level Security.
 *
 * NÃO É NECESSÁRIO para o funcionamento normal da aplicação. O registo de
 * utilizadores, que seria o caso óbvio, é resolvido por um gatilho na base de
 * dados (`on_auth_user_created`), o que é mais seguro e atómico.
 *
 * Reservado para operações futuras que tenham mesmo de atravessar fronteiras
 * de empresa: tarefas agendadas, motor de correspondência a correr em lote,
 * ou reconciliações administrativas.
 *
 * Se um dia for preciso, definir SUPABASE_SERVICE_ROLE_KEY no ambiente do
 * servidor. Nunca importar isto num ficheiro com "use client".
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY não está definida. ' +
        'Só é necessária para operações administrativas em lote — ' +
        'o registo de utilizadores não a usa.',
    );
  }
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
}

/**
 * Resolve o perfil completo do utilizador autenticado (utilizador + empresa).
 * Devolve null se não houver sessão válida.
 *
 * É a função que todas as páginas protegidas devem usar — centraliza a
 * verificação e evita que cada página reimplemente a lógica de forma diferente.
 */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const { data, error } = await supabase
    .from('users')
    .select('*, tenant:tenants(*)')
    .eq('auth_user_id', authUser.id)
    .single();

  if (error || !data) return null;

  const { tenant, ...user } = data as any;
  return { user, tenant };
}
