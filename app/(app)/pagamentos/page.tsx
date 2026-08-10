import Link from 'next/link';
import { listarAcordosParaPagamento } from '@/lib/pagamentos/actions';
import { EmptyState } from '@/components/ui/empty-state';
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
  };
  return mapa[codigo] ?? 'Não foi possível iniciar o pagamento.';
}

export default async function PaginaPagamentos({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const acordos = await listarAcordosParaPagamento();
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
    </div>
  );
}