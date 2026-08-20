import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/supabase/server';
import type { SessionProfile } from '@/lib/types';

/**
 * Barreira de estado da conta — o bloqueio operacional da plataforma.
 *
 * ARQUITETURA
 *
 * A fonte de verdade de um bloqueio é a tabela `user_blocklist`: é lá que fica
 * o motivo, quem bloqueou, quando, e o histórico de bloqueios levantados. Mas
 * essa tabela é, por política RLS, legível apenas por administradores — um
 * utilizador não consegue (e não deve) consultar a sua própria entrada.
 *
 * Por isso `users.is_blocked` funciona como ESTADO REFLETIDO: é escrito em
 * conjunto com a entrada em `user_blocklist`, viaja no perfil de sessão que
 * todas as ações já carregam, e é o que esta barreira lê. Não é uma segunda
 * regra de negócio — é a mesma decisão, replicada onde pode ser lida sem
 * privilégios.
 *
 * `users.banned` é o mecanismo legado do painel `/admin/utilizadores`. Também
 * é mantido em sincronia, e é aqui tratado como sinal de bloqueio para que uma
 * suspensão feita pela interface antiga tenha efeito real e imediato.
 *
 * FALHA FECHADA
 *
 * Qualquer um dos três sinais — `is_blocked`, `banned`, ou `is_active` falso —
 * impede a operação. Na dúvida, bloqueia.
 *
 * ONDE SE APLICA
 *
 * No servidor, imediatamente antes da mutação, nunca no componente. Esconder um
 * botão não impede um pedido HTTP direto à Server Action.
 */

/** Erro de conta bloqueada. A mensagem é deliberadamente genérica. */
export class ContaBloqueadaError extends Error {
  readonly codigo = 'CONTA_BLOQUEADA';

  constructor() {
    // Não revela o motivo nem quem bloqueou: isso é informação administrativa
    // e chega ao utilizador pelos canais de suporte, não por uma exceção.
    super(
      'A sua conta está bloqueada e não pode realizar esta operação. ' +
        'Contacte o suporte da CargoFlow.',
    );
    this.name = 'ContaBloqueadaError';
  }
}

/** True quando qualquer sinal indica que a conta não pode operar. */
export function contaBloqueada(perfil: SessionProfile): boolean {
  const u = perfil.user;
  return u.is_blocked === true || u.banned === true || u.is_active === false;
}

/**
 * Barreira para quem já tem o perfil resolvido.
 *
 * Chamar logo a seguir ao `if (!perfil) redirect('/entrar')` e ANTES da
 * verificação de `verification`, para manter a ordem:
 * autenticação → estado da conta → verificação → permissão → operação.
 */
export function garantirContaAtiva(perfil: SessionProfile): void {
  if (contaBloqueada(perfil)) throw new ContaBloqueadaError();
}

/**
 * Barreira completa para quem ainda não resolveu o perfil: autentica, valida o
 * estado da conta e devolve o perfil. Serve Server Actions e Route Handlers.
 */
export async function garantirPodeOperar(): Promise<SessionProfile> {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');
  garantirContaAtiva(perfil);
  return perfil;
}
