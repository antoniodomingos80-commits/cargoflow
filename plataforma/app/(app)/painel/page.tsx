import { getSessionProfile } from '@/lib/supabase/server';
import { indicadoresPlataforma, verificacoesPendentes } from '@/lib/admin/actions';
import { ROLE_LABELS } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  Package, Truck, MapPin, ShieldAlert, ArrowRight, CheckCircle2,
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
          feito: false,
          accao: { href: '/frota', rotulo: 'Adicionar veículo' },
        }
      : {
          titulo: 'Publicar a primeira carga',
          texto: 'Indique origem, destino e peso — leva menos de um minuto.',
          feito: false,
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

      <section className="cf-card p-6">
        <h2 className="font-semibold text-navy-600">Primeiros passos</h2>
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
  const [ind, pendentes] = await Promise.all([
    indicadoresPlataforma(),
    verificacoesPendentes(),
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
