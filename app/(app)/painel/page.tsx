import { createClient, getSessionProfile } from '@/lib/supabase/server';
import { indicadoresPlataforma, resumoAdministrativo, verificacoesPendentes } from '@/lib/admin/actions';
import { ROLE_LABELS } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  Package, Truck, MapPin, ShieldAlert, ArrowRight, CheckCircle2, ShieldCheck, PackageCheck, WalletCards,
} from 'lucide-react';

export const metadata = { title: 'Painel' };

/**
 * Painel inicial.
 *
 * Nesta fase mostra o estado da conta e os próximos passos. Os indicadores
 * reais (cargas ativas, entregas, ocupação da frota) entram quando os
 * módulos de cargas e viagens estiverem construídos — mostrar cartões com
 * zeros antes disso seria ruído.
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
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-navy-600">
          Olá, {user.full_name.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {ROLE_LABELS[user.role]} · {tenant.name}
        </p>
      </header>

      {porVerificar && (
        <div className="cf-card flex items-start gap-4 border-accent-200 bg-accent-50/60 p-5">
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

      <section className="grid gap-4 md:grid-cols-3">
        <div className="cf-card p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <h3 className="mt-4 font-semibold text-navy-600">Confiança e verificação</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Suba os documentos e acelere a publicação de cargas e viagens.
          </p>
          <Link href="/documentos" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-500 hover:underline">
            Ver documentos
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="cf-card p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-50 text-accent-600">
            <PackageCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <h3 className="mt-4 font-semibold text-navy-600">Provas de entrega</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Registe fotos, assinatura e notas para fechar cada operação com rastreio claro.
          </p>
          <Link href="/rastreio" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-500 hover:underline">
            Ver entregas
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="cf-card p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <WalletCards className="h-5 w-5" aria-hidden="true" />
          </div>
          <h3 className="mt-4 font-semibold text-navy-600">Pagamentos protegidos</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Centralize o estado das transações e mantenha o controlo sobre cada pagamento.
          </p>
          <Link href="/pagamentos" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-500 hover:underline">
            Ver pagamentos
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="cf-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-navy-600">Checklist de lançamento</h2>
            <p className="mt-1 text-sm text-slate-500">
              {progressoChecklist}% completo · os próximos passos estão já visíveis.
            </p>
          </div>
          <div className="rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-600">
            {progressoChecklist}%
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: `${progressoChecklist}%` }}
          />
        </div>

        <ol className="mt-5 space-y-3">
          {checklistMvp.map((item) => (
            <li key={item.titulo} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
              <span
                className={
                  item.feito
                    ? 'mt-0.5 text-green-500'
                    : 'mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-slate-300'
                }
                aria-hidden="true"
              >
                {item.feito && <CheckCircle2 className="h-5 w-5" />}
              </span>
              <div>
                <p className={item.feito ? 'text-sm font-semibold text-slate-400 line-through' : 'text-sm font-semibold text-navy-600'}>
                  {item.titulo}
                </p>
                <p className="mt-1 text-sm text-slate-500">{item.texto}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="cf-card p-6">
        <h2 className="font-semibold text-navy-600">Próximos passos</h2>
        <ol className="mt-5 space-y-4">
          {passos.map((passo) => (
            <li key={passo.titulo} className="flex items-start gap-4">
              <span
                className={
                  passo.feito
                    ? 'mt-0.5 text-green-500'
                    : 'mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-slate-300'
                }
                aria-hidden="true"
              >
                {passo.feito && <CheckCircle2 className="h-5 w-5" />}
              </span>
              <div className="flex-1">
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
    </div>
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
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-navy-600">
          Olá, {nome.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-slate-500">Visão geral da plataforma</p>
      </header>

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
          <section>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
              Ações urgentes
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Indicador rotulo="KYC pendente" valor={resumo.verificacoes_pendentes} />
              <Indicador rotulo="Pagamentos pendentes" valor={resumo.pagamentos_pendentes} />
              <Indicador rotulo="Documentos por revisar" valor={resumo.documentos_pendentes} />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
              Atividade
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Indicador rotulo="Cargas publicadas" valor={ind.cargas_publicadas} />
              <Indicador rotulo="Em curso" valor={ind.cargas_em_curso} />
              <Indicador rotulo="Concluídas" valor={ind.cargas_concluidas} />
              <Indicador rotulo="Viagens ativas" valor={ind.viagens_ativas} />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
              Marketplace
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Indicador rotulo="Correspondências" valor={ind.correspondencias} />
              <Indicador rotulo="Propostas pendentes" valor={ind.propostas_pendentes} />
              <Indicador rotulo="Acordos fechados" valor={ind.acordos} />
              <Indicador
                rotulo="Valor transacionado"
                valor={formatCurrency(Number(ind.valor_transacionado))}
              />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
              Comunidade
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Indicador rotulo="Utilizadores" valor={ind.utilizadores_total} />
              <Indicador rotulo="Empresas" valor={ind.empresas} />
              <Indicador rotulo="Veículos" valor={ind.veiculos} />
              <Indicador
                rotulo="Avaliação média"
                valor={ind.avaliacao_media ? `${ind.avaliacao_media} ★` : '—'}
              />
            </div>
          </section>
        </>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <AtalhoCartao
          href="/admin/verificacoes"
          icone={ShieldAlert}
          titulo="Verificações"
          texto="Aprovar ou rejeitar contas e documentos."
        />
        <AtalhoCartao
          href="/admin/operacoes"
          icone={Package}
          titulo="Operações"
          texto="Supervisionar todas as cargas da plataforma."
        />
      </section>
    </div>
  );
}

function Indicador({ rotulo, valor }: { rotulo: string; valor: string | number }) {
  return (
    <div className="cf-card p-5">
      <p className="text-xs uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className="mt-2 text-2xl font-bold text-navy-600">{valor}</p>
    </div>
  );
}

function AtalhoCartao({
  href,
  icone: Icone,
  titulo,
  texto,
}: {
  href: string;
  icone: any;
  titulo: string;
  texto: string;
}) {
  return (
    <Link href={href} className="cf-card-interactive block p-5">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-500">
        <Icone className="h-5 w-5" aria-hidden="true" />
      </span>
      <h3 className="mt-4 font-semibold text-navy-600">{titulo}</h3>
      <p className="mt-1 text-sm text-slate-500">{texto}</p>
    </Link>
  );
}
