import { getSessionProfile } from '@/lib/supabase/server';
import type { SessionProfile } from '@/lib/types';

/**
 * Barreira de autorização para Server Actions administrativas.
 *
 * Uma Server Action é um endpoint HTTP: esconder o botão não impede a chamada.
 * Qualquer ficheiro de acções que use a chave de serviço (que ignora RLS) tem
 * de chamar isto na PRIMEIRA linha de CADA função exportada — caso contrário
 * qualquer sessão autenticada consegue ler ou escrever dados de toda a
 * plataforma.
 *
 * Lança em vez de redirecionar, porque quem chama é uma acção e não uma
 * página: o erro sobe ao `catch` da interface e é mostrado ao utilizador.
 */
export async function exigirPlatformAdmin(): Promise<SessionProfile> {
  const perfil = await getSessionProfile();

  if (!perfil || !perfil.user.is_active || perfil.user.role !== 'PLATFORM_ADMIN') {
    throw new Error('Não autorizado. Esta operação exige perfil de administrador da plataforma.');
  }

  return perfil;
}
