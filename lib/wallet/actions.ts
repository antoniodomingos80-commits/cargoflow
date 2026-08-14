'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient, getSessionProfile } from '@/lib/supabase/server';

export type LinhaCarteira = {
  id: string;
  amount: number;
  currency: string;
  status: 'RETIDO' | 'DISPONIVEL' | 'LEVANTAMENTO_PEDIDO' | 'LEVANTADO' | 'REEMBOLSADO';
  disponivel_em: string | null;
  levantado_em: string | null;
  created_at: string;
  agreement: {
    load: { reference: string; title: string } | null;
    trip: { reference: string } | null;
  } | null;
};

export type SaldoCarteira = {
  retido: number;
  disponivel: number;
  levantamentoPedido: number;
  levantado: number;
  moeda: string;
};

/**
 * A retenção e a libertação são automáticas (triggers cf_trigger_wallet_hold
 * e cf_trigger_wallet_release na base de dados, disparados quando um
 * pagamento fica PAID e quando uma carga fica CONFIRMED, respetivamente).
 * Este ficheiro só lê o estado já calculado e trata o pedido de
 * levantamento — nunca calcula saldo manualmente no código, para não
 * arriscar divergir da fonte de verdade que é a base de dados.
 */
export async function listarCarteira(): Promise<{
  linhas: LinhaCarteira[];
  saldo: SaldoCarteira;
}> {
  const vazio = { linhas: [], saldo: { retido: 0, disponivel: 0, levantamentoPedido: 0, levantado: 0, moeda: 'AOA' } };

  const perfil = await getSessionProfile();
  if (!perfil) return vazio;

  const supabase = createClient();
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select(
      'id, amount, currency, status, disponivel_em, levantado_em, created_at, ' +
        'agreement:agreements!wallet_transactions_agreement_id_fkey(' +
        'load:loads!agreements_load_id_fkey(reference, title), ' +
        'trip:trips!agreements_trip_id_fkey(reference))',
    )
    .order('created_at', { ascending: false })
    .limit(100);

  if (error || !data) {
    console.error('Erro ao listar carteira:', error?.message);
    return vazio;
  }

  const linhas = data as unknown as LinhaCarteira[];
  const moeda = linhas[0]?.currency ?? 'AOA';

  const somar = (status: LinhaCarteira['status']) =>
    linhas.filter((l) => l.status === status).reduce((s, l) => s + Number(l.amount), 0);

  return {
    linhas,
    saldo: {
      retido: somar('RETIDO'),
      disponivel: somar('DISPONIVEL'),
      levantamentoPedido: somar('LEVANTAMENTO_PEDIDO'),
      levantado: somar('LEVANTADO'),
      moeda,
    },
  };
}

/**
 * Marca todas as linhas DISPONIVEL do tenant como LEVANTAMENTO_PEDIDO.
 *
 * Isto não move dinheiro nenhum — não há ainda uma integração bancária de
 * saída configurada. Fica registado como pedido, para um administrador
 * processar manualmente a transferência e só depois marcar como LEVANTADO
 * (ação a construir a seguir, do lado do admin).
 */
export async function pedirLevantamento(): Promise<void> {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const supabase = createClient();
  const { data: disponiveis, error: erroLeitura } = await supabase
    .from('wallet_transactions')
    .select('id')
    .eq('tenant_id', perfil.tenant.id)
    .eq('status', 'DISPONIVEL');

  if (erroLeitura) redirect('/carteira?erro=falha_leitura');
  if (!disponiveis || disponiveis.length === 0) {
    redirect('/carteira?erro=sem_saldo');
  }

  const { error } = await supabase
    .from('wallet_transactions')
    .update({ status: 'LEVANTAMENTO_PEDIDO' })
    .in(
      'id',
      disponiveis.map((d) => d.id),
    );

  if (error) redirect('/carteira?erro=falha_pedido');

  revalidatePath('/carteira');
  redirect('/carteira?sucesso=levantamento');
}
