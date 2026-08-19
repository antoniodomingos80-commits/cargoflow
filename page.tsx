import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/supabase/server';
import { listarUtilizadores } from '@/lib/admin/utilizadores';
import {
  getVerificationRequirements,
  listarAuditoria,
  listarBloqueiosAtivos,
} from '@/lib/trust/actions';
import { VerificationRequirementsCard } from '@/components/trust/VerificationRequirements';
import { AuditLogCard } from '@/components/trust/AuditLog';
import { BlocklistManager } from '@/components/trust/BlocklistManager';

export const metadata = { title: 'Trust Layer' };

/**
 * Painel de confiança da plataforma.
 *
 * Página de servidor: a barreira de perfil é aplicada antes de qualquer
 * leitura, e os dados chegam resolvidos ao browser. As Server Actions que
 * alimentam esta página têm a sua própria verificação — esta camada é
 * conveniência de interface, não é a segurança.
 */
export default async function TrustPage() {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');
  if (perfil.user.role !== 'PLATFORM_ADMIN') redirect('/painel');

  const [requisitos, bloqueios, auditoria, utilizadores] = await Promise.all([
    getVerificationRequirements(),
    listarBloqueiosAtivos(),
    listarAuditoria(50),
    listarUtilizadores(),
  ]);

  const bloqueaveis = utilizadores
    .filter((u) => u.role !== 'PLATFORM_ADMIN')
    .map((u) => ({
      id: u.id,
      full_name: u.full_name ?? u.email ?? 'Sem nome',
      email: u.email,
      role: u.role,
    }));

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-navy-600">Trust Layer</h1>
        <p className="mt-1 text-sm text-slate-500">
          Requisitos de documentação, contas bloqueadas e histórico das decisões de
          verificação.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <BlocklistManager bloqueios={bloqueios} utilizadores={bloqueaveis} />
          <VerificationRequirementsCard requisitos={requisitos} />
        </div>

        <AuditLogCard registos={auditoria} />
      </div>
    </div>
  );
}
