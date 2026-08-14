import { listarCarteira, pedirLevantamento } from '@/lib/wallet/actions';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrency } from '@/lib/utils';
import { PiggyBank, Clock, CheckCircle2 } from 'lucide-react';

export const metadata = { title: 'Carteira' };

type SearchParams = { sucesso?: string; erro?: string };

function mensagemErro(codigo?: string) {
  if (!codigo) return null;
  const mapa: Record<string, string> = {
    sem_saldo: 'Não há saldo disponível para levantar.',
    falha_leitura: 'Não foi possível verificar o saldo disponível.',
    falha_pedido: 'Não foi possível registar o pedido de levantamento.',
  };
  return mapa[codigo] ?? 'Não foi possível concluir o pedido.';
}

function badgeStatus(status: string) {
  const base = 'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium';
  const mapa: Record<string, string> = {
    RETIDO: `${base} bg-amber-100 text-amber-800`,
    DISPONIVEL: `${base} bg-green-100 text-green-800`,
    LEVANTAMENTO_PEDIDO: `${base} bg-blue-100 text-blue-800`,
    LEVANTADO: `${base} bg-slate-100 text-slate-600`,
    REEMBOLSADO: `${base} bg-red-100 text-red-700`,
  };
  return mapa[status] ?? base;
}

function textoStatus(status: string) {
  const mapa: Record<string, string> = {
    RETIDO: 'Retido até entrega',
    DISPONIVEL: 'Disponível',
    LEVANTAMENTO_PEDIDO: 'Levantamento pedido',
    LEVANTADO: 'Levantado',
    REEMBOLSADO: 'Reembolsado',
  };
  return mapa[status] ?? status;
}

export default async function PaginaCarteira({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { linhas, saldo } = await listarCarteira();
  const sp = await searchParams;
  const erro = mensagemErro(sp.erro);
  const sucesso = sp.sucesso === 'levantamento';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-navy-600">Carteira</h1>
        <p className="mt-1 text-sm text-slate-500">
          O valor de cada pagamento fica retido até a entrega ser confirmada, depois fica disponível para
          levantar.
        </p>
      </header>

      {sucesso && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          Pedido de levantamento registado. A equipa processa a transferência em breve.
        </div>
      )}

      {erro && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="cf-card p-5">
          <div className="flex items-center gap-2 text-amber-700">
            <Clock className="h-4 w-4" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-wide">Retido</p>
          </div>
          <p className="mt-2 text-2xl font-bold text-navy-600">
            {formatCurrency(saldo.retido, saldo.moeda)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Aguarda confirmação de entrega.</p>
        </div>

        <div className="cf-card p-5">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-wide">Disponível</p>
          </div>
          <p className="mt-2 text-2xl font-bold text-navy-600">
            {formatCurrency(saldo.disponivel, saldo.moeda)}
          </p>
          {saldo.disponivel > 0 && (
            <form action={pedirLevantamento} className="mt-3">
              <button
                type="submit"
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
              >
                Pedir levantamento
              </button>
            </form>
          )}
        </div>

        <div className="cf-card p-5">
          <div className="flex items-center gap-2 text-slate-500">
            <PiggyBank className="h-4 w-4" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-wide">Já levantado</p>
          </div>
          <p className="mt-2 text-2xl font-bold text-navy-600">
            {formatCurrency(saldo.levantado, saldo.moeda)}
          </p>
          {saldo.levantamentoPedido > 0 && (
            <p className="mt-1 text-xs text-blue-700">
              +{formatCurrency(saldo.levantamentoPedido, saldo.moeda)} em processamento
            </p>
          )}
        </div>
      </div>

      <section className="cf-card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-navy-600">Movimentos</h2>
          <p className="text-sm text-slate-500">Cada linha corresponde a um pagamento recebido.</p>
        </div>

        {linhas.length === 0 ? (
          <EmptyState
            icone={PiggyBank}
            titulo="Ainda não há movimentos"
            texto="Quando um pagamento for confirmado, aparece aqui como retido até a entrega ser confirmada."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Data</th>
                  <th className="px-5 py-3">Operação</th>
                  <th className="px-5 py-3">Valor</th>
                  <th className="px-5 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {linhas.map((l) => (
                  <tr key={l.id}>
                    <td className="px-5 py-3 text-slate-600">
                      {new Date(l.created_at).toLocaleString('pt-AO')}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {l.agreement?.load?.reference ?? '-'} · {l.agreement?.load?.title ?? ''}
                      {l.agreement?.trip?.reference && (
                        <span className="block text-xs text-slate-400">
                          Viagem {l.agreement.trip.reference}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 font-medium text-navy-600">
                      {formatCurrency(Number(l.amount), l.currency)}
                    </td>
                    <td className="px-5 py-3">
                      <span className={badgeStatus(l.status)}>{textoStatus(l.status)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
