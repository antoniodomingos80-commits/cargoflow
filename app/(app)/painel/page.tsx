import { createClient, getSessionProfile } from '@/lib/supabase/server';
import { indicadoresPlataforma, resumoAdministrativo, verificacoesPendentes } from '@/lib/admin/actions';
import { ROLE_LABELS } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PageContainer, PageHeader } from '@/components/ui/page-header';
import { StatCard, KpiRow } from '@/components/ui/stat-card';
import { SectionCard } from '@/components/ui/section-card';
import { StatusIndicator } from '@/components/ui/badge';
import Link from 'next/link';
import {
  Package, Truck, MapPin, ShieldAlert, ArrowRight, CheckCircle2, ShieldCheck,
  PackageCheck, WalletCards, FileText, Users, Handshake, Building2, Star,
} from 'lucide-react';

export const metadata = { title: 'Painel' };

/**
 * Painel inicial.
 *
 * Regra desta página: cada número mostrado vem de uma contagem real da base de
 * dados. Não há variações "vs ontem", percentagens de tendência nem gráficos
 * de série temporal — não existe histórico para os calcular, e inventá-los
 * seria mentir com bom aspecto.
 */
export default async function PaginaPainel() {
  const perfil = await getSessionProfile();
  if (!perfil) return null;

  const { user, tenant } = perfil;

  // Administradores da plataforma têm um painel próprio
  if (user.role === 'PLATFORM_ADMIN') {
    return <PainelAdministrador nome={user.full_name} />;
  }

  const porVerificar = user.verification === 'PENDING';
  const ehTransportador = user.role === 'CARRIER' || user.role === 'COMPANY_ADMIN';

  const supabase = createClient();
  const [cargasRes, viagensRes, veiculosRes, documentosRes] = await Promise.all([
    supabase.from('loads').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
    supabase.from('trips').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
    supabase
      .from('vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('is_active', true),
    supabase.from('documents').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
  ]);

  const cargasCount = cargasRes.count ?? 0;
  const viagensCount = viagensRes.count ?? 0;
  const veiculosCount = veiculosRes.count ?? 0;
  const documentosCount = documentosRes.count ?? 0;
  const primeiraOperacaoPublicada = cargasCount > 0 || viagensCount > 0;

  const checklistMvp = [
    {
      titulo: 'Perfil básico preenchido',
      texto: 'Nome, contacto e dados da empresa prontos para negociação.',
      feito: Boolean(user.phone || tenant.tax_id),
    },
    {
      titulo: 'Verificação concluída',
      texto: 'A conta já pode operar com confiança na plataforma.',
      feito: user.verification === 'APPROVED',
    },
    {
      titulo: 'Primeira operação publicada',
      texto: 'Publique a primeira carga ou viagem para fechar o ciclo.',
      feito: primeiraOperacaoPublicada,
    },
  ];
  const progressoChecklist = Math.round(
    (checklistMvp.filter((item) => item.feito).length / checklistMvp.length) * 100,
  );
  const recomendacao = ehTransportador
    ? {
        titulo: 'Publicar a sua primeira viagem',
        texto: 'Anuncie o espaço disponível no camião e comece a receber propostas de carga.',
        accao: { href: '/viagens/nova', rotulo: 'Publicar viagem' },
      }
    : {
        titulo: 'Publicar a primeira carga',
        texto: 'Indique origem, destino, peso e datas para começar a encontrar transportadores.',
        accao: { href: '/cargas/nova', rotulo: 'Publicar carga' },
      };

  const passos = [
    {
      titulo: 'Conta criada',
      texto: 'O seu registo está concluído.',
      feito: true,
    },
    {
      titulo: 'Documentos verificados',
      texto: porVerificar
        ? 'Carregue os documentos para poder publicar e negociar.'
        : 'Os seus documentos foram aprovados.',
      feito: !porVerificar,
      accao: porVerificar
        ? { href: '/documentos', rotulo: 'Carregar documentos' }
        : undefined,
    },
    ehTransportador
      ? {
          titulo: 'Registar veículo',
          texto: 'Adicione o camião para poder publicar viagens.',
          feito: veiculosCount > 0,
          accao: { href: '/frota', rotulo: 'Adicionar veículo' },
        }
      : {
          titulo: 'Publicar a primeira carga',
          texto: 'Indique origem, destino e peso — leva menos de um minuto.',
          feito: cargasCount > 0,
          accao: { href: '/cargas/nova', rotulo: 'Publicar carga' },
        },
  ];

  return (
    <PageContainer>
      <PageHeader
        titulo={`Olá, ${user.full_name.split(' ')[0]}`}
        descricao={`${ROLE_LABELS[user.role]} · ${tenant.name}`}
        accoes={
          <Link href={ehTransportador ? '/viagens/nova' : '/cargas/nova'}>
            <Button size="sm">
              {ehTransportador ? 'Publicar viagem' : 'Publicar carga'}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </Link>
        }
      />

      <div className="flex items-center gap-4">
        <StatusIndicator
          rotulo={porVerificar ? 'Conta por verificar' : 'Conta verificada'}
          tom={porVerificar ? 'destaque' : 'positivo'}
        />
      </div>

      {porVerificar && (
        <div className="cf-card flex flex-col gap-4 border-accent-200 bg-accent-50/60 p-5 sm:flex-row sm:items-start">
          <ShieldAlert className="h-5 w-5 shrink-0 text-accent-600" aria-hidden="true" />
          <div className="flex-1">
            <h2 className="font-semibold text-navy-600">Conta por verificar</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Pode explorar a plataforma, mas só poderá publicar cargas ou
              viagens depois de a nossa equipa validar os seus documentos.
              A verificação demora normalmente menos de 24 horas.
            </p>
            <Link href="/documentos" className="mt-4 inline-block">
              <Button size="sm" variant="accent">
                Carregar documentos
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Indicadores — contagens reais da empresa, sem tendências inventadas. */}
      <KpiRow colunas={4}>
        <StatCard
          rotulo="Cargas"
          valor={cargasCount}
          contexto={cargasCount === 0 ? 'Nenhuma publicada ainda' : 'Publicadas pela sua empresa'}
          icone={Package}
          tom="marca"
          href="/cargas"
        />
        {ehTransportador ? (
          <StatCard
            rotulo="Viagens"
            valor={viagensCount}
            contexto={viagensCount === 0 ? 'Nenhuma publicada ainda' : 'Publicadas pela sua empresa'}
            icone={Truck}
            tom="destaque"
            href="/viagens"
          />
        ) : (
          <StatCard
            rotulo="Transporte"
            valor={viagensCount}
            contexto="Viagens associadas à sua empresa"
            icone={Truck}
            tom="destaque"
            href="/mercado/viagens"
          />
        )}
        <StatCard
          rotulo="Frota activa"
          valor={veiculosCount}
          contexto={veiculosCount === 0 ? 'Sem veículos registados' : 'Veículos disponíveis'}
          icone={Truck}
          tom="neutro"
          href={ehTransportador ? '/frota' : undefined}
        />
        <StatCard
          rotulo="Documentos"
          valor={documentosCount}
          contexto={porVerificar ? 'Verificação por concluir' : 'Documentação aprovada'}
          icone={FileText}
          tom={porVerificar ? 'alerta' : 'positivo'}
          href="/documentos"
        />
      </KpiRow>

      {/* Só faz sentido destacar "publique a primeira X" enquanto for mesmo
          a primeira vez — antes disto, este bloco aparecia sempre, mesmo
          com dezenas de cargas/viagens já publicadas. */}
      {!primeiraOperacaoPublicada && (
        <section className="cf-card border-brand-200 bg-brand-50/60 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
                Ação recomendada
              </p>
              <h2 className="mt-1 font-semibold text-navy-600">{recomendacao.titulo}</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{recomendacao.texto}</p>
            </div>
            <Link href={recomendacao.accao.href} className="inline-flex">
              <Button size="sm" variant="accent">
                {recomendacao.accao.rotulo}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          titulo="Checklist de lançamento"
          descricao={`${progressoChecklist}% completo · os próximos passos estão já visíveis.`}
        >
          <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{ width: `${progressoChecklist}%` }}
            />
          </div>

          <ol className="space-y-3">
            {checklistMvp.map((item) => (
              <li
                key={item.titulo}
                className="flex items-start gap-3 rounded-xl border border-slate-200 p-3"
              >
                <span
                  className={
                    item.feito
                      ? 'mt-0.5 text-emerald-500'
                      : 'mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-slate-300'
                  }
                  aria-hidden="true"
                >
                  {item.feito && <CheckCircle2 className="h-5 w-5" />}
                </span>
                <div className="min-w-0">
                  <p
                    className={
                      item.feito
                        ? 'text-sm font-semibold text-slate-400 line-through'
                        : 'text-sm font-semibold text-navy-600'
                    }
                  >
                    {item.titulo}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{item.texto}</p>
                </div>
              </li>
            ))}
          </ol>
        </SectionCard>

        <SectionCard titulo="Próximos passos">
          <ol className="space-y-4">
            {passos.map((passo) => (
              <li key={passo.titulo} className="flex items-start gap-4">
                <span
                  className={
                    passo.feito
                      ? 'mt-0.5 text-emerald-500'
                      : 'mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-slate-300'
                  }
                  aria-hidden="true"
                >
                  {passo.feito && <CheckCircle2 className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      passo.feito
                        ? 'text-sm font-medium text-slate-400 line-through'
                        : 'text-sm font-semibold text-navy-600'
                    }
                  >
                    {passo.titulo}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">{passo.texto}</p>
                  {passo.accao && (
                    <Link
                      href={passo.accao.href}
                      className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-500 hover:underline"
                    >
                      {passo.accao.rotulo}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </SectionCard>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AtalhoCartao
          href="/documentos"
          icone={ShieldCheck}
          titulo="Confiança e verificação"
          texto="Suba os documentos e acelere a publicação de cargas e viagens."
          tom="marca"
        />
        <AtalhoCartao
          href="/rastreio"
          icone={PackageCheck}
          titulo="Provas de entrega"
          texto="Registe fotos, assinatura e notas para fechar cada operação."
          tom="destaque"
        />
        <AtalhoCartao
          href="/pagamentos"
          icone={WalletCards}
          titulo="Pagamentos"
          texto="Centralize o estado das transações e mantenha o controlo."
          tom="positivo"
        />
      </section>

      {/* Atalhos por perfil */}
      <section className="grid gap-4 sm:grid-cols-2">
        {ehTransportador ? (
          <>
            <AtalhoCartao
              href="/mercado/cargas"
              icone={Package}
              titulo="Procurar carga"
              texto="Veja que cargas estão disponíveis nas suas rotas."
            />
            <AtalhoCartao
              href="/viagens/nova"
              icone={Truck}
              titulo="Publicar viagem"
              texto="Anuncie a sua rota e o espaço disponível."
            />
          </>
        ) : (
          <>
            <AtalhoCartao
              href="/cargas/nova"
              icone={Package}
              titulo="Publicar carga"
              texto="Origem, destino, peso e datas."
            />
            <AtalhoCartao
              href="/mercado/viagens"
              icone={MapPin}
              titulo="Procurar transporte"
              texto="Veja que camiões passam pela sua rota."
            />
          </>
        )}
      </section>
    </PageContainer>
  );
}

/**
 * Painel do administrador da plataforma.
 *
 * Prioriza o que exige ação — verificações pendentes ao topo, porque uma
 * conta por aprovar é um utilizador bloqueado que não pode usar o produto.
 */
async function PainelAdministrador({ nome }: { nome: string }) {
  const [ind, pendentes, resumo] = await Promise.all([
    indicadoresPlataforma(),
    verificacoesPendentes(),
    resumoAdministrativo(),
  ]);

  return (
    <PageContainer largura="larga">
      <PageHeader titulo={`Olá, ${nome.split(' ')[0]}`} descricao="Visão geral da plataforma" />

      {pendentes.length > 0 && (
        <Link
          href="/admin/verificacoes"
          className="cf-card-interactive flex items-start gap-4 border-accent-200 bg-accent-50/60 p-5"
        >
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-accent-600" aria-hidden="true" />
          <div className="flex-1">
            <h2 className="font-semibold text-navy-600">
              {pendentes.length}{' '}
              {pendentes.length === 1 ? 'conta à espera' : 'contas à espera'} de verificação
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Enquanto não forem verificadas, estas pessoas não podem publicar
              nem negociar.
            </p>
          </div>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-accent-600" aria-hidden="true" />
        </Link>
      )}

      {ind && (
        <>
          <section className="space-y-3">
            <h2 className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Ações urgentes
            </h2>
            <KpiRow colunas={3}>
              <StatCard
                rotulo="KYC pendente"
                valor={resumo.verificacoes_pendentes}
                icone={ShieldAlert}
                tom={resumo.verificacoes_pendentes > 0 ? 'destaque' : 'positivo'}
                href="/admin/verificacoes"
              />
              <StatCard
                rotulo="Pagamentos pendentes"
                valor={resumo.pagamentos_pendentes}
                icone={WalletCards}
                tom={resumo.pagamentos_pendentes > 0 ? 'alerta' : 'neutro'}
              />
              <StatCard
                rotulo="Documentos por rever"
                valor={resumo.documentos_pendentes}
                icone={FileText}
                tom={resumo.documentos_pendentes > 0 ? 'destaque' : 'neutro'}
                href="/admin/documentos"
              />
            </KpiRow>
          </section>

          <section className="space-y-3">
            <h2 className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Atividade
            </h2>
            <KpiRow colunas={4}>
              <StatCard rotulo="Cargas publicadas" valor={ind.cargas_publicadas} icone={Package} tom="marca" />
              <StatCard rotulo="Em curso" valor={ind.cargas_em_curso} icone={Truck} tom="destaque" />
              <StatCard rotulo="Concluídas" valor={ind.cargas_concluidas} icone={PackageCheck} tom="positivo" />
              <StatCard rotulo="Viagens ativas" valor={ind.viagens_ativas} icone={MapPin} tom="neutro" />
            </KpiRow>
          </section>

          <section className="space-y-3">
            <h2 className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Marketplace
            </h2>
            <KpiRow colunas={4}>
              <StatCard rotulo="Correspondências" valor={ind.correspondencias} icone={MapPin} tom="marca" />
              <StatCard rotulo="Propostas pendentes" valor={ind.propostas_pendentes} icone={Handshake} tom="destaque" />
              <StatCard rotulo="Acordos fechados" valor={ind.acordos} icone={CheckCircle2} tom="positivo" />
              <StatCard
                rotulo="Valor transacionado"
                valor={formatCurrency(Number(ind.valor_transacionado))}
                icone={WalletCards}
                tom="neutro"
              />
            </KpiRow>
          </section>

          <section className="space-y-3">
            <h2 className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Comunidade
            </h2>
            <KpiRow colunas={4}>
              <StatCard rotulo="Utilizadores" valor={ind.utilizadores_total} icone={Users} tom="marca" href="/admin/utilizadores" />
              <StatCard rotulo="Empresas" valor={ind.empresas} icone={Building2} tom="neutro" />
              <StatCard rotulo="Veículos" valor={ind.veiculos} icone={Truck} tom="neutro" />
              <StatCard
                rotulo="Avaliação média"
                valor={ind.avaliacao_media ? `${ind.avaliacao_media} ★` : '—'}
                contexto={ind.avaliacao_media ? undefined : 'Ainda sem avaliações'}
                icone={Star}
                tom={ind.avaliacao_media ? 'positivo' : 'neutro'}
              />
            </KpiRow>
          </section>
        </>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AtalhoCartao
          href="/admin/verificacoes"
          icone={ShieldAlert}
          titulo="Verificações"
          texto="Aprovar ou rejeitar contas e documentos."
          tom="destaque"
        />
        <AtalhoCartao
          href="/admin/trust"
          icone={ShieldCheck}
          titulo="Trust Layer"
          texto="Requisitos, bloqueios e histórico de auditoria."
          tom="marca"
        />
        <AtalhoCartao
          href="/admin/operacoes"
          icone={Package}
          titulo="Operações"
          texto="Supervisionar todas as cargas da plataforma."
        />
      </section>
    </PageContainer>
  );
}

function AtalhoCartao({
  href,
  icone: Icone,
  titulo,
  texto,
  tom = 'marca',
}: {
  href: string;
  icone: any;
  titulo: string;
  texto: string;
  tom?: 'marca' | 'destaque' | 'positivo';
}) {
  const cores = {
    marca: 'bg-brand-50 text-brand-500',
    destaque: 'bg-accent-50 text-accent-600',
    positivo: 'bg-emerald-50 text-emerald-600',
  }[tom];

  return (
    <Link href={href} className="cf-card-interactive block p-5">
      <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${cores}`}>
        <Icone className="h-5 w-5" aria-hidden="true" />
      </span>
      <h3 className="mt-4 font-semibold text-navy-600">{titulo}</h3>
      <p className="mt-1 text-sm leading-relaxed text-slate-500">{texto}</p>
    </Link>
  );
}
