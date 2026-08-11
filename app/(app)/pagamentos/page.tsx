import Link from 'next/link';
import {
  estadoKycPagamentos,
  listarAcordosParaPagamento,
  listarHistoricoPagamentos,
  type PagamentoHistorico,
} from '@/lib/pagamentos/actions';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrency } from '@/lib/utils';
import { Wallet, BadgeCheck } from 'lucide-react';
import { CartaoPagamento } from './cartao-pagamento';

export const metadata = { title: 'Pagamentos' };

type SearchParams = {
  sucesso?: string;
  erro?: string;
  cancelado?: string;
};

function mensagemErro(codigo?: string) {
  if (!codigo) return null;
  const mapa: Record<string, string> = {
    acordo_invalido: 'Acordo inválido para pagamento.',
    sem_permissao: 'Não tem permissão para este pagamento.',
    valor_invalido: 'O valor do pagamento é inválido.',
    stripe_nao_configurado: 'Stripe não configurado no ambiente.',
    stripe_sem_url: 'Não foi possível iniciar o checkout Stripe.',
    kyc_pendente: 'Complete a verificação da conta para desbloquear pagamentos.',
  };
  return mapa[codigo] ?? 'Não foi possível iniciar o pagamento.';
}

export default async function PaginaPagamentos({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [acordos, historico, estadoKyc] = await Promise.all([
    listarAcordosParaPagamento(),
    listarHistoricoPagamentos(),
    estadoKycPagamentos(),
  ]);
  const sp = await searchParams;

  const erro = mensagemErro(sp.erro);
  const sucessoStripe = sp.sucesso === 'stripe';
  const canceladoStripe = sp.cancelado === 'stripe';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-navy-600">Pagamentos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cobrança de acordos via Stripe e referência Multicaixa.
        </p>
      </header>

      {sucessoStripe && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          Pagamento Stripe concluído. Pode validar o estado no seu extrato.
        </div>
      )}

      {canceladoStripe && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Pagamento Stripe cancelado. Pode tentar novamente quando quiser.
        </div>
      )}

      {erro && (
        <div role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {erro}
        </div>
      )}

      <div className="cf-card p-5 text-sm text-slate-600">
        <div className="flex items-start gap-3">
          <BadgeCheck className="mt-0.5 h-4 w-4 text-brand-500" aria-hidden="true" />
          <p>
            Nesta fase, o pagamento é iniciado na plataforma e conciliado
            externamente. A reconciliação automática em carteira/escrow entra na Fase 2.
          </p>
        </div>
      </div>

      {estadoKyc.bloqueado && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {estadoKyc.mensagem}
        </div>
      )}

      {acordos.length === 0 ? (
        <EmptyState
          icone={Wallet}
          titulo="Sem acordos para pagar"
          texto="Quando um acordo for fechado, ele aparece aqui para pagamento."
          accao={{ href: '/painel', rotulo: 'Voltar ao painel' }}
        />
      ) : (
        <div className="space-y-4">
          {acordos.map((a) => {
            const valor = Number(a.platform_fee || 0) > 0
              ? Number(a.platform_fee)
              : Number(a.agreed_amount || 0);

            return (
              <CartaoPagamento
                key={a.id}
                agreementId={a.id}
                referenciaCarga={a.load?.reference || a.id.slice(0, 8)}
                tituloCarga={a.load?.title || 'Carga sem título'}
                referenciaViagem={a.trip?.reference || '-'}
                valor={valor}
                moeda={a.currency || 'AOA'}
                bloqueado={estadoKyc.bloqueado}
              />
            );
          })}
        </div>
      )}

      <p className="text-xs text-slate-500">
        Precisa de apoio para integração Multicaixa Express?{' '}
        <Link href="/mensagens" className="font-semibold text-brand-500 hover:underline">
          Fale com a equipa
        </Link>
        .
      </p>

      <HistoricoPagamentos historico={historico} />
    </div>
  );
}

function badgeStatus(status: PagamentoHistorico['status']) {
  if (status === 'PAID') return 'cf-badge-done';
  if (status === 'FAILED' || status === 'CANCELLED') return 'cf-badge-idle';
  if (status === 'EXPIRED') return 'cf-badge-delayed';
  return 'cf-badge-transit';
}

function statusPt(status: PagamentoHistorico['status']) {
  if (status === 'PAID') return 'Pago';
  if (status === 'FAILED') return 'Falhou';
  if (status === 'CANCELLED') return 'Cancelado';
  if (status === 'EXPIRED') return 'Expirado';
  return 'Pendente';
}

function extrairReferencia(p: PagamentoHistorico, chave: 'load_reference' | 'trip_reference') {
  const valor = p.metadata?.[chave];
  return typeof valor === 'string' && valor.trim().length > 0 ? valor : '-';
}

function extrairLiquidacao(p: PagamentoHistorico) {
  if (p.paid_at) return `Pago em ${new Date(p.paid_at).toLocaleString('pt-AO')}`;
  if (p.expires_at && p.status === 'PENDING') {
    return `Expira em ${new Date(p.expires_at).toLocaleString('pt-AO')}`;
  }
  return '—';
}

function HistoricoPagamentos({ historico }: { historico: PagamentoHistorico[] }) {
  return (
    <section className="cf-card overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="font-semibold text-navy-600">Histórico de pagamentos</h2>
        <p className="text-sm text-slate-500">Últimos movimentos e estado de reconciliação.</p>
      </div>

      {historico.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500">Ainda não há pagamentos registados.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Data</th>
                <th className="px-5 py-3">Acordo</th>
                <th className="px-5 py-3">Provedor</th>
                <th className="px-5 py-3">Valor</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3">Referência</th>
                <th className="px-5 py-3">Liquidação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historico.map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-3 text-slate-600">
                    {new Date(p.created_at).toLocaleString('pt-AO')}
                  </td>
                  <td className="px-5 py-3 text-slate-600">
                    <p className="font-mono text-xs text-slate-500">{p.agreement_id.slice(0, 8)}</p>
                    <p className="mt-0.5 text-xs">
                      Carga {extrairReferencia(p, 'load_reference')} · Viagem{' '}
                      {extrairReferencia(p, 'trip_reference')}
                    </p>
                  </td>
                  <td className="px-5 py-3 font-medium text-navy-600">{p.provider}</td>
                  <td className="px-5 py-3 text-slate-600">
                    {formatCurrency(Number(p.amount || 0), p.currency || 'AOA')}
                  </td>
                  <td className="px-5 py-3">
                    <span className={badgeStatus(p.status)}>{statusPt(p.status)}</span>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">
                    {p.external_reference || '-'}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">{extrairLiquidacao(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}