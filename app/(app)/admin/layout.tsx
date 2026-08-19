import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/supabase/server';

/** Nunca servir uma página de administração a partir de cache. */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Barreira única de toda a área de administração.
 *
 * Estava em falta: cada página tratava (ou não tratava) da autorização por si,
 * e a maioria não tratava. Um layout de servidor corre antes de qualquer
 * página filha, por isso basta aqui — e passa a valer para as páginas que
 * vierem a ser criadas em `/admin`, que é o ponto de o ter neste nível.
 *
 * Isto não substitui as verificações nas Server Actions nem o RLS: um layout
 * protege o que é renderizado, não o que é chamado.
 */
export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  const perfil = await getSessionProfile();

  if (!perfil) redirect('/entrar');
  if (!perfil.user.is_active || perfil.user.role !== 'PLATFORM_ADMIN') redirect('/painel');

  return <>{children}</>;
}
