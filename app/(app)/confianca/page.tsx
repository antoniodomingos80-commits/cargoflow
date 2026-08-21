import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  AlertTriangle,
  Building2,
  FileText,
  ShieldCheck,
  Star,
  Truck,
  UserCheck,
} from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { StatCard, KpiRow } from '@/components/ui/stat-card';
import { classesBotao } from '@/components/ui/button';
import { EstadoVerificacao } from '@/components/trust/estado-verificacao';
import { CartaoPontuacao } from '@/components/trust/cartao-pontuacao';
import { perfilDeConfianca } from '@/lib/trust/perfil';
import { DOCUMENT_TYPE_LABELS, type DocumentType } from '@/lib/types';

export const metadata = { title: 'Confiança' };

function formatarData(iso: string) {
  return new Date(iso).toLocaleDateString('pt-AO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default async function PaginaConfianca() {
  const perfil = await perfilDeConfianca();
  if (!perfil) redirect('/entrar');

  const { documentos, frota, historico } = perfil;
  const temAlertas = documentos.a_expirar.length > 0 || documentos.expirados > 0;

  return (
    <PageContainer largura="padrao">
      <PageHeader
        titulo="Confiança"
        descricao="O que a plataforma sabe sobre esta conta, e o que ainda falta provar."
        accoes={
          <Link href="/documentos" className={classesBotao({ variant: 'outline' })}>
            <FileText className="h-4 w-4" aria-hidden="true" />
            Gerir documentos
          </Link>
        }
      />

      <CartaoPontuacao pontuacao={perfil.pontuacao} />

      {temAlertas ? (
        <section className="cf-card border-amber-200 bg-amber-50/60 p-5">
          <div className="flex items-start gap-4">
            <AlertTriangle
              className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <h2 className="font-semibold text-navy-600">Validades a vencer</h2>
              <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
                {documentos.expirados > 0 ? (
                  <li>
                    {documentos.expirados}{' '}
                    {documentos.expirados === 1 ? 'documento expirou' : 'documentos expiraram'}{' '}
                    e {documentos.expirados === 1 ? 'precisa' : 'precisam'} de ser
                    substituído{documentos.expirados === 1 ? '' : 's'}.
                  </li>
                ) : null}
                {documentos.a_expirar.map((d) => (
                  <li key={d.id}>
                    {DOCUMENT_TYPE_LABELS[d.tipo] ?? d.tipo} expira em{' '}
                    {formatarData(d.expires_at)} —{' '}
                    {d.dias === 0
                      ? 'hoje'
                      : d.dias === 1
                        ? 'falta 1 dia'
                        : `faltam ${d.dias} dias`}
                    .
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      {/* --- Identidade e empresa --------------------------------------- */}
      <div className="grid gap-4 sm:grid-cols-2">
        <SectionCard titulo="Identidade">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <UserCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-navy-600">{perfil.nome}</p>
              <EstadoVerificacao estado={perfil.identidade} className="mt-1.5" />
            </div>
          </div>
        </SectionCard>

        <SectionCard titulo="Empresa">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-600">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-navy-600">{perfil.empresa_nome}</p>
              <EstadoVerificacao estado={perfil.empresa} className="mt-1.5" />
            </div>
          </div>
        </SectionCard>
      </div>

      {/* --- Documentação ------------------------------------------------ */}
      <SectionCard
        titulo="Documentação"
        descricao="Todos os documentos submetidos por esta empresa."
        accao={{ href: '/documentos', rotulo: 'Ver documentos' }}
      >
        <KpiRow colunas={4}>
          <StatCard rotulo="Verificados" valor={documentos.verificados} tom="positivo" icone={ShieldCheck} />
          <StatCard
            rotulo="Em análise"
            valor={documentos.pendentes + documentos.em_analise}
            tom="marca"
            icone={FileText}
          />
          <StatCard rotulo="Rejeitados" valor={documentos.rejeitados} tom={documentos.rejeitados > 0 ? 'alerta' : 'neutro'} />
          <StatCard rotulo="Expirados" valor={documentos.expirados} tom={documentos.expirados > 0 ? 'alerta' : 'neutro'} />
        </KpiRow>

        {documentos.em_falta.length > 0 ? (
          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-medium text-navy-600">
              Obrigatórios ainda sem documento válido
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {documentos.em_falta.map((tipo) => (
                <li key={tipo}>· {DOCUMENT_TYPE_LABELS[tipo as DocumentType] ?? tipo}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </SectionCard>

      {/* --- Frota -------------------------------------------------------- */}
      {frota ? (
        <SectionCard
          titulo="Frota"
          descricao="Conformidade documental de cada veículo activo."
          accao={{ href: '/frota', rotulo: 'Ver frota' }}
        >
          {frota.total === 0 ? (
            <p className="text-sm text-slate-600">
              Ainda não há veículos registados. A frota entra na pontuação a
              partir do primeiro veículo.
            </p>
          ) : (
            <>
              <KpiRow colunas={4}>
                <StatCard rotulo="Conformes" valor={frota.conformes} tom="positivo" icone={Truck} />
                <StatCard rotulo="Incompletos" valor={frota.pendentes} tom={frota.pendentes > 0 ? 'alerta' : 'neutro'} />
                <StatCard rotulo="Não conformes" valor={frota.nao_conformes} tom={frota.nao_conformes > 0 ? 'alerta' : 'neutro'} />
                <StatCard rotulo="Expirados" valor={frota.expirados} tom={frota.expirados > 0 ? 'alerta' : 'neutro'} />
              </KpiRow>
              {frota.documentos_em_falta > 0 ? (
                <p className="mt-4 text-sm text-slate-600">
                  Faltam {frota.documentos_em_falta} documentos no total, somando
                  todos os veículos.
                </p>
              ) : null}

              {frota.motoristas > 0 && frota.motoristas_sem_antecedentes > 0 ? (
                <p className="mt-2 text-sm text-slate-600">
                  {frota.motoristas_sem_antecedentes} de {frota.motoristas} motoristas
                  estão sem verificação de antecedentes válida.
                </p>
              ) : null}
            </>
          )}
        </SectionCard>
      ) : null}

      {/* --- Histórico ---------------------------------------------------- */}
      <SectionCard
        titulo="Histórico"
        descricao="O que já aconteceu nesta conta. Estes números não são estimativas."
      >
        <KpiRow colunas={4}>
          <StatCard
            rotulo="Operações concluídas"
            valor={historico.operacoes_concluidas}
            contexto={
              historico.operacoes_total > 0
                ? `de ${historico.operacoes_total} acordos fechados`
                : 'ainda sem acordos'
            }
          />
          <StatCard rotulo="Avaliações" valor={historico.avaliacoes} icone={Star} />
          <StatCard
            rotulo="Avaliação média"
            valor={historico.avaliacao_media !== null ? historico.avaliacao_media.toFixed(1) : '—'}
            contexto={historico.avaliacao_media !== null ? 'em 5' : 'sem avaliações'}
          />
          <StatCard
            rotulo="Incidentes"
            valor={historico.incidentes}
            tom={historico.incidentes > 0 ? 'alerta' : 'neutro'}
            contexto="entregas com danos registados"
          />
        </KpiRow>
      </SectionCard>
    </PageContainer>
  );
}
