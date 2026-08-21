import { redirect } from 'next/navigation';
import { PageContainer, PageHeader } from '@/components/ui/page-header';
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
import { resumoAdministrativo } from '@/lib/admin/actions';
import { StatCard, KpiRow } from '@/components/ui/stat-card';
import { FileText, ShieldAlert, Truck, CalendarX } from 'lucide-react';

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

  const [requisitos, bloqueios, auditoria, utilizadores, resumo] = await Promise.all([
    getVerificationRequirements(),
    listarBloqueiosAtivos(),
    listarAuditoria(50),
    listarUtilizadores(),
    resumoAdministrativo(),
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
    <PageContainer largura="larga">
      <PageHeader
        titulo="Trust Layer"
        descricao="Requisitos de documentação, contas bloqueadas e histórico das decisões de verificação."
      />

      <KpiRow colunas={4}>
        <StatCard
          rotulo="Por rever"
          valor={resumo.documentos_pendentes + resumo.documentos_em_analise}
          contexto={`${resumo.documentos_em_analise} já em análise`}
          icone={FileText}
          tom={resumo.documentos_pendentes > 0 ? 'destaque' : 'neutro'}
          href="/admin/documentos"
        />
        <StatCard
          rotulo="Documentos expirados"
          valor={resumo.documentos_expirados}
          icone={CalendarX}
          tom={resumo.documentos_expirados > 0 ? 'alerta' : 'positivo'}
        />
        <StatCard
          rotulo="Veículos não conformes"
          valor={resumo.veiculos_nao_conformes}
          icone={Truck}
          tom={resumo.veiculos_nao_conformes > 0 ? 'alerta' : 'positivo'}
        />
        <StatCard
          rotulo="Empresas por verificar"
          valor={resumo.empresas_por_verificar}
          icone={ShieldAlert}
          tom={resumo.empresas_por_verificar > 0 ? 'destaque' : 'positivo'}
          href="/admin/verificacoes"
        />
      </KpiRow>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <BlocklistManager bloqueios={bloqueios} utilizadores={bloqueaveis} />
          <VerificationRequirementsCard requisitos={requisitos} />
        </div>

        <AuditLogCard registos={auditoria} />
      </div>
    </PageContainer>
  );
}
