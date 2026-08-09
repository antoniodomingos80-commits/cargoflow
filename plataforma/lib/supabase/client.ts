import { createBrowserClient } from '@supabase/ssr';

/**
 * Cliente Supabase para componentes do browser ("use client").
 *
 * Usa a chave anónima — todas as consultas passam pelas políticas de Row Level
 * Security definidas na base de dados. É seguro expor esta chave; a segurança
 * está nas políticas, não no segredo da chave.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
